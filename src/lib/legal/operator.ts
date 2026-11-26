/**
 * Who runs MicroPulse — named once, used by the terms, the privacy pages, the
 * help page and the sales page.
 *
 * The bracketed values are placeholders until the company details are decided
 * (2026-11-22). Fill them in here and every page follows. The terms and privacy
 * texts are drafts and must be read by a lawyer before they are relied on.
 */
export const OPERATOR = {
  /** Legal name of the company that operates MicroPulse. */
  name: "[COMPANY NAME]",
  /** Company ID number (kennitala). */
  companyId: "[COMPANY ID]",
  /** Registered address. */
  address: "[REGISTERED ADDRESS]",
  /** Where practices write for help, data requests and anything legal. */
  supportEmail: "support@metabolic.is",
  /** Public site. */
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is",
} as const;

/** Version of the practice terms + data processing terms. Bump when either text changes. */
export const PRACTICE_TERMS_VERSION = "2026-11-22";
