/**
 * SSG Intensity Prediction
 *
 * Áætlað %HRmax fyrir small-sided games byggt á leikmannafjölda og
 * flatarmáli á leikmann, út frá systematic review-inu:
 *
 *   Hill-Haas, Dawson, Impellizzeri & Coutts (2011).
 *   Physiology of Small-Sided Games Training in Football: A Systematic Review.
 *   Sports Medicine, 41(3), 199-220.
 *
 * Tölurnar hér eru miðgildi úr Table I–IV (Aroso, Owen, Rampinini,
 * Williams & Owen, Kelly & Drust, Little & Williams, Dellal o.fl.).
 *
 * Þetta er ESTIMATE — notað sem leiðbeining, ekki nákvæm mæling.
 */

export type IntensityBand = "low" | "moderate" | "high" | "very_high";

export interface SsgIntensityEstimate {
  /** Áætlað %HRmax (miðgildi úr review-i) */
  estHrMaxPct: number;
  /** Flokkur fyrir lit og tag */
  band: IntensityBand;
  /** Íslenskt label */
  label: string;
  /** Lýsing í tooltipi */
  description: string;
  /** MD-dagar sem passa best (MD-X) */
  suitableMdDays: string[];
}

/**
 * Viðmiðunargögn: leikmenn-per-team -> array af { m²/leikm, %HRmax }
 * Teknar beint úr Hill-Haas 2011, Tables I–IV.
 */
const REFERENCE: Record<number, Array<{ m2: number; hr: number }>> = {
  // 1v1 — Owen et al.
  1: [
    { m2: 25, hr: 86.0 },
    { m2: 75, hr: 87.3 },
    { m2: 150, hr: 89.0 },
  ],
  // 2v2 — Aroso, Owen, Sampaio, Dellal
  2: [
    { m2: 38, hr: 84.2 },
    { m2: 50, hr: 80.1 },
    { m2: 75, hr: 87.4 },
    { m2: 100, hr: 80.1 },
    { m2: 125, hr: 88.1 },
    { m2: 150, hr: 83.9 },
  ],
  // 3v3 — Aroso, Owen, Rampinini, Kelly&Drust, Little&Williams
  3: [
    { m2: 40, hr: 89.5 },
    { m2: 50, hr: 81.7 },
    { m2: 63, hr: 90.5 },
    { m2: 81, hr: 88.0 },
    { m2: 83, hr: 81.8 },
    { m2: 90, hr: 90.9 },
    { m2: 100, hr: 87.0 },
    { m2: 123, hr: 91.0 },
    { m2: 125, hr: 84.8 },
  ],
  // 4v4 — Aroso, Owen, Rampinini, Kelly&Drust, Little&Williams, Dellal
  4: [
    { m2: 48, hr: 88.7 },
    { m2: 63, hr: 72.0 },
    { m2: 75, hr: 70.0 },
    { m2: 94, hr: 78.5 },
    { m2: 108, hr: 89.7 },
    { m2: 125, hr: 90.1 },
    { m2: 150, hr: 85.0 },
  ],
  // 5v5 — Owen, Rampinini, Kelly&Drust, Little&Williams, Platt
  5: [
    { m2: 56, hr: 87.8 },
    { m2: 60, hr: 91.0 },
    { m2: 75, hr: 75.7 },
    { m2: 100, hr: 82.0 },
    { m2: 105, hr: 79.5 },
    { m2: 111, hr: 89.3 },
    { m2: 120, hr: 90.0 },
    { m2: 126, hr: 88.8 },
    { m2: 140, hr: 80.2 },
    { m2: 149, hr: 82.5 },
    { m2: 200, hr: 89.0 },
  ],
  // 6v6 — Rampinini, Little&Williams, Hill-Haas
  6: [
    { m2: 64, hr: 86.4 },
    { m2: 100, hr: 87.0 },
    { m2: 104, hr: 87.5 },
    { m2: 144, hr: 86.9 },
    { m2: 149, hr: 81.4 },
  ],
  // 8v8 — Little&Williams, Dellal
  8: [
    { m2: 169, hr: 75.8 }, // Little&Williams 187m² -> ~79; Dellal 169 -> 80
    { m2: 187, hr: 79.0 },
  ],
};

