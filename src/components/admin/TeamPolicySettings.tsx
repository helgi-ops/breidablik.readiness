"use client";

import type { TeamPolicyConfig } from "@/lib/micropulse/adminConfig";

type Props = {
  value: TeamPolicyConfig;
  onChange: (next: TeamPolicyConfig) => void;
};

export default function TeamPolicySettings({ value, onChange }: Props) {
  const set = <K extends keyof TeamPolicyConfig>(key: K, next: TeamPolicyConfig[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">Team policy</div>
      <div className="text-base font-semibold">Recommendation policy preferences</div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <PolicySelect label="MD-1 protection bias" help="Higher value increases protection the day before match." value={value.mdMinus1ProtectionBias} onChange={(v) => set("mdMinus1ProtectionBias", v as TeamPolicyConfig["mdMinus1ProtectionBias"])} />
        <PolicySelect label="MD+1 recovery bias" help="Controls recovery tendency after match." value={value.mdPlus1RecoveryBias} onChange={(v) => set("mdPlus1RecoveryBias", v as TeamPolicyConfig["mdPlus1RecoveryBias"])} />
        <PolicySelect label="Congested-week protection" help="Higher value is more conservative in dense weeks." value={value.congestedWeekProtectionBias} onChange={(v) => set("congestedWeekProtectionBias", v as TeamPolicyConfig["congestedWeekProtectionBias"])} />
        <PolicySelect label="Protected-player bias" help="Controls extra caution for protected athletes." value={value.protectedPlayerBias} onChange={(v) => set("protectedPlayerBias", v as TeamPolicyConfig["protectedPlayerBias"])} />

        <label className="text-xs text-zinc-600">
          Max-speed default policy
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={value.defaultMaxSpeedPolicy} onChange={(e) => set("defaultMaxSpeedPolicy", e.target.value as TeamPolicyConfig["defaultMaxSpeedPolicy"])}>
            <option value="NORMAL">Normal</option>
            <option value="CAUTIOUS">Cautious</option>
          </select>
        </label>

        <label className="text-xs text-zinc-600">
          Decel default policy
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={value.defaultDecelPolicy} onChange={(e) => set("defaultDecelPolicy", e.target.value as TeamPolicyConfig["defaultDecelPolicy"])}>
            <option value="NORMAL">Normal</option>
            <option value="CAUTIOUS">Cautious</option>
          </select>
        </label>

        <label className="text-xs text-zinc-600">
          Gym intensity default policy
          <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={value.defaultGymIntensityPolicy} onChange={(e) => set("defaultGymIntensityPolicy", e.target.value as TeamPolicyConfig["defaultGymIntensityPolicy"])}>
            <option value="NORMAL">Normal</option>
            <option value="CAUTIOUS">Cautious</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-zinc-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={value.allowAggressiveExposureInPeakWindow} onChange={(e) => set("allowAggressiveExposureInPeakWindow", e.target.checked)} />
          Allow aggressive exposure in peak window
        </label>

        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={value.requireCoachReviewForProtectedFull} onChange={(e) => set("requireCoachReviewForProtectedFull", e.target.checked)} />
          Require coach review for protected FULL recommendations
        </label>

        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={value.overrideReasonRequired} onChange={(e) => set("overrideReasonRequired", e.target.checked)} />
          Manual override reason required
        </label>
      </div>
    </div>
  );
}

function PolicySelect({ label, help, value, onChange }: { label: string; help: string; value: "LOW" | "NORMAL" | "HIGH"; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-zinc-600">
      {label}
      <select className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="LOW">Low</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">High</option>
      </select>
      <div className="mt-1 text-[11px] text-zinc-500">{help}</div>
    </label>
  );
}
