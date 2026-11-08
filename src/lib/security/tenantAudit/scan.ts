import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { analyzeClientSource, analyzeLibSource, analyzeRouteSource, analyzeServerSource } from "./staticChecks";
import type { Finding } from "./types";

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function importResolver(root: string, fromFile: string) {
  return (specifier: string): string | null => {
    const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : resolve(dirname(fromFile), specifier);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    }
    return null;
  };
}

/** Runs the source checks over src/. Returns repo-relative paths. */
export function scanSource(root: string, tenantTables: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  for (const abs of walk(join(root, "src"))) {
    const file = relative(root, abs).split("\\").join("/");
    if (file.startsWith("src/lib/security/tenantAudit/")) continue;
    const src = readFileSync(abs, "utf8");
    if (/^src\/app\/api\/.*\/route\.tsx?$/.test(file)) {
      findings.push(...analyzeRouteSource(file, src, importResolver(root, abs)));
      findings.push(...analyzeServerSource(file, src, tenantTables));
    } else if (file.startsWith("src/lib/")) {
      findings.push(...analyzeLibSource(file, src, tenantTables));
    }
    if (file.startsWith("src/app/") || file.startsWith("src/components/")) {
      findings.push(...analyzeClientSource(file, src, tenantTables));
    }
  }
  return findings;
}
