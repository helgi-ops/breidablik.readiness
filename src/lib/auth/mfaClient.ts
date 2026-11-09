import { supabase } from "@/lib/supabaseClient";
import { needsMfaStep } from "./mfaText";

/**
 * Does this browser session still owe a code? Reads the session locally, with no network call for accounts
 * without an app. A failed read counts as "no": the screens must never trap someone at sign-in, and access
 * rules on the server decide what an unverified session may do.
 */
export async function sessionNeedsMfa(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    return needsMfaStep(data);
  } catch {
    return false;
  }
}