/** Línuleg interpolation (eða næsta nágranni fyrir utan svið) */
function interpolate(points: Array<{ m2: number; hr: number }>, target: number): number {
  if (points.length === 0) return 85;
  if (points.length === 1) return points[0].hr;
  const sorted = [...points].sort((a, b) => a.m2 - b.m2);
  if (target <= sorted[0].m2) return sorted[0].hr;
  if (target >= sorted[sorted.length - 1].m2) return sorted[sorted.length - 1].hr;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (target >= a.m2 && target <= b.m2) {
      const t = (target - a.m2) / (b.m2 - a.m2);
      return a.hr + t * (b.hr - a.hr);
    }
  }
  return 85;
}

function bandFor(hr: number): IntensityBand {
  if (hr >= 90) return "very_high";
  if (hr >= 85) return "high";
  if (hr >= 78) return "moderate";
  return "low";
}

function labelFor(band: IntensityBand): string {
  switch (band) {
    case "very_high":
      return "Mjög hátt álag";
    case "high":
      return "Hátt álag";
    case "moderate":
      return "Miðlungs álag";
    case "low":
      return "Létt álag";
  }
}

function mdDaysFor(band: IntensityBand, playersPerTeam: number): string[] {
  // SSGs with fewer players & higher %HRmax -> overload days (MD-5/MD-4)
  // Larger formats, match-like -> MD-3
  // Lower intensity -> MD-2/MD-1 or recovery
  if (band === "very_high" && playersPerTeam <= 4) return ["MD-5", "MD-4"];
  if (band === "high" && playersPerTeam <= 4) return ["MD-5", "MD-4"];
  if (band === "high" && playersPerTeam >= 5) return ["MD-4", "MD-3"];
  if (band === "moderate" && playersPerTeam >= 5) return ["MD-3", "MD-2"];
  if (band === "moderate") return ["MD-3"];
  if (band === "low") return ["MD-2", "MD-1"];
  return ["MD-3"];
}

/**
 * Reiknar áætlað %HRmax fyrir SSG drill.
 *
 * @param totalPlayers heildar leikmannafjöldi á vellinum (t.d. 6 fyrir 3v3)
 * @param areaPerPlayerM2 flatarmál á leikmann (m²)
 * @returns null ef gögn duga ekki, annars estimate
 */
export function estimateSsgIntensity(
  totalPlayers: number | null | undefined,
  areaPerPlayerM2: number | null | undefined
): SsgIntensityEstimate | null {
  if (!totalPlayers || !areaPerPlayerM2) return null;
  if (totalPlayers < 2 || areaPerPlayerM2 < 10 || areaPerPlayerM2 > 400) return null;

  // Assume símmetrískt format: players per team = total / 2
  const perTeam = Math.round(totalPlayers / 2);
  if (perTeam < 1 || perTeam > 11) return null;

  // Finna nærliggjandi stærð (t.d. ef 7v7 þá interpolate-um milli 6 og 8)
  const available = Object.keys(REFERENCE)
    .map(Number)
    .sort((a, b) => a - b);

  let hrEstimate: number;
  if (REFERENCE[perTeam]) {
    hrEstimate = interpolate(REFERENCE[perTeam], areaPerPlayerM2);
  } else {
    // Finna tvo næstu og interpolate-a
    const lower = [...available].reverse().find((n) => n < perTeam);
    const higher = available.find((n) => n > perTeam);
    if (lower && higher) {
      const hrLower = interpolate(REFERENCE[lower], areaPerPlayerM2);
      const hrHigher = interpolate(REFERENCE[higher], areaPerPlayerM2);
      const t = (perTeam - lower) / (higher - lower);
      hrEstimate = hrLower + t * (hrHigher - hrLower);
    } else if (lower) {
      hrEstimate = interpolate(REFERENCE[lower], areaPerPlayerM2);
    } else if (higher) {
      hrEstimate = interpolate(REFERENCE[higher], areaPerPlayerM2);
    } else {
      return null;
    }
  }

  // Clamp
  hrEstimate = Math.max(65, Math.min(95, hrEstimate));
  const band = bandFor(hrEstimate);

  return {
    estHrMaxPct: Math.round(hrEstimate * 10) / 10,
    band,
    label: labelFor(band),
    description: `Áætlað ~${Math.round(hrEstimate)}% HRmax fyrir ${perTeam}v${perTeam} á ${Math.round(areaPerPlayerM2)} m²/leikm. Byggt á Hill-Haas et al. (2011) systematic review.`,
    suitableMdDays: mdDaysFor(band, perTeam),
  };
}

/** Tailwind CSS classes fyrir hvern flokk */
export function bandColorClasses(band: IntensityBand): {
  bg: string;
  text: string;
  border: string;
} {
  switch (band) {
    case "very_high":
      return { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" };
    case "high":
      return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
    case "moderate":
      return { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" };
    case "low":
      return { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" };
  }
}
