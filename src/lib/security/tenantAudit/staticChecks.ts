import { makeFinding } from "./fingerprint";
import type { Finding } from "./types";

/**
 * Source-level tenant-isolation checks. Pure text analysis, no file system, so each rule is unit-tested on snippets.
 * They are deliberately simple: a finding means "a person should look", and a reviewed exception goes in the
 * allowlist with a reason instead of the rule being loosened.
 */

const AUTH_MARKER =
  /requireCoachAccessForTeam|requireCoachUserId|requireAuthedPlayerId|getUserIdFromBearer|authCoach\(|\.auth\.getUser\(|isCronCall|CRON_SECRET|verifyTerraSignature|WEBHOOK_SECRET|requireAdmin/;

const TEAM_SCOPE_MARKER =
  /requireCoachAccessForTeam|from\(\s*["']coach_teams["']\s*\)|coaches_team|getPlayerTeamId|requireAdmin|isCronCall|CRON_SECRET|resolvePolarTeamId|team_id\s*!==|!==\s*[\w.]*[tT]eam(?:_?[iI]d)?\b/;

const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

const lineAt = (src: string, index: number) => {
  const start = src.lastIndexOf("\n", index) + 1;
  const end = src.indexOf("\n", index);
  return src.slice(start, end === -1 ? undefined : end);
};

/** `resolveImport` returns a directly imported module's source so a shared guard in another file counts. */
export function analyzeRouteSource(file: string, src: string, resolveImport?: (specifier: string) => string | null): Finding[] {
  const findings: Finding[] = [];
  const handler = /export\s+(?:async\s+)?(?:function\s+(GET|POST|PUT|PATCH|DELETE)\b|const\s+(GET|POST|PUT|PATCH|DELETE)\b)/.exec(src);
  if (!handler) return findings;

  let hasAuth = AUTH_MARKER.test(src);
  let hasScope = TEAM_SCOPE_MARKER.test(src);
  if (resolveImport && (!hasAuth || !hasScope)) {
    for (const m of src.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["']/g)) {
      const dep = m[1];
      if (!dep.startsWith(".") && !dep.startsWith("@/")) continue;
      const depSrc = resolveImport(dep);
      if (!depSrc) continue;
      // Only a module that exports a guard counts, not any library that happens to mention one.
      if (/export\s+(?:async\s+)?function\s+\w*(?:auth|Auth|require|Require|authorize|verify|resolve\w*User)\w*/.test(depSrc)) {
        if (AUTH_MARKER.test(depSrc)) hasAuth = true;
        if (TEAM_SCOPE_MARKER.test(depSrc)) hasScope = true;
      }
    }
  }

  if (!hasAuth) {
    findings.push(makeFinding("A_NO_AUTH", "HIGH", file, lineOf(src, handler.index), "API route with no login or secret check.", lineAt(src, handler.index)));
    return findings; // B would only repeat the same problem.
  }

  if (!hasScope) {
    const patterns: Array<{ re: RegExp; team: boolean }> = [
      { re: /searchParams\.get\(\s*["'](teamId|team_id)["']\s*\)/, team: true },
      { re: /\bbody\.(teamId|team_id)\b/, team: true },
      { re: /const\s*\{[^}]*\b(teamId|team_id)\b[^}]*\}\s*=\s*(?:body|await\s+req\.json)/, team: true },
      { re: /searchParams\.get\(\s*["'](playerId|player_id)["']\s*\)/, team: false },
      { re: /\bbody\.(playerId|player_id)\b/, team: false },
      { re: /const\s*\{[^}]*\b(playerId|player_id)\b[^}]*\}\s*=\s*(?:body|await\s+req\.json)/, team: false },
    ];
    for (const { re, team } of patterns) {
      const m = re.exec(src);
      if (!m) continue;
      findings.push(makeFinding(
        "B_UNSCOPED_TENANT_ID",
        team ? "HIGH" : "MEDIUM",
        file,
        lineOf(src, m.index),
        team ? "Takes a team id from the caller without checking access to that team." : "Takes a player id from the caller without checking access to that player's team.",
        lineAt(src, m.index),
      ));
    }
  }
  return findings;
}

const TENANT_FILTER = /\.(?:eq|in|neq|contains|filter)\(\s*["'`](?:team_id|player_id|id|user_id|coach_id|exec_id|athlete_id|owner_id|created_by|client_id|teamId|playerId|microplayer_id|owner_team_id|players\.team_id|profile_id|token|endpoint|vald_athlete_id)["'`]|\.match\(\s*\{|\.or\(/;

/** Finds `.from("table")` reads/changes on tenant tables whose chain has no tenant filter. */
function unfilteredChains(src: string, tenantTables: ReadonlySet<string>): Array<{ index: number; table: string }> {
  const out: Array<{ index: number; table: string }> = [];
  for (const m of src.matchAll(/\.from\(\s*["']([a-z0-9_]+)["']\s*\)/g)) {
    const table = m[1];
    if (!tenantTables.has(table)) continue;
    const start = m.index ?? 0;
    const rest = src.slice(start, start + 2000).replace(/[ \t]*\/\/[^\n]*\n/g, "");
    const end = rest.search(/;|\n\s*\n/);
    const chain = end === -1 ? rest : rest.slice(0, end);
    if (!/\.(select|update|delete)\(/.test(chain)) continue;
    // `.insert(row).select()` only reads back the row it just wrote.
    if (/^\.from\([^)]*\)\s*\.(?:insert|upsert)\(/.test(chain)) continue;
    if (TENANT_FILTER.test(chain)) continue;
    // Count-only `.limit(1)` existence probes still return tenant rows, so they stay findings.
    // `const q = sb.from(...)` followed by `q = q.eq(...)` keeps the filter on a later statement.
    const before = src.slice(Math.max(0, start - 80), start);
    const assigned = /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*\s*$/.exec(before) ?? /(\w+)\s*=\s*(?:await\s+)?[\w.]*\s*$/.exec(before);
    if (assigned) {
      const name = assigned[1];
      const later = src.slice(start, start + 2500);
      const re = new RegExp(`\\b${name}\\b[\\s\\S]{0,120}?${TENANT_FILTER.source}`);
      if (name !== "data" && name !== "error" && re.test(later.slice(chain.length))) continue;
    }
    out.push({ index: start, table });
  }
  return out;
}

export function analyzeServerSource(file: string, src: string, tenantTables: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  const isApi = file.includes("src/app/api/");
  // Admin screens and the jobs that walk every team on purpose. They stay in the report, rated low.
  const isTrusted = /src\/app\/api\/admin\/|\/cron\/|\/daily-sync\/|national|demo|seed|src\/lib\/(?:notifications|reminders|recovery|push)\//i.test(file);

  for (const m of src.matchAll(/if\s*\(\s*teamId\s*\)[^\n]*\.eq\(\s*["']team_id["']|teamId\s*\?[^\n]*\.eq\(\s*["']team_id["']/g)) {
    findings.push(makeFinding("C_OPTIONAL_TEAM_FILTER", "MEDIUM", file, lineOf(src, m.index ?? 0), "The team filter is skipped when teamId is empty, which reads every team.", lineAt(src, m.index ?? 0)));
  }
  for (const { index, table } of unfilteredChains(src, tenantTables)) {
    findings.push(makeFinding(
      "D_UNFILTERED_TEAM_TABLE",
      isTrusted ? "LOW" : isApi ? "HIGH" : "MEDIUM",
      file,
      lineOf(src, index),
      `Query on ${table} with no team or player filter.`,
      `${table}: ${lineAt(src, index)}`,
    ));
  }
  return findings;
}

export function analyzeLibSource(file: string, src: string, tenantTables: ReadonlySet<string>): Finding[] {
  const findings = analyzeServerSource(file, src, tenantTables);
  for (const m of src.matchAll(/^(?:export\s+)?(?:let|var)\s+\w+/gm)) {
    findings.push(makeFinding("F_MODULE_LET", "MEDIUM", file, lineOf(src, m.index ?? 0), "Module-level mutable state can carry one team's data into another team's request.", lineAt(src, m.index ?? 0)));
  }
  return findings;
}

const NAME_ONLY_PAYLOAD = /^\s*\{\s*(?:(?:full_name|display_name)\s*(?::[^,}]+)?\s*,?\s*)+\}\s*$/;

export function analyzeClientSource(file: string, src: string, tenantTables: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  if (!/^\s*["']use client["']/.test(src)) return findings;

  for (const m of src.matchAll(/\.from\(\s*["']profiles["']\s*\)\s*\.(update|upsert|insert|delete)\s*\(([^)]*)\)?/g)) {
    if (m[1] === "update" && NAME_ONLY_PAYLOAD.test(m[2])) continue;
    findings.push(makeFinding("E2_CLIENT_PROFILES_WRITE", "HIGH", file, lineOf(src, m.index ?? 0), "Browser writes privileged profile columns. Only names may be written from the browser.", lineAt(src, m.index ?? 0)));
  }
  for (const { index, table } of unfilteredChains(src, tenantTables)) {
    findings.push(makeFinding("E_CLIENT_UNSCOPED_QUERY", "MEDIUM", file, lineOf(src, index), `Browser query on ${table} with no team or player filter.`, `${table}: ${lineAt(src, index)}`));
  }
  for (const m of src.matchAll(/\bfetch\(\s*[`"']\/api\//g)) {
    const call = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
    if (/Authorization|authorization|\bheaders\s*[,}]|headers:\s*(?:await\s+)?\w*[Hh]eaders/.test(call)) continue;
    findings.push(makeFinding("G_FETCH_WITHOUT_BEARER", "LOW", file, lineOf(src, m.index ?? 0), "Browser call to the API without the login token (use authFetch).", lineAt(src, m.index ?? 0)));
  }
  return findings;
}
