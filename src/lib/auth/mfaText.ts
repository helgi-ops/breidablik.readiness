/** Pure rules and wording for two-step sign-in, kept free of the Supabase client so they can be tested. */

export type AalRead = { currentLevel: string | null; nextLevel: string | null } | null | undefined;

/** The password is done but this account has an app registered, so a code is still owed. */
export function needsMfaStep(aal: AalRead): boolean {
  return aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}

/** Authenticator codes are shown as "288 649" and often pasted with the space. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export type MfaLang = "EN" | "IS";

/** Plain wording for the errors a coach can actually hit; anything else keeps Supabase's own message. */
export function mfaErrorMessage(error: { code?: string; message?: string } | null | undefined, lang: MfaLang): string {
  const is = lang === "IS";
  switch (error?.code) {
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return is ? "Kóðinn passar ekki. Bíddu eftir næsta kóða og reyndu aftur." : "That code didn't match. Wait for the next code and try again.";
    case "mfa_factor_not_found":
      return is ? "Skráningin rann út. Byrjaðu aftur á að bæta við forriti." : "This setup expired. Start again by adding the app.";
    case "mfa_factor_name_conflict":
      return is ? "Þetta nafn er þegar í notkun. Veldu annað nafn." : "That name is already in use. Choose another.";
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_enroll_disabled":
    case "mfa_totp_verify_not_enabled":
      return is ? "Tveggja þrepa innskráning er ekki virk í Supabase-stillingunum." : "Two-step sign-in is switched off in the Supabase settings.";
    case "too_many_enrolled_mfa_factors":
      return is ? "Of mörg forrit eru skráð. Fjarlægðu eitt fyrst." : "Too many apps are registered. Remove one first.";
    case "over_request_rate_limit":
      return is ? "Of margar tilraunir. Bíddu aðeins og reyndu aftur." : "Too many attempts. Wait a moment and try again.";
    default:
      return error?.message || (is ? "Eitthvað fór úrskeiðis. Reyndu aftur." : "Something went wrong. Try again.");
  }
}
