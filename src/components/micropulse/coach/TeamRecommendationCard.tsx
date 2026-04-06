"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TeamRecommendation } from "@/lib/micropulse/coachCommand";

type Props = {
  recommendation: TeamRecommendation;
};

const MODE_LABELS: Record<TeamRecommendation["teamMode"], string> = {
  full_go: "Full Go",
  train_with_modifications: "Train With Modifications",
  recovery_bias: "Recovery Bias",
  manual_review: "Manual Review",
};

const MODE_STYLES: Record<TeamRecommendation["teamMode"], string> = {
  full_go: "border-emerald-200 bg-emerald-50 text-emerald-900",
  train_with_modifications: "border-amber-200 bg-amber-50 text-amber-900",
  recovery_bias: "border-rose-200 bg-rose-50 text-rose-900",
  manual_review: "border-slate-200 bg-slate-100 text-slate-900",
};

export default function TeamRecommendationCard({ recommendation }: Props) {
  const loadText =
    typeof recommendation.loadAdjustmentSuggestion === "number"
      ? `${Math.round(recommendation.loadAdjustmentSuggestion * 100)}%`
      : "—";

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
          Team Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${MODE_STYLES[recommendation.teamMode]}`}>
            {MODE_LABELS[recommendation.teamMode]}
          </Badge>
          <div className="text-sm text-slate-600">
            Team load adjustment: <span className="font-semibold text-slate-900">{loadText}</span>
          </div>
        </div>
        <div className="text-base font-semibold text-slate-900">{recommendation.summary}</div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rationale</div>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {recommendation.rationale.length ? recommendation.rationale.map((item) => <li key={item}>• {item}</li>) : <li>• No additional rationale available.</li>}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Constraints</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recommendation.recommendedConstraints.length ? recommendation.recommendedConstraints.map((constraint) => (
                <span key={constraint} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {constraint}
                </span>
              )) : <span className="text-sm text-slate-500">No shared team constraints.</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
