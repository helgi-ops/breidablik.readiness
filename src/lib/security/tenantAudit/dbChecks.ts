import type { SupabaseClient } from "@supabase/supabase-js";
import { makeFinding } from "./fingerprint";
import type { Finding } from "./types";

export type DbCatalog = {
  tables: Array<{ name: string; rls: boolean; tenant: boolean; anon_select: boolean; authenticated_select: boolean; authenticated_write: boolean }>;
  policies: Array<{ table: string; name: string; cmd: string; roles: string[]; using: string | null; check: string | null }>;
  views: Array<{ name: string; invoker: boolean; anon_select: boolean }>;
  functions: Array<{ name: string; returns_trigger: boolean; anon_exec: boolean; authenticated_exec: boolean; checks_caller: boolean }>;
  profiles_update_columns: string[];
  coach_teams_gap: number;
  signup_function_guarded: boolean;
  elevated_accounts: Array<{ id: string; role: string | null; is_admin: boolean | null }>;
};

const PRIVILEGED_PROFILE_COLUMNS = ["team_id", "role", "is_admin", "player_id", "user_id", "id"];
const OPEN_EXPR = /^\(?\s*true\s*\)?$|\btrue\s+OR\b|\bOR\s+true\b/i;

const SERVER_ROLES = new Set(["service_role", "postgres", "supabase_admin", "supabase_auth_admin"]);
const cmdWrites = (cmd: string) => cmd !== "r";

