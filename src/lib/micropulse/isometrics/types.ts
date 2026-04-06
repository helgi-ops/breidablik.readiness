export type IsoProfile =
  | "NEURAL"
  | "TENDON"
  | "RECOVERY";

export interface IsoPrescription {
  isoProfile: IsoProfile;
  holdSeconds: number;
  sets: number;
  restSeconds: number;
  intensityLabel: string;
  angleLabel?: string | null;
  goalLabel: string;
}

export interface IsoContextInput {
  athleteState: "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED";
  mdContext: "MD5" | "MD4" | "MD3" | "MD2" | "MD1" | "MD_PLUS_1" | "OFF" | "UNKNOWN";
  nodeType?: string | null;
  sessionIntent?: string | null;
  exerciseId?: string | null;
}
