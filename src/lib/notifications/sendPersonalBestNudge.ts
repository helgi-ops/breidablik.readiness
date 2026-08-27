import "server-only";

/**
 * Personal-best detection + celebratory push. A small motivation loop:
 *   1. Find players with a recent CMJ test, load their full jump history.
 *   2. Detect a genuine jump-height PB (detectCmjPersonalBest — conservative).
 *   3. Record it in player_test_personal_bests (drives the in-app card too);
 *      the unique (player, metric, test_id) key makes re-runs idempotent.
 *   4. Push to opted-in players who have an active subscription, then stamp
 *      push_notified_at so nobody is pinged twice.
 *
 * Opt-in only (player_notification_preferences.personal_best = true; off by
 * default). Mirrors sendDailyNudge's send / token-cleanup machinery.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { isSubscriptionGone, sendWebPush, type NativePushSubscription } from "@/lib/push/webPush";
import { detectPersonalBest, pbPushCopy, type PbMetric, type TestBest, type PersonalBest } from "@/lib/micropulse/personalBest";
import { classifyBatteryTestType } from "@/lib/integrations/vald/battery";

type Row = Record<string, unknown>;
type Detected = { playerId: string; pb: PersonalBest };
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** ISO `days` before `nowIso`. */
function isoDaysBefore(nowIso: string, days: number): string {
  const d = new Date(nowIso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Group per-player rows into one best TestBest per test (max value across the
 *  test's trials/limbs). `raw_test_id` is the test identity; falls back to date. */
function bestPerTest(rows: Row[], valueOf: (r: Row) => number | null): Map<string, TestBest[]> {
  const byPlayer = new Map<string, Map<string, TestBest>>();
  for (const r of rows) {
    const pid = String(r.microplayer_id ?? ""); const at = String(r.test_timestamp ?? ""); const v = valueOf(r);
    if (!pid || !at || v == null || !(v > 0)) continue;
    const testId = (r.raw_test_id as string | null) || `date:${at.slice(0, 10)}`;
    let tests = byPlayer.get(pid); if (!tests) { tests = new Map(); byPlayer.set(pid, tests); }
    const prev = tests.get(testId);
    if (!prev || v > prev.value) tests.set(testId, { testId, at, value: v });
    else if (at < prev.at) tests.set(testId, { ...prev, at }); // keep the test's earliest timestamp
  }
  const out = new Map<string, TestBest[]>();
  for (const [pid, tests] of byPlayer) out.set(pid, Array.from(tests.values()));
  return out;
}

function detectAll(metric: PbMetric, byPlayer: Map<string, TestBest[]>, now: string, recencyDays: number): Detected[] {
  const out: Detected[] = [];
  for (const [pid, tests] of byPlayer) { const pb = detectPersonalBest(metric, tests, { now, recencyDays }); if (pb) out.push({ playerId: pid, pb }); }
  return out;
}

const uniqIds = (rows: Row[] | null | undefined) => Array.from(new Set(((rows ?? []) as Row[]).map((r) => String(r.microplayer_id ?? "")).filter(Boolean)));

// ── Per-metric detectors (each: recent candidates → full history → detect) ──

async function detectCmj(sb: SupabaseClient, since: string, teamId: string | undefined, now: string, recencyDays: number): Promise<{ candidates: string[]; detected: Detected[] }> {
  let q = sb.from("vald_forcedecks_results").select("microplayer_id").gte("test_timestamp", since).not("jump_height_cm", "is", null).not("microplayer_id", "is", null);
  if (teamId) q = q.eq("team_id", teamId);
  const { data: recent } = await q;
  const ids = uniqIds(recent);
  if (!ids.length) return { candidates: [], detected: [] };
  const history = await fetchAllPages<Row>((from, to) =>
    sb.from("vald_forcedecks_results").select("microplayer_id, raw_test_id, test_timestamp, jump_height_cm")
      .in("microplayer_id", ids).not("jump_height_cm", "is", null).order("test_timestamp", { ascending: true }).range(from, to));
  return { candidates: ids, detected: detectAll("cmj_jump_height", bestPerTest(history, (r) => num(r.jump_height_cm)), now, recencyDays) };
}

async function detectNordic(sb: SupabaseClient, since: string, teamId: string | undefined, now: string, recencyDays: number): Promise<{ candidates: string[]; detected: Detected[] }> {
  const bestOf = (r: Row) => { const l = num(r.left_peak_force_n), rr = num(r.right_peak_force_n); const vs = [l, rr].filter((x): x is number => x != null); return vs.length ? Math.max(...vs) : null; };
  let q = sb.from("vald_nordbord_results").select("microplayer_id").gte("test_timestamp", since).not("microplayer_id", "is", null);
  if (teamId) q = q.eq("team_id", teamId);
  const { data: recent } = await q;
  const ids = uniqIds(recent);
  if (!ids.length) return { candidates: [], detected: [] };
  const history = await fetchAllPages<Row>((from, to) =>
    sb.from("vald_nordbord_results").select("microplayer_id, raw_test_id, test_timestamp, left_peak_force_n, right_peak_force_n")
      .in("microplayer_id", ids).order("test_timestamp", { ascending: true }).range(from, to));
  return { candidates: ids, detected: detectAll("nordic_peak_force", bestPerTest(history, bestOf), now, recencyDays) };
}

async function detectImtp(sb: SupabaseClient, since: string, teamId: string | undefined, now: string, recencyDays: number): Promise<{ candidates: string[]; detected: Detected[] }> {
  // IMTP peak force = PEAK_VERTICAL_FORCE, but that code is shared with iso-squat
  // tests → keep only rows whose test_type classifies to IMTP.
  const isImtp = (r: Row) => classifyBatteryTestType(String(r.test_type ?? "")) === "IMTP";
  let q = sb.from("vald_test_metrics").select("microplayer_id, test_type").gte("test_timestamp", since).eq("metric_code", "PEAK_VERTICAL_FORCE").not("microplayer_id", "is", null);
  if (teamId) q = q.eq("team_id", teamId);
  const { data: recent } = await q;
  const ids = uniqIds(((recent ?? []) as Row[]).filter(isImtp));
  if (!ids.length) return { candidates: [], detected: [] };
  const history = (await fetchAllPages<Row>((from, to) =>
    sb.from("vald_test_metrics").select("microplayer_id, raw_test_id, test_timestamp, test_type, value")
      .in("microplayer_id", ids).eq("metric_code", "PEAK_VERTICAL_FORCE").order("test_timestamp", { ascending: true }).range(from, to)))
    .filter(isImtp);
  return { candidates: ids, detected: detectAll("imtp_peak_force", bestPerTest(history, (r) => num(r.value)), now, recencyDays) };
}

export type PersonalBestRunResult = {
  candidates: number; detected: number; recorded: number;
  opted_in: number; attempted: number; sent: number; failed: number;
  skipped_no_token: number; skipped_not_opted_in: number; removed_invalid: number;
};

export async function runPersonalBestDetection(
  sb: SupabaseClient,
  args: { now: string; recencyDays?: number; lang?: "en" | "is"; teamId?: string; writeOnly?: boolean },
): Promise<PersonalBestRunResult> {
  const recencyDays = args.recencyDays ?? 3;
  const lang = args.lang ?? "en"; // match the existing push nudges (English)
  const since = isoDaysBefore(args.now, recencyDays);
  const zero: PersonalBestRunResult = { candidates: 0, detected: 0, recorded: 0, opted_in: 0, attempted: 0, sent: 0, failed: 0, skipped_no_token: 0, skipped_not_opted_in: 0, removed_invalid: 0 };

  // 1-3. Detect PBs across all three disciplines (CMJ jump height, Nordic peak
  //       force, IMTP peak force). Each is scoped to the team when requested.
  const [cmj, nordic, imtp] = await Promise.all([
    detectCmj(sb, since, args.teamId, args.now, recencyDays),
    detectNordic(sb, since, args.teamId, args.now, recencyDays),
    detectImtp(sb, since, args.teamId, args.now, recencyDays),
  ]);
  const detected: Detected[] = [...cmj.detected, ...nordic.detected, ...imtp.detected];
  const candidateCount = new Set([...cmj.candidates, ...nordic.candidates, ...imtp.candidates]).size;
  if (!detected.length) return { ...zero, candidates: candidateCount };

  // Resolve team ids for the recorded rows.
  const playerIds = detected.map((d) => d.playerId);
  const { data: playerRows } = await sb.from("players").select("id, team_id").in("id", playerIds);
  const teamByPlayer = new Map<string, string | null>();
  for (const p of (playerRows ?? []) as Row[]) teamByPlayer.set(String(p.id), (p.team_id as string | null) ?? null);

  // 4. Record (idempotent — ON CONFLICT DO NOTHING keeps existing push state).
  const rows = detected.map((d) => ({
    player_id: d.playerId, team_id: teamByPlayer.get(d.playerId) ?? null, metric: d.pb.metric,
    value: d.pb.value, unit: d.pb.unit, prior_best: d.pb.priorBest, improvement: d.pb.improvement,
    test_id: d.pb.testId, achieved_at: d.pb.achievedAt,
  }));
  await sb.from("player_test_personal_bests").upsert(rows, { onConflict: "player_id,metric,test_id", ignoreDuplicates: true });

  // Write-only mode (e.g. the sync hook): record the PB — which lights up the
  // coach's CMJ table and the player's in-app card immediately — but leave the
  // push to the daily cron so notifications stay in courteous hours.
  if (args.writeOnly) return { ...zero, candidates: candidateCount, detected: detected.length, recorded: rows.length };

  // 5. Push — pending (never-pushed) PB rows in the recency window.
  const { data: pendingRows } = await sb.from("player_test_personal_bests")
    .select("id, player_id, metric, value, unit, prior_best, improvement, achieved_at, test_id")
    .in("player_id", playerIds).is("push_notified_at", null).gte("achieved_at", since);
  const pending = (pendingRows ?? []) as Row[];
  if (!pending.length) return { ...zero, candidates: candidateCount, detected: detected.length, recorded: rows.length };

  // Opt-in gate.
  const { data: prefs } = await sb.from("player_notification_preferences").select("player_id")
    .eq("notification_type", "personal_best").eq("enabled", true).in("player_id", playerIds);
  const optedIn = new Set(((prefs ?? []) as Row[]).map((p) => String(p.player_id)));

  // Latest active push subscription per player.
  const subsByPlayer = new Map<string, { id: string; sub: NativePushSubscription }>();
  {
    const { data: subs } = await sb.from("player_push_subscriptions")
      .select("id, player_id, endpoint, p256dh, auth, updated_at")
      .eq("is_active", true).in("player_id", playerIds).order("updated_at", { ascending: false });
    for (const s of (subs ?? []) as Row[]) {
      const pid = String(s.player_id ?? "");
      if (!pid || subsByPlayer.has(pid) || !s.endpoint || !s.p256dh || !s.auth) continue;
      subsByPlayer.set(pid, { id: String(s.id), sub: { endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) } });
    }
  }

  let optedInCount = 0, attempted = 0, sent = 0, failed = 0, skippedNoToken = 0, skippedNotOptedIn = 0;
  const invalidSubs = new Set<string>();
  const notifiedRowIds: string[] = [];

  for (const row of pending) {
    const pid = String(row.player_id);
    if (!optedIn.has(pid)) { skippedNotOptedIn++; continue; }
    optedInCount++;
    const sub = subsByPlayer.get(pid);
    if (!sub) { skippedNoToken++; continue; }
    const pb: PersonalBest = {
      metric: (row.metric as PersonalBest["metric"]) ?? "cmj_jump_height",
      value: num(row.value) ?? 0, unit: String(row.unit ?? "cm"),
      priorBest: num(row.prior_best) ?? 0, improvement: num(row.improvement) ?? 0,
      improvementPct: 0, achievedAt: String(row.achieved_at ?? ""), testId: String(row.test_id ?? ""),
    };
    const copy = pbPushCopy(pb, lang);
    attempted++;
    try {
      await sendWebPush(sub.sub, { ...copy, url: "/player", type: "personal_best", screen: "player" });
      sent++; notifiedRowIds.push(String(row.id));
    } catch (error) {
      failed++;
      if (isSubscriptionGone(error)) invalidSubs.add(sub.id);
    }
  }

  if (notifiedRowIds.length) {
    await sb.from("player_test_personal_bests").update({ push_notified_at: new Date().toISOString() }).in("id", notifiedRowIds);
  }
  let removedInvalid = 0;
  if (invalidSubs.size) {
    const ids = Array.from(invalidSubs);
    const { error } = await sb.from("player_push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", ids);
    if (!error) removedInvalid = ids.length;
  }

  return { candidates: candidateCount, detected: detected.length, recorded: rows.length, opted_in: optedInCount, attempted, sent, failed, skipped_no_token: skippedNoToken, skipped_not_opted_in: skippedNotOptedIn, removed_invalid: removedInvalid };
}
