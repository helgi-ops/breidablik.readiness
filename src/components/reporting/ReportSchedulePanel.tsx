"use client";

import { summarizeScheduleConfig, type ReportScheduleConfig } from "@/lib/micropulse/reporting";

type Props = {
  schedules: ReportScheduleConfig[];
  onToggleEnabled: (id: string) => void;
  onSave: (config: ReportScheduleConfig) => void;
};

export default function ReportSchedulePanel({ schedules, onToggleEnabled, onSave }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Schedule configs</div>
      <div className="mt-2 space-y-2">
        {schedules.map((schedule) => (
          <div key={schedule.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{schedule.templateKey.replaceAll("_", " ")}</div>
              <button type="button" onClick={() => onToggleEnabled(schedule.id)} className="rounded border px-2 py-0.5 text-[11px]">
                {schedule.enabled ? "Disable" : "Enable"}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{summarizeScheduleConfig(schedule)}</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <select
                value={schedule.frequency}
                onChange={(e) => onSave({ ...schedule, frequency: e.target.value as ReportScheduleConfig["frequency"] })}
                className="rounded border px-2 py-1 text-[11px]"
              >
                <option value="MANUAL">MANUAL</option>
                <option value="DAILY">DAILY</option>
                <option value="WEEKLY">WEEKLY</option>
              </select>
              <input
                value={schedule.localTime ?? "09:00"}
                onChange={(e) => onSave({ ...schedule, localTime: e.target.value })}
                className="rounded border px-2 py-1 text-[11px]"
                placeholder="09:00"
              />
              <input
                value={schedule.dayOfWeek ?? "1"}
                onChange={(e) => onSave({ ...schedule, dayOfWeek: Number(e.target.value) })}
                className="rounded border px-2 py-1 text-[11px]"
                placeholder="1"
              />
            </div>
          </div>
        ))}
        {!schedules.length ? <div className="text-[11px] text-gray-500">No schedule configs.</div> : null}
      </div>
    </div>
  );
}