/** Turns the database catalog into findings. Pure, so each rule is unit-tested on a small catalog. */
export function evaluateCatalog(c: DbCatalog, orphans: Record<string, number> = {}, foreignContent: Record<string, number> = {}): Finding[] {
  const out: Finding[] = [];
  const tenant = new Set(c.tables.filter((t) => t.tenant).map((t) => t.name));

  for (const t of c.tables) {
    if (t.tenant && !t.rls && (t.anon_select || t.authenticated_select)) {
      out.push(makeFinding("DB_RLS_OFF", "HIGH", `db:${t.name}`, 0, `Team table ${t.name} has row-level security off and is readable by ${t.anon_select ? "anyone" : "any logged-in user"}.`, t.name));
    }
  }
  for (const p of c.policies) {
    if (!tenant.has(p.table)) continue;
    // A policy only for the server's own roles opens nothing to users.
    if (p.roles.length > 0 && p.roles.every((r) => SERVER_ROLES.has(r))) continue;
    const openUsing = !!p.using && OPEN_EXPR.test(p.using);
    const openCheck = !!p.check && OPEN_EXPR.test(p.check);
    if (openUsing || openCheck) {
      out.push(makeFinding("DB_USING_TRUE", cmdWrites(p.cmd) ? "HIGH" : "MEDIUM", `db:${p.table}`, 0, `Policy "${p.name}" on ${p.table} is open to every logged-in user.`, `${p.table}.${p.name}`));
    }
    const expr = `${p.using ?? ""} ${p.check ?? ""}`;
    // No policy uses is_staff() any more (20261109100000). A team branch beside it does not help, because the OR opens the other teams anyway.
    if (/\bis_staff\(\)/.test(expr)) {
      out.push(makeFinding("DB_IS_STAFF_POLICY", "HIGH", `db:${p.table}`, 0, `Policy "${p.name}" on ${p.table} uses is_staff(), which also matches coaches and players, so it opens other teams. Use is_elevated_staff() or a team check.`, `${p.table}.${p.name}`));
    }
  }
  for (const col of c.profiles_update_columns) {
    if (PRIVILEGED_PROFILE_COLUMNS.includes(col)) {
      out.push(makeFinding("DB_PROFILES_GRANTS", "HIGH", "db:profiles", 0, `Users can change their own profiles.${col} from the browser.`, col));
    }
  }
  for (const v of c.views) {
    if (v.anon_select) out.push(makeFinding("DB_ANON_VIEW", "HIGH", `db:${v.name}`, 0, `View ${v.name} is readable without a login.`, v.name));
    if (!v.invoker) out.push(makeFinding("DB_VIEW_OWNER_RIGHTS", "HIGH", `db:${v.name}`, 0, `View ${v.name} runs with its owner's rights and bypasses row-level security.`, v.name));
  }
  for (const f of c.functions) {
    if (f.returns_trigger) continue; // Postgres runs these on row changes. No client can call them.
    if (f.anon_exec) {
      out.push(makeFinding("DB_DEFINER_RPC", "HIGH", `db:${f.name}`, 0, `SECURITY DEFINER function ${f.name} can be called without a login.`, `anon:${f.name}`));
    } else if (f.authenticated_exec && !f.checks_caller) {
      out.push(makeFinding("DB_DEFINER_RPC", "MEDIUM", `db:${f.name}`, 0, `SECURITY DEFINER function ${f.name} can be called by any logged-in user and does not check who is calling.`, `authenticated:${f.name}`));
    }
  }
  if (!c.signup_function_guarded) {
    out.push(makeFinding("DB_SIGNUP_TRUST", "HIGH", "db:handle_new_user", 0, "The signup function no longer limits roles or requires an invitation for a coach to join a team.", "handle_new_user"));
  }
  const invites = c.tables.find((t) => t.name === "coach_invitations");
  if (invites?.authenticated_write) {
    out.push(makeFinding("DB_INVITE_WRITE", "HIGH", "db:coach_invitations", 0, "Logged-in users can write coach invitations from the browser, so they could invite themselves into a team.", "coach_invitations"));
  }
  for (const a of c.elevated_accounts) {
    out.push(makeFinding("DB_NEW_ELEVATED_ACCOUNT", "HIGH", "db:profiles", 0, `Admin or staff account (${a.role ?? "no role"}, is_admin ${a.is_admin ? "true" : "false"}). A new one means someone gained access to all teams.`, `elevated:${a.id}`));
  }
  if (c.coach_teams_gap > 0) {
    out.push(makeFinding("DB_COACH_TEAMS_GAP", "MEDIUM", "db:coach_teams", 0, `${c.coach_teams_gap} coach profiles point at a team they have no coach_teams row for.`, "coach_teams_gap"));
  }
  for (const [table, n] of Object.entries(orphans)) {
    if (n > 0) out.push(makeFinding("DB_ORPHANS", "MEDIUM", `db:${table}`, 0, `${n} rows in ${table} carry a different team than the player, with no recorded membership.`, `orphans:${table}`));
  }
  // Players' daily plan locks holding another team's session (the 2026-11-09 leak: the check-in trigger
  // filled every club's locks from Breiðablik's templates). Fixed by 20261109170000; this keeps it fixed.
  for (const [table, n] of Object.entries(foreignContent)) {
    if (n > 0) out.push(makeFinding("DB_FOREIGN_PLAN_CONTENT", "HIGH", `db:${table}`, 0, `${n} rows in ${table} hold another team's training session.`, `foreign:${table}`));
  }
  return out;
}

export async function runDbChecks(sb: SupabaseClient): Promise<Finding[]> {
  const { data: catalog, error } = await sb.rpc("tenant_audit_catalog");
  if (error) throw new Error(`tenant_audit_catalog: ${error.message}`);
  const { data: orphans, error: orphanErr } = await sb.rpc("tenant_audit_orphans");
  if (orphanErr) throw new Error(`tenant_audit_orphans: ${orphanErr.message}`);
  const { data: foreign, error: foreignErr } = await sb.rpc("tenant_audit_foreign_plan_content");
  if (foreignErr) throw new Error(`tenant_audit_foreign_plan_content: ${foreignErr.message}`);
  return evaluateCatalog(catalog as DbCatalog, (orphans ?? {}) as Record<string, number>, (foreign ?? {}) as Record<string, number>);
}
