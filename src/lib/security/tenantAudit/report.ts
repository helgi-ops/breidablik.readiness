import type { AuditResult, Finding } from "./types";

const row = (f: Finding) => `- \`${f.check}\` ${f.file}${f.line ? `:${f.line}` : ""}: ${f.message}`;

export function renderMarkdown(result: AuditResult, scope: string): string {
  const by = (s: Finding["severity"]) => result.findings.filter((f) => f.severity === s);
  const verdict = result.newHigh.length
    ? `**FAILED: ${result.newHigh.length} new high-severity finding(s) that could let one team reach another team's data.**`
    : "**PASSED: no new high-severity finding.**";
  const lines = [
    "# Tenant isolation audit",
    "",
    verdict,
    "",
    `Scope: ${scope}. High ${by("HIGH").length}, medium ${by("MEDIUM").length}, low ${by("LOW").length}, allowlisted ${result.allowed}.`,
    "",
  ];
  if (result.newHigh.length) lines.push("## New high findings", "", ...result.newHigh.map(row), "");
  const known = by("HIGH").filter((f) => !result.newHigh.includes(f));
  if (known.length) lines.push("## Known high findings (in the baseline, still to fix)", "", ...known.map(row), "");
  const medium = by("MEDIUM");
  if (medium.length) lines.push("## Medium", "", ...medium.map(row), "");
  return lines.join("\n");
}
