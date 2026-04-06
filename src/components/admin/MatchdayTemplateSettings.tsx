"use client";

import type { MatchdayTemplateConfig } from "@/lib/micropulse/adminConfig";

type Props = {
  value: MatchdayTemplateConfig[];
  onChange: (next: MatchdayTemplateConfig[]) => void;
};

export default function MatchdayTemplateSettings({ value, onChange }: Props) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">Matchday templates</div>
      <div className="text-base font-semibold">Day-type default biases</div>

      <div className="mt-3 grid gap-2">
        {value.map((template) => (
          <div key={template.dayType} className="rounded-lg border px-3 py-2">
            <div className="mb-2 text-sm font-semibold uppercase">{template.dayType}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs text-zinc-600">
                Action bias
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={template.defaultActionBias}
                  onChange={(e) =>
                    onChange(
                      value.map((row) =>
                        row.dayType === template.dayType
                          ? { ...row, defaultActionBias: e.target.value as MatchdayTemplateConfig["defaultActionBias"] }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="NONE">None</option>
                  <option value="FULL">FULL</option>
                  <option value="MODIFIED">MODIFIED</option>
                  <option value="RECOVERY">RECOVERY</option>
                </select>
              </label>

              <label className="text-xs text-zinc-600">
                Intensity bias
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={template.defaultIntensityBias}
                  onChange={(e) =>
                    onChange(
                      value.map((row) =>
                        row.dayType === template.dayType
                          ? { ...row, defaultIntensityBias: e.target.value as MatchdayTemplateConfig["defaultIntensityBias"] }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="NONE">None</option>
                  <option value="NO_CAP">No cap</option>
                  <option value="CAP_HIGH">Cap high</option>
                  <option value="CAP_MODERATE">Cap moderate</option>
                  <option value="CAP_LOW">Cap low</option>
                  <option value="RECOVERY_ONLY">Recovery only</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={template.protectHighRiskPlayers}
                  onChange={(e) =>
                    onChange(value.map((row) => (row.dayType === template.dayType ? { ...row, protectHighRiskPlayers: e.target.checked } : row)))
                  }
                />
                Protect high-risk players
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={template.protectProtectedPlayers}
                  onChange={(e) =>
                    onChange(value.map((row) => (row.dayType === template.dayType ? { ...row, protectProtectedPlayers: e.target.checked } : row)))
                  }
                />
                Protect protected players
              </label>
            </div>
            <label className="mt-2 block text-xs text-zinc-600">
              Notes
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={template.notes ?? ""}
                onChange={(e) => onChange(value.map((row) => (row.dayType === template.dayType ? { ...row, notes: e.target.value } : row)))}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
