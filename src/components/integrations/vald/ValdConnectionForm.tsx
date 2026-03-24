"use client";

type Props = {
  value: {
    baseUrl: string;
    authMode: "api_key" | "oauth" | "unknown";
    clientId: string;
    clientSecret: string;
    apiKey: string;
    orgId: string;
    region: string;
    tenantId: string;
    isEnabled: boolean;
  };
  onChange: (next: Props["value"]) => void;
  onSaveAndTest: () => void;
  busy?: boolean;
};

export default function ValdConnectionForm({ value, onChange, onSaveAndTest, busy = false }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">Connection</div>
      <div className="mt-1 text-xs text-zinc-600">VALD Hub connection details and authentication mode.</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Enabled</div>
          <input type="checkbox" checked={value.isEnabled} onChange={(e) => onChange({ ...value, isEnabled: e.target.checked })} />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Auth mode</div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={value.authMode}
            onChange={(e) => onChange({ ...value, authMode: e.target.value as Props["value"]["authMode"] })}
          >
            <option value="unknown">Unknown</option>
            <option value="api_key">API key</option>
            <option value="oauth">OAuth (client credentials)</option>
          </select>
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Region</div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          >
            <option value="">Auto</option>
            <option value="euw">Europe West (euw)</option>
            <option value="use">US East (use)</option>
            <option value="aue">Asia-Pacific (aue)</option>
          </select>
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Tenant ID</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={value.tenantId}
            placeholder="Required for ForceDecks / NordBord"
            onChange={(e) => onChange({ ...value, tenantId: e.target.value })}
          />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Client ID</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={value.clientId} onChange={(e) => onChange({ ...value, clientId: e.target.value })} />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Client secret</div>
          <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm" value={value.clientSecret} onChange={(e) => onChange({ ...value, clientSecret: e.target.value })} />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">Org ID (optional)</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={value.orgId} onChange={(e) => onChange({ ...value, orgId: e.target.value })} />
        </label>
        <label className="text-xs text-zinc-700">
          <div className="mb-1 font-medium">API key (legacy)</div>
          <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm" value={value.apiKey} onChange={(e) => onChange({ ...value, apiKey: e.target.value })} />
        </label>
        <label className="text-xs text-zinc-700 md:col-span-2">
          <div className="mb-1 font-medium">Base URL (optional override)</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={value.baseUrl}
            placeholder="Leave blank to use region-based URL"
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4">
        <button type="button" onClick={onSaveAndTest} disabled={busy} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Testing..." : "Save & test connection"}
        </button>
      </div>
    </div>
  );
}
