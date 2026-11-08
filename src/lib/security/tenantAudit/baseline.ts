import type { AllowlistEntry, AuditResult, Baseline, Finding } from "./types";

export function applyAllowlist(findings: Finding[], allowlist: AllowlistEntry[]): { kept: Finding[]; allowed: number } {
  const kept: Finding[] = [];
  let allowed = 0;
  for (const f of findings) {
    const hit = allowlist.some((a) => a.check === f.check && a.file === f.file && (!a.match || f.snippet.includes(a.match)));
    if (hit) allowed += 1;
    else kept.push(f);
  }
  return { kept, allowed };
}

/** Only HIGH findings are frozen, and only a HIGH finding missing from the baseline fails the run. */
export function buildResult(findings: Finding[], allowlist: AllowlistEntry[], baseline: Baseline): AuditResult {
  const { kept, allowed } = applyAllowlist(findings, allowlist);
  const known = new Set(baseline.fingerprints);
  return { findings: kept, allowed, newHigh: kept.filter((f) => f.severity === "HIGH" && !known.has(f.fingerprint)) };
}

export function toBaseline(findings: Finding[], generatedAt: string): Baseline {
  const fingerprints = [...new Set(findings.filter((f) => f.severity === "HIGH").map((f) => f.fingerprint))].sort();
  return { generatedAt, fingerprints };
}
