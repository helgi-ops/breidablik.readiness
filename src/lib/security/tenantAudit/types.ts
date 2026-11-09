export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type CheckId =
  | "A_NO_AUTH"
  | "B_UNSCOPED_TENANT_ID"
  | "C_OPTIONAL_TEAM_FILTER"
  | "D_UNFILTERED_TEAM_TABLE"
  | "E_CLIENT_UNSCOPED_QUERY"
  | "E2_CLIENT_PROFILES_WRITE"
  | "F_MODULE_LET"
  | "G_FETCH_WITHOUT_BEARER"
  | "DB_RLS_OFF"
  | "DB_USING_TRUE"
  | "DB_IS_STAFF_POLICY"
  | "DB_PROFILES_GRANTS"
  | "DB_ANON_VIEW"
  | "DB_VIEW_OWNER_RIGHTS"
  | "DB_DEFINER_RPC"
  | "DB_SIGNUP_TRUST"
  | "DB_INVITE_WRITE"
  | "DB_NEW_ELEVATED_ACCOUNT"
  | "DB_ORPHANS"
  | "DB_FOREIGN_PLAN_CONTENT"
  | "DB_COACH_TEAMS_GAP";

export type Finding = {
  check: CheckId;
  severity: Severity;
  /** Repo path, or `db:<object>` for a database finding. */
  file: string;
  line: number;
  message: string;
  snippet: string;
  /** Stable across line moves: check + file + normalised snippet. */
  fingerprint: string;
};

export type AllowlistEntry = {
  check: CheckId;
  file: string;
  /** Optional: limit the entry to findings whose snippet contains this text. */
  match?: string;
  reason: string;
  addedBy: string;
  addedAt: string;
};

export type Baseline = { generatedAt: string; fingerprints: string[] };

export type AuditResult = {
  findings: Finding[];
  allowed: number;
  newHigh: Finding[];
};
