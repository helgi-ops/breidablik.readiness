"use client";

import { useMemo, useState } from "react";
import type { IntegrationImportMode, IntegrationProviderDescriptor, IntegrationProviderKey } from "@/lib/micropulse/integrations";

type Props = {
  descriptors: IntegrationProviderDescriptor[];
  onImport: (args: { provider: IntegrationProviderKey; importMode: IntegrationImportMode; payload: unknown; sourceRef?: string | null }) => void;
  lastSummary?: string | null;
};

function parsePayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export default function ManualImportPanel({ descriptors, onImport, lastSummary }: Props) {
  const firstProvider = descriptors[0]?.provider ?? "GENERIC_CSV";
  const [provider, setProvider] = useState<IntegrationProviderKey>(firstProvider);
  const [importMode, setImportMode] = useState<IntegrationImportMode>("MANUAL_UPLOAD");
  const [sourceRef, setSourceRef] = useState("");
  const [payloadText, setPayloadText] = useState("");

  const activeDescriptor = useMemo(() => descriptors.find((item) => item.provider === provider) ?? descriptors[0], [descriptors, provider]);
  const supportedModes = activeDescriptor?.supportedModes ?? ["MANUAL_UPLOAD"];

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Manual import</div>
      <div className="mt-1 text-[11px] text-gray-600">Use JSON payload or CSV text. Import is deterministic and auditable; partial imports will surface conflicts.</div>

      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <select value={provider} onChange={(event) => setProvider(event.target.value as IntegrationProviderKey)} className="rounded border px-2 py-1">
          {descriptors.map((descriptor) => (
            <option key={descriptor.provider} value={descriptor.provider}>
              {descriptor.displayName}
            </option>
          ))}
        </select>
        <select value={importMode} onChange={(event) => setImportMode(event.target.value as IntegrationImportMode)} className="rounded border px-2 py-1">
          {supportedModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        <input
          value={sourceRef}
          onChange={(event) => setSourceRef(event.target.value)}
          placeholder="sourceRef (optional)"
          className="rounded border px-2 py-1"
        />
      </div>

      <textarea
        className="mt-2 min-h-[140px] w-full rounded border px-2 py-1 text-[11px]"
        value={payloadText}
        onChange={(event) => setPayloadText(event.target.value)}
        placeholder={'JSON example: {"data":[{"athlete_id":"123","timestamp":"2026-03-14","recovery_score":73}]}\nCSV example: metricKey,category,externalAthleteId,timestamp,numericValue,unit'}
        suppressHydrationWarning
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white"
          onClick={() => onImport({ provider, importMode, payload: parsePayload(payloadText), sourceRef: sourceRef || null })}
        >
          Run import
        </button>
        <button type="button" className="rounded border bg-white px-3 py-1 text-[11px]" onClick={() => setPayloadText("")}>
          Clear
        </button>
      </div>

      {lastSummary ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-700">{lastSummary}</div> : null}
    </div>
  );
}

