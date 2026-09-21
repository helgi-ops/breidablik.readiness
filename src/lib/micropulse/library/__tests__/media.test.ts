import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { youTubeId, detectMediaKindFromUrl, filterMedia, collectTags, type CoachMediaRow } from "../media";

const row = (over: Partial<CoachMediaRow> = {}): CoachMediaRow => ({
  id: "m1", owner_type: "team", owner_coach_id: null, team_id: "t1",
  title: "Pressing trigger", kind: "video", external_url: "https://youtu.be/abcdefghijk",
  storage_path: null, tags: ["pressing", "defending"], drill_id: null, note: null,
  created_at: "2026-09-21T00:00:00Z", ...over,
});

describe("youTubeId", () => {
  it("pulls the id from every common shape", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("https://youtu.be/abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("https://youtube.com/embed/abcdefghijk")).toBe("abcdefghijk");
    expect(youTubeId("https://youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
  });
  it("is null for non-YouTube / empty", () => {
    expect(youTubeId("https://vimeo.com/12345")).toBe(null);
    expect(youTubeId(null)).toBe(null);
  });
});

describe("detectMediaKindFromUrl", () => {
  it("classifies video / image / doc", () => {
    expect(detectMediaKindFromUrl("https://youtu.be/abcdefghijk")).toBe("video");
    expect(detectMediaKindFromUrl("https://x.com/clip.mp4")).toBe("video");
    expect(detectMediaKindFromUrl("https://x.com/board.png")).toBe("image");
    expect(detectMediaKindFromUrl("https://x.com/plan.pdf")).toBe("doc");
    expect(detectMediaKindFromUrl("https://vimeo.com/12345")).toBe("video");
  });
});

describe("filterMedia", () => {
  const rows = [
    row({ id: "a", title: "Pressing trigger", tags: ["pressing"], kind: "video" }),
    row({ id: "b", title: "Set-piece board", tags: ["set-piece"], kind: "image", external_url: "https://x/b.png" }),
    row({ id: "c", title: "Transition clip", tags: ["transition", "pressing"], kind: "video", drill_id: "d9" }),
  ];
  it("free-text matches title/tags/note", () => {
    expect(filterMedia(rows, { q: "pressing" }).map((r) => r.id)).toEqual(["a", "c"]);
  });
  it("filters by kind, tag and linked drill", () => {
    expect(filterMedia(rows, { kind: "image" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterMedia(rows, { tag: "transition" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterMedia(rows, { drillId: "d9" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterMedia(rows, { kind: "all" })).toHaveLength(3);
  });
});

describe("collectTags", () => {
  it("returns distinct sorted tags", () => {
    expect(collectTags([row({ tags: ["b", "a"] }), row({ tags: ["a", "c"] })])).toEqual(["a", "b", "c"]);
  });
});

describe("boundary — the media lib never reaches readiness / decision modules", () => {
  it("media.ts imports nothing from those engines", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../media.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
