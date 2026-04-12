import type { CalibrationCaseInput } from "@/lib/calibration/compare";

function p(
  player_id: string,
  z: number,
  z_prev: number,
  extras?: Partial<CalibrationCaseInput["players"][number]>
): CalibrationCaseInput["players"][number] {
  return {
    player_id,
    z,
    z_prev,
    total_score: 60,
    sten_score: 5,
    low_sten_days: 0,
    energy: 3,
    sleep_quality: 3,
    sleep_duration: 3,
    stress: 3,
    soreness: 2,
    ...extras,
  };
}

export function calibrationFixtures(): CalibrationCaseInput[] {
  return [
    {
      caseId: "A-STABLE",
      title: "Stable player baseline",
      players: [p("p1", 0.3, 0.2)],
      yday: { intensity: "LOW", hsr_m: 250, acc_dec_total: 50, total_distance_m: 4500, max_velocity_pct: 75 },
      focusPlayerId: "p1",
      expectedOutcome: "Minimal/no neural bias",
      acceptableRange: "FULL or REDUCED with no aggressive player nudge",
    },
    {
      caseId: "B-BORDERLINE-NEURAL",
      title: "Borderline neural-risk player",
      players: [
        p("p2", -0.6, -0.1, {
          delta_z: -0.5,
          total_score: 47,
          energy: 2,
          sleep_quality: 2,
          sleep_duration: 2,
          stress: 4,
          low_sten_days: 1,
          sten_score: 4,
        }),
      ],
      yday: { intensity: "MEDIUM", hsr_m: 780, acc_dec_total: 115, total_distance_m: 8200, max_velocity_pct: 88 },
      focusPlayerId: "p2",
      expectedOutcome: "Bias may apply lightly",
      acceptableRange: "NORMAL or REDUCE_VOLUME",
    },
    {
      caseId: "C-NEURAL-OVERLOAD",
      title: "Clear neural overload",
      players: [
        p("p3", -1.4, -0.2, {
          delta_z: -1.2,
          total_score: 33,
          energy: 1,
          sleep_quality: 2,
          sleep_duration: 2,
          stress: 4,
          soreness: 1,
          low_sten_days: 2,
          sten_score: 3,
        }),
      ],
      yday: { intensity: "HIGH", hsr_m: 980, acc_dec_total: 145, total_distance_m: 9800, max_velocity_pct: 94, schedule_congestion: true },
      focusPlayerId: "p3",
      expectedOutcome: "Protective bias should apply",
      acceptableRange: "NO_SPRINT or REDUCE_VOLUME",
    },
    {
      caseId: "D-TISSUE-DOMINANT",
      title: "Tissue-dominant player",
      players: [
        p("p4", -0.4, -0.3, {
          soreness: 5,
          has_pain_flag: true,
          pain_location: "ACHILLES",
          repeated_same_complaint: true,
          local_complaint_matches_load: true,
          total_score: 50,
        }),
      ],
      yday: { intensity: "MEDIUM", hsr_m: 600, acc_dec_total: 130, total_distance_m: 7600, max_velocity_pct: 86 },
      focusPlayerId: "p4",
      expectedOutcome: "Tissue protection retained; neural tuning should not override it",
      acceptableRange: "REDUCE_VOLUME",
    },
    {
      caseId: "E-SYSTEMIC",
      title: "Systemic-fatigue player",
      players: [
        p("p5", -0.9, -0.5, {
          delta_z: -0.4,
          total_score: 34,
          energy: 2,
          sleep_quality: 2,
          sleep_duration: 2,
          stress: 5,
          soreness: 4,
          low_sten_days: 3,
          sten_score: 3,
        }),
      ],
      yday: { intensity: "MEDIUM", hsr_m: 700, acc_dec_total: 120, total_distance_m: 8400, max_velocity_pct: 88, match_minutes_high: true, match_minutes_played: 85, md_day: "MD+1" },
      focusPlayerId: "p5",
      expectedOutcome: "Recovery bias tendencies visible in adaptation",
      acceptableRange: "REDUCE_VOLUME or RECOVERY_ONLY",
    },
    {
      caseId: "F-TEAM-BORDERLINE-FR",
      title: "Team case near FULL/REDUCED boundary",
      players: [
        p("p6a", 0.2, 0.1),
        p("p6b", 0.1, 0.2),
        p("p6c", -0.2, -0.1, { energy: 2, sleep_quality: 2, stress: 4 }),
        p("p6d", 0.0, 0.1),
      ],
      yday: { intensity: "MEDIUM", hsr_m: 640, acc_dec_total: 110, total_distance_m: 7600, max_velocity_pct: 86 },
      expectedOutcome: "Useful for threshold tuning at full/reduced edge",
      acceptableRange: "FULL or REDUCED",
    },
    {
      caseId: "G-TEAM-BORDERLINE-RR",
      title: "Team case near REDUCED/RECOVERY boundary",
      players: [
        p("p7a", -0.9, -0.4, { energy: 2, sleep_quality: 2, stress: 4, low_sten_days: 2, sten_score: 4 }),
        p("p7b", -0.8, -0.3, { energy: 2, sleep_quality: 2, stress: 4, low_sten_days: 2, sten_score: 4 }),
        p("p7c", -0.7, -0.1, { energy: 2, sleep_duration: 2, stress: 4, low_sten_days: 1, sten_score: 4 }),
        p("p7d", -0.6, -0.2, { soreness: 4, total_score: 42 }),
      ],
      yday: { intensity: "HIGH", hsr_m: 900, acc_dec_total: 138, total_distance_m: 9300, max_velocity_pct: 92, schedule_congestion: true },
      expectedOutcome: "Useful for reduced/recovery edge calibration",
      acceptableRange: "REDUCED or RECOVERY",
    },
    {
      caseId: "H-SPARSE-DATA",
      title: "Sparse-data player",
      players: [
        p("p8", 0.0, 0.0, {
          total_score: null,
          energy: null,
          sleep_quality: null,
          sleep_duration: null,
          stress: null,
          soreness: null,
          sten_score: null,
          low_sten_days: 0,
        }),
      ],
      yday: { intensity: "LOW", hsr_m: null, acc_dec_total: null, total_distance_m: null, max_velocity_pct: null },
      focusPlayerId: "p8",
      expectedOutcome: "Conservative output, no over-aggressive protection",
      acceptableRange: "NORMAL or REDUCE_VOLUME depending on context",
    },
  ];
}

