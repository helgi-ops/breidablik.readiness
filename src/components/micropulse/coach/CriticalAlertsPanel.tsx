"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamAlert } from "@/lib/micropulse/coachCommand";

type Props = {
  alerts: TeamAlert[];
};

const ALERT_STYLES = {
  critical: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
} as const;

export default function CriticalAlertsPanel({ alerts }: Props) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
          Critical Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!alerts.length ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            No major team alerts for this date.
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className={`rounded-2xl border px-4 py-4 ${ALERT_STYLES[alert.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{alert.title}</div>
                  <div className="mt-1 text-sm">{alert.description}</div>
                </div>
                <Badge variant="outline" className="border-current bg-white/70 text-[11px] uppercase tracking-[0.18em]">
                  {alert.severity}
                </Badge>
              </div>
              {!!alert.playerNames?.length && (
                <div className="mt-3 text-xs text-current/90">
                  Players: {alert.playerNames.join(", ")}
                  {(alert.count ?? 0) > alert.playerNames.length ? "…" : ""}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
