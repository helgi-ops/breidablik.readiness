/**
 * The email a personal trainer's client gets when the trainer invites them
 * (POST /api/trainer/invitations, and "Resend" via PATCH). Written in the
 * trainer's language (EN default, IS), from the practice by name, and replies
 * go to the trainer. Pure: the route sends it with sendTransactionalEmail.
 */

export type ClientInviteEmailInput = {
  lang: "EN" | "IS";
  clientName: string | null;
  practiceName: string;
  trainerName: string | null;
  acceptUrl: string;
  expiresAt: Date;
};

export type ClientInviteEmail = { subject: string; text: string; html: string };

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d: Date, lang: "EN" | "IS") {
  try {
    return d.toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function buildClientInviteEmail(input: ClientInviteEmailInput): ClientInviteEmail {
  const { lang, acceptUrl } = input;
  const is = lang === "IS";
  const practice = input.practiceName.trim() || "MicroPulse";
  const trainer = input.trainerName?.trim() || null;
  const name = input.clientName?.trim() || null;
  const expires = fmtDate(input.expiresAt, lang);
  // "Anna at Strong Lab" when the trainer's name differs from the practice name.
  const from = trainer && trainer !== practice ? (is ? `${trainer} hjá ${practice}` : `${trainer} at ${practice}`) : practice;

  const subject = is
    ? `${practice} bauð þér í æfingaappið sitt`
    : `${practice} invited you to their training app`;
  const greeting = name ? (is ? `Hæ ${name},` : `Hi ${name},`) : (is ? "Hæ," : "Hi,");
  const lead = is
    ? `${from} bauð þér að fá æfingarnar þínar í MicroPulse. Þar sérðu æfingu dagsins, skráir settin og sérð framfarirnar.`
    : `${from} has invited you to get your training in MicroPulse. You'll see today's session, log your sets and track your progress.`;
  const cta = is ? "Samþykkja boðið" : "Accept the invitation";
  const steps = is
    ? "Það tekur um mínútu: veldu lykilorð og þú getur byrjað."
    : "It takes about a minute: choose a password and you're in.";
  const fallback = is ? "Ef hnappurinn virkar ekki, afritaðu þennan hlekk í vafra:" : "If the button doesn't work, copy this link into your browser:";
  const expiry = is ? `Boðið gildir til ${expires}.` : `The invitation is valid until ${expires}.`;
  const reply = is ? `Spurningar? Svaraðu þessum pósti og hann fer til ${from}.` : `Questions? Reply to this email and it goes to ${from}.`;

  const text = [greeting, "", lead, "", `${cta}:`, acceptUrl, "", steps, expiry, "", reply, "", `— ${practice}`].join("\n");

  const html = `<!doctype html>
<html lang="${is ? "is" : "en"}">
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14181c;background:#f4f2ec;padding:24px;margin:0">
    <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;padding:28px">
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px">${escapeHtml(practice)}</div>
      <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(subject)}</h1>
      <p style="font-size:15px;line-height:1.5">${escapeHtml(greeting)}</p>
      <p style="font-size:15px;line-height:1.5">${escapeHtml(lead)}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(acceptUrl)}"
           style="display:inline-block;background:#2740e6;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:15px">
          ${escapeHtml(cta)}
        </a>
      </p>
      <p style="font-size:14px;line-height:1.5">${escapeHtml(steps)}</p>
      <p style="font-size:13px;color:#6b7280;line-height:1.5">
        ${escapeHtml(fallback)}<br/>
        <span style="word-break:break-all">${escapeHtml(acceptUrl)}</span>
      </p>
      <p style="font-size:13px;color:#6b7280;margin-top:20px">${escapeHtml(expiry)} ${escapeHtml(reply)}</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
