/**
 * loadDsiForTeam (brief §4a, 2026-11-23): the mid-thigh pull per kg comes from VALD's ISO_BM_REL_FORCE_PEAK only — its
 * sibling ISO_BW_REL_FORCE_PEAK is × body weight (about 2.6, not 26) and must never be averaged in — and only from the
 * same test as the peak force. The peak force itself is unchanged by the extra rows.
 */
import { describe, expect, it } from "vitest";
import { loadDsiForTeam } from "../loadDsiForTeam";

const row = (pid: string, test: string, date: string, code: string, value: number, limb = "Trial") =>
  ({ microplayer_id: pid, raw_test_id: test, test_timestamp: `${date}T09:00:00Z`, metric_code: code, limb, value });

function sbWith(imtp: unknown[]) {
  const chain = (table: string) => {
    const data = table === "players" ? [{ id: "p1" }, { id: "p2" }] : table === "vald_test_metrics" ? imtp : [];
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "in", "order"]) c[k] = () => c;
    c.range = () => Promise.resolve({ data, error: null });
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
    return c;
  };
  return { from: chain };
}

describe("IMTP N/kg in the team read", () => {
  it("BM code only, same test as the peak force; peak force unchanged", async () => {
    const map = await loadDsiForTeam(sbWith([
      row("p1", "t2", "2026-11-01", "PEAK_VERTICAL_FORCE", 2400),
      row("p1", "t2", "2026-11-01", "PEAK_VERTICAL_FORCE", 2600),
      row("p1", "t2", "2026-11-01", "ISO_BM_REL_FORCE_PEAK", 30),
      row("p1", "t2", "2026-11-01", "ISO_BM_REL_FORCE_PEAK", 32),
      row("p1", "t2", "2026-11-01", "ISO_BW_REL_FORCE_PEAK", 3.1),
      row("p1", "t1", "2026-06-01", "PEAK_VERTICAL_FORCE", 2000),
      // p2: per-kg only on an older test than the peak force → not used.
      row("p2", "t4", "2026-11-02", "PEAK_VERTICAL_FORCE", 2200),
      row("p2", "t3", "2026-05-02", "ISO_BM_REL_FORCE_PEAK", 25),
    ]), "team");
    expect(map.get("p1")).toMatchObject({ imtpPeakForceN: 2500, imtpRelNkg: 31, imtpTestDate: "2026-11-01" });
    expect(map.get("p2")).toMatchObject({ imtpPeakForceN: 2200, imtpRelNkg: null });
  });
});
