/**
 * Titan (Integrated Bionics / Hudl) indoor IMU adapter — barrel.
 * Mirrors the WIMU adapter pattern: a standalone parser + a pure row→external-load mapper.
 * Indoor, IMU-only (Player Load / Impacts / Jumps / durations); GPS stays null. source="titan".
 */
export * from "./parseSyncedData";
export * from "./toExternalLoad";
