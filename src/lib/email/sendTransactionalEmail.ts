import "server-only";

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendTransactionalEmailResult = {
  ok: boolean;
  providerMessageId?: string | null;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<SendTransactionalEmailResult> {
  const apiKey = required("RESEND_API_KEY");
  const from = required("REMINDER_EMAIL_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };

  if (!res.ok) {
    throw new Error(payload?.error?.message || `Email provider error (${res.status})`);
  }

  return {
    ok: true,
    providerMessageId: payload?.id ?? null,
  };
}
