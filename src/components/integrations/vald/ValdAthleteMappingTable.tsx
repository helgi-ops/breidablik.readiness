"use client";

import { useState } from "react";

type Candidate = {
  valdAthleteId: string;
  valdAthleteName?: string | null;
  valdEmail?: string | null;
  valdExternalRef?: string | null;
  teamName?: string | null;
  groupName?: string | null;
};

type Player = { id: string; name: string };

type Props = {
  candidates: Candidate[];
  players: Player[];
  onMap: (args: { valdAthleteId: string; microplayerId: string; valdAthleteName?: string | null; valdEmail?: string | null; valdExternalRef?: string | null }) => Promise<void>;
};

export default function ValdAthleteMappingTable({ candidates, players, onMap }: Props) {
  const options = players.map((player) => ({ value: player.id, label: player.name }));
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-zinc-900">Athlete mappings</div>
      <div className="mt-1 text-xs text-zinc-600">Manually link unresolved VALD athletes to MicroPulse players.</div>
      {!candidates.length ? <div className="mt-3 rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-600">No unresolved VALD athletes.</div> : null}
      <div className="mt-3 space-y-2">
        {candidates.map((candidate) => (
          <MappingRow key={candidate.valdAthleteId} candidate={candidate} options={options} onMap={onMap} />
        ))}
      </div>
    </div>
  );
}

function MappingRow({
  candidate,
  options,
  onMap,
}: {
  candidate: Candidate;
  options: Array<{ value: string; label: string }>;
  onMap: Props["onMap"];
}) {
  const [microplayerId, setMicroplayerId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border bg-zinc-50 p-3" data-athlete-id={candidate.valdAthleteId}>
      <div className="text-sm font-medium text-zinc-900">{candidate.valdAthleteName ?? candidate.valdAthleteId}</div>
      <div className="mt-1 text-xs text-zinc-600">
        {candidate.valdEmail ?? "—"} · {candidate.valdExternalRef ?? "—"}
      </div>
      {(candidate.teamName || candidate.groupName) ? (
        <div className="mt-1 text-xs text-zinc-500">
          {[candidate.teamName, candidate.groupName].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <select className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" value={microplayerId} onChange={(e) => setMicroplayerId(e.target.value)}>
          <option value="">Select player…</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={!microplayerId || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onMap({ ...candidate, microplayerId });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Mapping..." : "Map"}
        </button>
      </div>
    </div>
  );
}
