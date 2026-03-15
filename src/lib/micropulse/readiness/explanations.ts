import { buildWhoopExplanationLines, type WhoopFusionFeatures } from "@/lib/micropulse/integrations/whoopFusion";

export function explainReadinessWhy(
  triggeredRules: string[],
  whoopFeatures?: WhoopFusionFeatures | null
): string[] {
  const lines: string[] = [];
  for (const code of triggeredRules) {
    if (code === "LIGHT_ATE_RED_PRIORITY") lines.push("ATE flagged the athlete in a recovery-first state.");
    if (code === "LIGHT_ATE_YELLOW_PRIORITY") lines.push("ATE flagged moderate readiness and a modified session.");
    if (code === "GRAY_INSUFFICIENT_INPUT") lines.push("Input coverage is too low for a confident readiness call.");
    if (code === "RED_FATIGUE_TREND") lines.push("Fatigue is significantly elevated compared to the player's normal level.");
    if (code === "RED_RECOVERY_SUPPRESSION") lines.push("Recovery markers suggest incomplete recovery.");
    if (code === "RED_LOAD_SPIKE_FATIGUE") lines.push("Workload spike and fatigue trend are present together.");
    if (code === "RED_NEURAL_PROTECTION") lines.push("Neural protection override is active.");
    if (code === "RED_INJURY_PAIN_FLAG") lines.push("Pain-related protection is active for today.");
    if (code === "INFO_TISSUE_LOW_SEVERITY") lines.push("Low tissue signal detected; monitor response, no protection override needed.");
    if (code === "RED_LOW_SORENESS_COMBINED") lines.push("Reported soreness increases caution with other fatigue signals.");
    if (code === "YELLOW_MODERATE_FATIGUE") lines.push("Moderate fatigue indicators are present today.");
    if (code === "YELLOW_RISING_WORKLOAD") lines.push("Training load has increased over the recent period.");
    if (code === "YELLOW_HIGH_VOLATILITY") lines.push("Readiness responses are inconsistent across recent days.");
    if (code === "YELLOW_LOW_SORENESS_CAUTION") lines.push("Reported soreness increases caution for today's loading.");
    if (code === "YELLOW_WHOOP_CAUTION_SUPPORT") lines.push("WHOOP recovery and sleep signals added caution in a borderline profile.");
    if (code === "WHOOP_CAUTION_SUPPORT") lines.push("WHOOP recovery and sleep markers suggested caution.");
    if (code === "WHOOP_POSITIVE_SUPPORT") lines.push("WHOOP recovery and sleep markers supported readiness.");
    if (code === "WHOOP_MIXED_SIGNALS") lines.push("WHOOP recovery and sleep markers were mixed.");
    if (code === "WHOOP_LOAD_CONTEXT_ONLY") lines.push("WHOOP load was elevated and treated as context only.");
    if (code === "WHOOP_LOAD_CONTEXT_DOWNWEIGHTED") lines.push("WHOOP load context was downweighted due to richer team load data.");
    if (code === "VOLATILITY_DEEMPHASIZED_STRONG_DAY")
      lines.push("Current-day readiness is strong, so volatility is treated as a secondary caution.");
    if (code === "GREEN_STRONG_READINESS_GOOD_SORENESS")
      lines.push("Muscle soreness does not currently suggest elevated recovery concern.");
    if (code === "GREEN_STABLE") lines.push("Readiness and load profile appear stable for normal training.");
  }
  const unique = Array.from(new Set(lines));
  const shouldIncludeWhoop =
    !!whoopFeatures &&
    whoopFeatures.hasWhoopData &&
    triggeredRules.some((code) => code.includes("WHOOP"));
  if (!shouldIncludeWhoop) return unique.slice(0, 3);

  return Array.from(new Set([...unique, ...buildWhoopExplanationLines(whoopFeatures)])).slice(0, 3);
}

export function explainReadinessCoachActions(triggeredRules: string[], athleteState: "GREEN" | "YELLOW" | "RED" | "GRAY"): string[] {
  const lines: string[] = [];
  if (triggeredRules.includes("LIGHT_ATE_RED_PRIORITY")) lines.push("Shift to recovery-focused loading and reassess tomorrow.");
  if (triggeredRules.includes("LIGHT_ATE_YELLOW_PRIORITY")) lines.push("Use modified loading and keep execution quality high.");
  if (triggeredRules.includes("RED_LOAD_SPIKE_FATIGUE")) lines.push("Reduce total training load today.");
  if (triggeredRules.includes("RED_RECOVERY_SUPPRESSION")) lines.push("Prioritize recovery-focused work and reassess tomorrow.");
  if (triggeredRules.includes("RED_FATIGUE_TREND")) lines.push("Avoid maximal strength and repeated explosive work.");
  if (triggeredRules.includes("RED_NEURAL_PROTECTION")) lines.push("Use protective loading and keep intensity submaximal.");
  if (triggeredRules.includes("RED_INJURY_PAIN_FLAG")) lines.push("Protect painful tissue and remove high-impact stressors.");
  if (triggeredRules.includes("INFO_TISSUE_LOW_SEVERITY")) lines.push("Monitor tissue response during warm-up and keep progression controlled.");
  if (triggeredRules.includes("YELLOW_RISING_WORKLOAD")) lines.push("Limit high-speed exposure and monitor response in warm-up.");
  if (triggeredRules.includes("YELLOW_MODERATE_FATIGUE")) lines.push("Use modified loading and keep execution quality high.");
  if (triggeredRules.includes("YELLOW_LOW_SORENESS_CAUTION")) lines.push("Keep loading controlled until soreness improves.");
  if (triggeredRules.includes("YELLOW_WHOOP_CAUTION_SUPPORT") || triggeredRules.includes("WHOOP_CAUTION_SUPPORT")) {
    lines.push("Keep first block controlled and reassess after warm-up feedback.");
  }
  if (triggeredRules.includes("WHOOP_LOAD_CONTEXT_ONLY")) {
    lines.push("Treat elevated WHOOP strain as context; avoid adding unnecessary load.");
  }
  if (triggeredRules.includes("YELLOW_HIGH_VOLATILITY")) lines.push("Keep session flexible and adjust during first block feedback.");
  if (athleteState === "GREEN") lines.push("Run planned session with standard monitoring.");
  if (athleteState === "YELLOW" && lines.length === 0) lines.push("Use modified loading and monitor first block response.");
  if (athleteState === "RED" && lines.length === 0) lines.push("Shift to recovery emphasis and avoid high-output loading.");
  if (athleteState === "GRAY") lines.push("Collect missing monitoring inputs before finalizing full load.");
  return Array.from(new Set(lines)).slice(0, 3);
}
