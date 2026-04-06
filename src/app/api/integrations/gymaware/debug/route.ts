import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/integrations/gymaware/debug?teamId=...
 *
 * Diagnostic endpoint: tests the GymAware API connection and returns raw debug info.
 */
export async function GET(req: Request) {
  const debug: Record<string, unknown> = { timestamp: new Date().toISOString() };

  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId required", debug });
    }

    const sb = getSupabaseAdmin();

    // 1. Load settings
    const { data: settings, error: settingsErr } = await sb
      .from("gymaware_settings")
      .select("account_id, api_token, reference_exercise, sync_enabled, last_sync_at")
      .eq("team_id", teamId)
      .single();

    debug.settingsFound = !!settings;
    debug.settingsError = settingsErr?.message ?? null;
    debug.lastSyncAt = settings?.last_sync_at ?? null;
    debug.referenceExercise = settings?.reference_exercise ?? null;

    if (!settings) {
      return NextResponse.json({ error: "No GymAware settings", debug });
    }

    const accountId = settings.account_id;
    const apiToken = settings.api_token;
    debug.accountId = accountId;
    debug.apiTokenLength = apiToken?.length ?? 0;

    const credentials = Buffer.from(`${accountId}:${apiToken}`).toString("base64");
    const baseUrl = "https://cloud.gymaware.com";

    // 2. Test athletes endpoint
    debug.athletesUrl = `${baseUrl}/api/athletes`;
    try {
      const athleteRes = await fetch(`${baseUrl}/api/athletes`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      });

      debug.athletesStatus = athleteRes.status;
      debug.athletesStatusText = athleteRes.statusText;
      debug.athletesContentType = athleteRes.headers.get("content-type");
      debug.athletesHeaders = Object.fromEntries(athleteRes.headers.entries());

      const athleteText = await athleteRes.text();
      debug.athletesResponseLength = athleteText.length;
      debug.athletesResponseFirst1000 = athleteText.slice(0, 1000);

      // Try parse as NDJSON
      const lines = athleteText.split("\n").filter((l) => l.trim().length > 0);
      debug.athletesLineCount = lines.length;

      // Try parse as regular JSON array
      try {
        const jsonArray = JSON.parse(athleteText);
        debug.athletesParsedAsJsonArray = true;
        debug.athletesJsonArrayLength = Array.isArray(jsonArray) ? jsonArray.length : "not an array";
        debug.athletesFirstTwo = Array.isArray(jsonArray) ? jsonArray.slice(0, 2) : jsonArray;
      } catch {
        debug.athletesParsedAsJsonArray = false;
        // Try NDJSON
        const objects: unknown[] = [];
        for (const line of lines) {
          try { objects.push(JSON.parse(line)); } catch { /* skip */ }
        }
        debug.athletesNdjsonParsed = objects.length;
        debug.athletesFirstTwo = objects.slice(0, 2);
      }
    } catch (err) {
      debug.athletesFetchError = err instanceof Error ? err.message : String(err);
    }

    // 3. Test summaries endpoint (last 7 days)
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 86400;
    const summariesUrl = `${baseUrl}/api/summaries?start=${sevenDaysAgo}&end=${now}`;
    debug.summariesUrl = summariesUrl;

    try {
      const summRes = await fetch(summariesUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      });

      debug.summariesStatus = summRes.status;
      debug.summariesStatusText = summRes.statusText;
      debug.summariesContentType = summRes.headers.get("content-type");

      const summText = await summRes.text();
      debug.summariesResponseLength = summText.length;
      debug.summariesResponseFirst1000 = summText.slice(0, 1000);

      // Try parse
      const sumLines = summText.split("\n").filter((l) => l.trim().length > 0);
      debug.summariesLineCount = sumLines.length;

      try {
        const jsonArray = JSON.parse(summText);
        debug.summariesParsedAsJsonArray = true;
        debug.summariesJsonArrayLength = Array.isArray(jsonArray) ? jsonArray.length : "not an array";
        debug.summariesFirstItem = Array.isArray(jsonArray) ? jsonArray[0] : null;
      } catch {
        debug.summariesParsedAsJsonArray = false;
        const objects: unknown[] = [];
        for (const line of sumLines) {
          try { objects.push(JSON.parse(line)); } catch { /* skip */ }
        }
        debug.summariesNdjsonParsed = objects.length;
        debug.summariesFirstItem = objects[0] ?? null;
      }
    } catch (err) {
      debug.summariesFetchError = err instanceof Error ? err.message : String(err);
    }

    // 4. Try 28-day range (max allowed by GymAware)
    const twentyEightDaysAgo = now - 28 * 86400;
    const monthUrl = `${baseUrl}/api/summaries?start=${twentyEightDaysAgo}&end=${now}`;
    debug.monthSummariesUrl = monthUrl;

    try {
      const monthRes = await fetch(monthUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      });

      debug.monthSummariesStatus = monthRes.status;
      const monthText = await monthRes.text();
      debug.monthSummariesResponseLength = monthText.length;
      debug.monthSummariesFirst1500 = monthText.slice(0, 1500);

      const monthLines = monthText.split("\n").filter((l) => l.trim().length > 0);
      debug.monthSummariesLineCount = monthLines.length;

      // Parse
      const monthObjects: unknown[] = [];
      for (const line of monthLines) {
        try { monthObjects.push(JSON.parse(line)); } catch { /* skip */ }
      }
      debug.monthSummariesParsed = monthObjects.length;
      debug.monthSummariesFirstItem = monthObjects[0] ?? null;
    } catch (err) {
      debug.monthSummariesFetchError = err instanceof Error ? err.message : String(err);
    }

    // 5. Try modifiedSince=0 to get ALL data ever
    const allDataUrl = `${baseUrl}/api/summaries?modifiedSince=0`;
    debug.allDataUrl = allDataUrl;

    try {
      const allRes = await fetch(allDataUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      });

      debug.allDataStatus = allRes.status;
      const allText = await allRes.text();
      debug.allDataResponseLength = allText.length;
      debug.allDataFirst1500 = allText.slice(0, 1500);

      const allLines = allText.split("\n").filter((l) => l.trim().length > 0);
      debug.allDataLineCount = allLines.length;

      const allObjects: unknown[] = [];
      for (const line of allLines) {
        try { allObjects.push(JSON.parse(line)); } catch { /* skip */ }
      }
      debug.allDataParsed = allObjects.length;
      debug.allDataFirstItem = allObjects[0] ?? null;
    } catch (err) {
      debug.allDataFetchError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({ ok: true, debug });
  } catch (err) {
    debug.fatalError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Debug failed", debug }, { status: 500 });
  }
}
