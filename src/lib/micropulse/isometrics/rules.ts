import type { IsoProfile, IsoPrescription } from "./types";

export const ISO_PROFILE_DEFAULTS: Record<IsoProfile, Omit<IsoPrescription, "isoProfile" | "angleLabel">> = {
  NEURAL: {
    holdSeconds: 4,
    sets: 4,
    restSeconds: 120,
    intensityLabel: "High / near-max effort",
    goalLabel: "Neural drive and force expression",
  },
  TENDON: {
    holdSeconds: 25,
    sets: 3,
    restSeconds: 90,
    intensityLabel: "Moderate to high effort",
    goalLabel: "Tendon stiffness and load tolerance",
  },
  RECOVERY: {
    holdSeconds: 35,
    sets: 3,
    restSeconds: 60,
    intensityLabel: "Low to moderate effort",
    goalLabel: "Recovery, pain modulation, and controlled loading",
  },
};

export const ISO_ANGLE_LABELS: Record<string, string> = {
  hamstring_iso: "Mid-range knee angle",
  copenhagen_iso: "Mid-range adductor position",
  ankle_iso: "Sport-specific ankle angle",
  iso_mid_thigh_pull: "Power position",
};
