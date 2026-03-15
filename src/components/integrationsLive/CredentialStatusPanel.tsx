"use client";

import type { ProviderCredentialRecord } from "@/lib/micropulse/integrationsLive";

type Props = {
  credentials: ProviderCredentialRecord[];
};

export default function CredentialStatusPanel({ credentials }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Credential status</div>
      {!credentials.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No credential metadata.</div> : null}
      <div className="mt-2 space-y-1">
        {credentials.map((credential) => (
          <div key={credential.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="font-medium text-gray-900">{credential.provider} · {credential.authMode}</div>
            <div className="text-gray-600">
              {credential.status} · last validated {credential.lastValidatedAt ?? "—"} · expires {credential.expiresAt ?? "—"}
            </div>
            <div className="text-gray-500">
              refresh token: {credential.hasRefreshToken ? "yes" : "no"} · webhook secret: {credential.hasWebhookSecret ? "yes" : "no"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

