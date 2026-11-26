import { PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

/** The PT self-serve pages — listed only once PT_SELF_SERVE_PUBLIC is on (they 404 until then). */
export const PT_SELF_SERVE_PATHS = ["/personal-trainers", "/signup/trainer", "/terms", "/privacy/practices"] as const;

/** Every public page, for search engines. App pages are excluded (see robots.ts). */
const ALL_PUBLIC_PATHS = [
  "/home",
  "/personal-trainers",
  "/pricing",
  "/sports",
  "/methodology",
  "/blog",
  "/help",
  "/signup",
  "/signup/trainer",
  "/terms",
  "/privacy",
  "/privacy/practices",
] as const;

/** The public pages search engines are told about right now. */
export const PUBLIC_PATHS: readonly string[] = PT_SELF_SERVE_PUBLIC
  ? ALL_PUBLIC_PATHS
  : ALL_PUBLIC_PATHS.filter((p) => !(PT_SELF_SERVE_PATHS as readonly string[]).includes(p));
