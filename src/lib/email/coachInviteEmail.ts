import "server-only";
import { sendTransactionalEmail } from "./sendTransactionalEmail";

export type CoachInviteEmailInput = {
  to: string;
  coachName: string | null;
  teamLabel: string;
  inviterName: string | null;
  acceptUrl: string;
  expiresAt: Date;
};

function fmtDate(d: Date) {
  try {
    return d.toLocaleDateString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendCoachInviteEmail(input: CoachInviteEmailInput) {
  const { to, coachName, teamLabel, inviterName, acceptUrl, expiresAt } = input;

  const greeting = coachName ? `Hæ ${coachName}` : "Hæ";
  const invitedBy = inviterName ? ` af ${inviterName}` : "";
  const expires = fmtDate(expiresAt);

  const subject = `MicroPulse: Boð um aðgang að liðinu ${teamLabel}`;

  const text =
    `${greeting},\n\n` +
    `Þér hefur verið boðið${invitedBy} að ganga í liðið "${teamLabel}" á MicroPulse sem þjálfari.\n\n` +
    `Samþykkja boðið:\n${acceptUrl}\n\n` +
    `Boðið rennur út ${expires}.\n\n` +
    `Ef þú ert ekki með aðgang þá stofnar linkurinn hann fyrir þig.\n\n` +
    `— MicroPulse`;

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;padding:24px;max-width:560px;margin:auto">
    <div style="font-size:14px;color:#6b7280;margin-bottom:4px">MicroPulse</div>
    <h1 style="font-size:22px;margin:0 0 16px">Þér hefur verið boðið í lið</h1>
    <p style="font-size:15px;line-height:1.5">${escapeHtml(greeting)},</p>
    <p style="font-size:15px;line-height:1.5">
      Þér hefur verið boðið${escapeHtml(invitedBy)} að ganga í liðið
      <strong>${escapeHtml(teamLabel)}</strong> á MicroPulse sem þjálfari.
    </p>
    <p style="margin:24px 0">
      <a href="${acceptUrl}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px">
        Samþykkja boð
      </a>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">
      Ef hnappurinn virkar ekki geturðu afritað þennan hlekk í vafra:<br/>
      <span style="word-break:break-all">${escapeHtml(acceptUrl)}</span>
    </p>
    <p style="font-size:13px;color:#6b7280;margin-top:24px">
      Boðið rennur út ${escapeHtml(expires)}. Ef þú ert ekki með aðgang stofnar linkurinn hann fyrir þig.
    </p>
  </body>
</html>`;

  return sendTransactionalEmail({ to, subject, text, html });
}
