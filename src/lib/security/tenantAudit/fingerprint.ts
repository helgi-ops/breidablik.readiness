import { createHash } from "node:crypto";
import type { CheckId, Finding, Severity } from "./types";

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

export function makeFinding(check: CheckId, severity: Severity, file: string, line: number, message: string, snippet: string): Finding {
  const clean = normalise(snippet).slice(0, 200);
  const fingerprint = createHash("sha1").update(`${check}|${file}|${clean}`).digest("hex");
  return { check, severity, file, line, message, snippet: clean, fingerprint };
}
