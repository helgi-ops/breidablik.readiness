import { describe, it, expect } from "vitest";
import { parseModelJson } from "../extractReport";

describe("parseModelJson", () => {
  it("parses clean JSON", () => {
    expect(parseModelJson('{"player_name":"A","injury_history":[]}')).toEqual({ player_name: "A", injury_history: [] });
  });

  it("strips a markdown code fence", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores stray preamble/trailer around the object", () => {
    expect(parseModelJson('Here is the JSON:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it("recovers from a trailing comma before a closing brace (the observed failure)", () => {
    // Reproduces "Expected double-quoted property name" — a comma before `}`.
    const bad = '{\n  "player_name": "Þorleifur",\n  "injury_history": [\n    { "body_part": "hné", "side": "left" },\n  ],\n}';
    expect(parseModelJson(bad)).toEqual({ player_name: "Þorleifur", injury_history: [{ body_part: "hné", side: "left" }] });
  });

  it("throws on genuinely unparseable text so the caller can 422", () => {
    expect(() => parseModelJson("not json at all")).toThrow();
  });
});
