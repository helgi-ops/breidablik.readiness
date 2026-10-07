import { describe, it, expect } from "vitest";
import { unionOfGroups, assignmentMap, sanitizeGroups } from "../sessionRecipients";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

describe("named-team helpers", () => {
  it("unionOfGroups dedupes players across teams", () => {
    const groups = [
      { id: "a", name: "A", player_ids: [UUID(1), UUID(2)] },
      { id: "b", name: "B", player_ids: [UUID(2), UUID(3)] },
    ];
    expect(unionOfGroups(groups).sort()).toEqual([UUID(1), UUID(2), UUID(3)].sort());
  });

  it("assignmentMap maps each player to a team", () => {
    const m = assignmentMap([
      { id: "a", name: "A", player_ids: [UUID(1)] },
      { id: "b", name: "B", player_ids: [UUID(2)] },
    ]);
    expect(m.get(UUID(1))).toBe("a");
    expect(m.get(UUID(2))).toBe("b");
  });

  it("sanitizeGroups keeps uuids, trims names, enforces one team per player, drops empty teams", () => {
    const clean = sanitizeGroups(
      [
        { id: "a", name: "  Lið A  ", player_ids: [UUID(1), UUID(2), "not-a-uuid"] },
        { id: "b", name: "Lið B", player_ids: [UUID(2), UUID(3)] }, // UUID(2) already in A → dropped here
        { name: "empty", player_ids: [] }, // dropped
      ],
      isUuid
    );
    expect(clean).not.toBeNull();
    expect(clean!).toHaveLength(2);
    expect(clean![0]).toMatchObject({ name: "Lið A", player_ids: [UUID(1), UUID(2)] });
    expect(clean![1].player_ids).toEqual([UUID(3)]); // UUID(2) not duplicated
  });

  it("sanitizeGroups → null when there is no real split", () => {
    expect(sanitizeGroups([], isUuid)).toBeNull();
    expect(sanitizeGroups([{ name: "x", player_ids: [] }], isUuid)).toBeNull();
    expect(sanitizeGroups("nope", isUuid)).toBeNull();
  });
});
