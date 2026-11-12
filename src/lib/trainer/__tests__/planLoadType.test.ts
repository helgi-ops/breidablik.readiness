import { describe, expect, it } from "vitest";
import { toDbLoadType } from "../planLoadType";

describe("toDbLoadType — plan builder load type → DB check-constraint vocabulary", () => {
  it("maps the plan builder's values", () => {
    expect(toDbLoadType("kg")).toBe("absolute_kg");
    expect(toDbLoadType("%1RM")).toBe("pct_1rm");
    expect(toDbLoadType("RPE")).toBe("rpe_target");
    expect(toDbLoadType("velocity")).toBeNull();
  });
  it("passes DB values through and nulls the rest", () => {
    for (const v of ["absolute_kg", "pct_1rm", "rpe_target", "bodyweight"]) expect(toDbLoadType(v)).toBe(v);
    expect(toDbLoadType("toString")).toBeNull();
    expect(toDbLoadType(undefined)).toBeNull();
    expect(toDbLoadType("lbs")).toBeNull();
  });
});
