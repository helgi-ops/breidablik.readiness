"use client";

type Props = {
  history: Array<Record<string, unknown>>;
};

function readableSummary(summary: Record<string, unknown> | null | undefined): string[] {
  if (!summary) return [];
  const lines: string[] = [];
  const athletesSeen = Number(summary.athletes_seen ?? 0);
  const testsSeen = Number(summary.tests_seen ?? 0);
  const rawInserted = Number(summary.raw_inserted ?? 0);
  const mappingMissing = Number(summary.mapping_missing ?? 0);
  const invalidPayloads = Number(summary.invalid_payloads ?? 0);
  const forceDecks = Number(summary.normalized_forcedecks ?? 0);
  const nordBord = Number(summary.normalized_nordbord ?? 0);
  const forceFrame = Number(summary.normalized_forceframe ?? 0);
  lines.push(`${athletesSeen} athletes seen, ${testsSeen} tests seen`);
  lines.push(`${rawInserted} raw inserted, ${forceDecks} ForceDecks, ${nordBord} NordBord, ${forceFrame} ForceFrame normalized`);
  if (mappingMissing > 0) lines.push(`${mappingMissing} tests missing player mappings`);
  if (invalidPayloads > 0) lines.push(`${invalidPayloads} payloads could not be normalized`);
  const athleteScopeNote = typeof summary.athlete_scope_note === "string" ? summary.athlete_scope_note : null;
  const testScopeNote = typeof summary.test_scope_note === "string" ? summary.test_scope_note : null;
  const providerDiagnostics = typeof summary.provider_diagnostics === "string" ? summary.provider_diagnostics : null;
  if (athleteScopeNote) lines.push(athleteScopeNote);
  if (testScopeNote) lines.push(testScopeNote);
  if (providerDiagnostics) lines.push(`Diagnostics: ${providerDiagnostics}`);
  return lines;
}

export default function ValdSyncHistoryTable({ history }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">Sync history</div>
      {!history.length ? <div className="mt-3 rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-600">No sync history yet.</div> : null}
      <div className="mt-3 space-y-2">
        {history.map((row) => (
          <div key={String(row.id)} className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-900">{String(row.sync_type ?? "manual")}</span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{String(row.status ?? "unknown")}</span>
            </div>
            <div className="mt-1 text-zinc-600">{String(row.started_at ?? "—")} → {String(row.completed_at ?? "—")}</div>
            <div className="mt-1 space-y-1 text-zinc-600">
              {readableSummary((row.summary as Record<string, unknown> | null | undefined)).map((line) => (
                <div key={line}>{line}</div>
              ))}
              {typeof row.error_message === "string" && row.error_message.trim() ? (
                <div className="text-red-600">{row.error_message}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
