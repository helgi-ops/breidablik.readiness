"use client";

type Props = {
  account: Record<string, unknown> | null;
};

export default function ValdIntegrationCard({ account }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">VALD</div>
          <div className="text-xs text-zinc-600">ForceDecks, NordBord, ForceFrame</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${account?.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
          {account?.is_enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-zinc-700 md:grid-cols-2">
        <div>Base URL: {String(account?.base_url ?? "—")}</div>
        <div>Auth mode: {String(account?.auth_mode ?? "unknown")}</div>
        <div>Org ID: {String(account?.org_id ?? "—")}</div>
        <div>Last test: {String(account?.last_successful_test_at ?? "—")}</div>
        <div>Last sync: {String(account?.last_successful_sync_at ?? "—")}</div>
      </div>
    </div>
  );
}
