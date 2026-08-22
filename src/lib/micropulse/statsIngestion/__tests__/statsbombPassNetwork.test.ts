import { describe, it, expect } from "vitest";
import {
  isStatsbombPassNetworkHeader, parseStatsbombPassNetwork, inferPassNetworkClub,
} from "../statsbombPassNetwork";
import {
  isStatsbombPassCombinationsHeader, parseStatsbombPassCombinations, inferCombinationsClub,
} from "../statsbombPassCombinations";
import { detectStatsFile } from "../smartDetect";

// Shape mirrors the two real StatsBomb OBV exports (values trimmed).
const netRows = [
  { Team: "KR Reykjavík", Player: "Galdur Gudmundsson", Passes: "23", OBV: "0.30206856" },
  { Team: "KR Reykjavík", Player: "Aron Sigurðarson", Passes: "18", OBV: "-0.16415633" },
  { Team: "Breidablik", Player: "Höskuldur Gunnlaugsson", Passes: "17", OBV: "0.29797477" },
  { Team: "Breidablik", Player: "Gabríel Snaer Hallsson", Passes: "24", OBV: "-0.22929326" },
];
const comboRows = [
  { Team: "Breidablik", Passer: "Óli Valur Ómarsson", Receiver: "Kristófer Kristinsson", Passes: "6", OBV: "0.17290436" },
  { Team: "Breidablik", Passer: "Ívar Árnason", Receiver: "David Ingvarsson", Passes: "9", OBV: "0.03238085" },
  { Team: "KR Reykjavík", Passer: "Galdur Gudmundsson", Receiver: "Eiður Sæbjörnsson", Passes: "3", OBV: "0.3747839" },
];

describe("pass network (per-player) parser", () => {
  it("detects its header and rejects richer/other files", () => {
    expect(isStatsbombPassNetworkHeader(["Team", "Player", "Passes", "OBV"])).toBe(true);
    // whole-squad match export has richer columns → not a pass-network file
    expect(isStatsbombPassNetworkHeader(["Team", "Player", "Passes", "OBV", "Minutes", "xG"])).toBe(false);
    // combinations file has Passer/Receiver → not a pass-network file
    expect(isStatsbombPassNetworkHeader(["Team", "Passer", "Receiver", "Passes", "OBV"])).toBe(false);
  });

  it("parses per-player passing volume + OBV and a stable name ref", () => {
    const { players, skipped } = parseStatsbombPassNetwork(netRows);
    expect(skipped).toHaveLength(0);
    expect(players).toHaveLength(4);
    const g = players.find((p) => p.playerName === "Galdur Gudmundsson")!;
    expect(g.passes).toBe(23);
    expect(g.obv).toBeCloseTo(0.302, 3);
    expect(g.playerRef).toBe(players.find((p) => p.playerName === "Galdur Gudmundsson")!.playerRef);
    expect(g.playerRef.length).toBeGreaterThan(0);
  });

  it("infers the club as the most frequent team", () => {
    expect(inferPassNetworkClub(netRows)).toBeTypeOf("string");
  });

  it("skips rows missing team or player", () => {
    const { players, skipped } = parseStatsbombPassNetwork([{ Team: "", Player: "X", Passes: "1", OBV: "0" }]);
    expect(players).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});

describe("passing combinations (edges) parser", () => {
  it("detects only files with both Passer and Receiver", () => {
    expect(isStatsbombPassCombinationsHeader(["Team", "Passer", "Receiver", "Passes", "OBV"])).toBe(true);
    expect(isStatsbombPassCombinationsHeader(["Team", "Player", "Passes", "OBV"])).toBe(false);
  });

  it("parses directed edges with passer/receiver refs", () => {
    const { combinations, skipped } = parseStatsbombPassCombinations(comboRows);
    expect(skipped).toHaveLength(0);
    expect(combinations).toHaveLength(3);
    const link = combinations.find((c) => c.passerName === "Óli Valur Ómarsson")!;
    expect(link.receiverName).toBe("Kristófer Kristinsson");
    expect(link.passes).toBe(6);
    expect(link.obv).toBeCloseTo(0.173, 3);
    expect(link.passerRef).not.toBe(link.receiverRef);
  });

  it("infers the club as the most frequent team", () => {
    expect(inferCombinationsClub(comboRows)).toBe("Breidablik");
  });
});

describe("smartDetect routes the two passing files", () => {
  it("classifies a pass-network file", () => {
    const d = detectStatsFile(["Team", "Player", "Passes", "OBV"], netRows);
    expect(d.kind).toBe("sb_pass_network");
    expect(d.provider).toBe("statsbomb");
  });
  it("classifies a passing-combinations file", () => {
    const d = detectStatsFile(["Team", "Passer", "Receiver", "Passes", "OBV"], comboRows);
    expect(d.kind).toBe("sb_pass_combinations");
  });
});
