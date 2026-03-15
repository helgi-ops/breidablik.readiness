"use client";

import { useState } from "react";
import type { ReportRecipient } from "@/lib/micropulse/reporting";

type Props = {
  recipients: ReportRecipient[];
  onChange: (next: ReportRecipient[]) => void;
};

export default function ReportRecipientManager({ recipients, onChange }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<ReportRecipient["audience"]>("COACHING");

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Recipients</div>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <input className="rounded border px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="rounded border px-2 py-1" value={audience ?? "COACHING"} onChange={(e) => setAudience(e.target.value as ReportRecipient["audience"])}>
          <option value="EXECUTIVE">EXECUTIVE</option>
          <option value="MEDICAL">MEDICAL</option>
          <option value="PERFORMANCE">PERFORMANCE</option>
          <option value="COACHING">COACHING</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={() => {
            if (!email.trim()) return;
            onChange([
              {
                id: `recipient:${Date.now()}`,
                name: name.trim() || null,
                email: email.trim(),
                audience: audience ?? null,
                enabled: true,
              },
              ...recipients,
            ]);
            setName("");
            setEmail("");
          }}
        >
          Add
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {recipients.map((recipient) => (
          <div key={recipient.id ?? `${recipient.email}:${recipient.name}`} className="flex items-center justify-between rounded border bg-gray-50 px-2 py-1">
            <div>
              <span className="font-medium">{recipient.name || "Unnamed"}</span> · {recipient.email || "No email"} · {recipient.audience || "-"}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-[11px]"
                onClick={() => onChange(recipients.map((r) => (r === recipient ? { ...r, enabled: !r.enabled } : r)))}
              >
                {recipient.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-[11px]"
                onClick={() => onChange(recipients.filter((r) => r !== recipient))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {!recipients.length ? <div className="text-[11px] text-gray-500">No recipients configured.</div> : null}
      </div>
    </div>
  );
}
