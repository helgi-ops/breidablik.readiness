import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  generateTerraWidgetSession,
  verifyTerraSignature,
  mapTerraSleep,
  mapTerraDaily,
  TERRA_PHASE1_PROVIDERS,
} from "../terra";

beforeEach(() => {
  process.env.TERRA_DEV_ID = "micropulse-prod-AcuwmPJraZ";
  process.env.TERRA_API_KEY = "test-api-key";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateTerraWidgetSession", () => {
  it("POSTs with dev-id/x-api-key headers, reference_id and Phase-1 providers:WHOOP", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "success", url: "https://widget.tryterra.co/session/abc", session_id: "sess_1" }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await generateTerraWidgetSession({
      referenceId: "profile-123",
      successUrl: "https://app.micropulse.is/player/settings/integrations?connected=terra",
      failureUrl: "https://app.micropulse.is/player/settings/integrations?connected=terra&error=1",
    });

    expect(out).toEqual({ url: "https://widget.tryterra.co/session/abc", sessionId: "sess_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tryterra.co/v2/auth/generateWidgetSession");
    const headers = init.headers as Record<string, string>;
    expect(headers["dev-id"]).toBe("micropulse-prod-AcuwmPJraZ");
    expect(headers["x-api-key"]).toBe("test-api-key");
    const body = JSON.parse(String(init.body));
    expect(body.reference_id).toBe("profile-123");
    expect(body.providers).toBe(TERRA_PHASE1_PROVIDERS);
    expect(TERRA_PHASE1_PROVIDERS).toBe("WHOOP");
    expect(body.auth_success_redirect_url).toContain("connected=terra");
  });

  it("throws when the x-api-key/dev-id are missing", async () => {
    delete process.env.TERRA_API_KEY;
    await expect(
      generateTerraWidgetSession({ referenceId: "p", successUrl: "s", failureUrl: "f" })
    ).rejects.toThrow(/not configured/i);
  });
});

describe("verifyTerraSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "sleep", user: { user_id: "u1" }, data: [] });
  const sign = (t: string, payload: string) => createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");

  it("accepts a correctly signed payload", () => {
    const t = "1700000000";
    const header = `t=${t},v1=${sign(t, body)}`;
    expect(verifyTerraSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, and a missing header", () => {
    const t = "1700000000";
    const header = `t=${t},v1=${sign(t, body)}`;
    expect(verifyTerraSignature(body + " ", header, secret)).toBe(false); // body changed
    expect(verifyTerraSignature(body, header, "other")).toBe(false); // wrong secret
    expect(verifyTerraSignature(body, null, secret)).toBe(false); // no header
    expect(verifyTerraSignature(body, "v1=deadbeef", secret)).toBe(false); // no t
  });
});

describe("mapTerraSleep", () => {
  it("maps a Terra sleep object → WearableSleepNight (seconds→minutes, wake-up date)", () => {
    const nights = mapTerraSleep([
      {
        metadata: { start_time: "2026-10-06T23:10:00+00:00", end_time: "2026-10-07T07:10:00+00:00", summary_id: "sum-1" },
        sleep_durations_data: {
          sleep_efficiency: 0.92,
          asleep: {
            duration_asleep_state_seconds: 27000, // 450 min
            duration_deep_sleep_state_seconds: 5400, // 90
            duration_REM_sleep_state_seconds: 6000, // 100
            duration_light_sleep_state_seconds: 15600, // 260
          },
          awake: { duration_awake_state_seconds: 1200 }, // 20
        },
        scores: { sleep: 88 },
      },
    ]);
    expect(nights).toHaveLength(1);
    const n = nights[0];
    expect(n.sleepDate).toBe("2026-10-07"); // dated by wake-up (end_time)
    expect(n.totalSleepMin).toBe(450);
    expect(n.deepSleepMin).toBe(90);
    expect(n.remSleepMin).toBe(100);
    expect(n.lightSleepMin).toBe(260);
    expect(n.wakeMin).toBe(20);
    expect(n.sleepEfficiencyPct).toBeCloseTo(92, 5); // fraction → %
    expect(n.providerScore).toBe(88);
    expect(n.sourceRecordId).toBe("terra:sleep:sum-1");
  });

  it("is null-safe (missing fields → nulls, bad array → [])", () => {
    const [n] = mapTerraSleep([{ metadata: { end_time: "2026-10-07T07:00:00Z" } }]);
    expect(n.totalSleepMin).toBeNull();
    expect(n.sleepEfficiencyPct).toBeNull();
    expect(mapTerraSleep("nope")).toEqual([]);
    expect(mapTerraSleep([{ metadata: {} }])).toEqual([]); // no date → dropped
  });
});

describe("mapTerraDaily", () => {
  it("maps resting HR / HRV RMSSD / recovery score", () => {
    const [d] = mapTerraDaily([
      {
        metadata: { start_time: "2026-10-07T00:00:00Z", summary_id: "d-1" },
        heart_rate_data: { summary: { resting_hr_bpm: 48, avg_hrv_rmssd: 71.5 } },
        scores: { recovery: 66 },
      },
    ]);
    expect(d.measurementDate).toBe("2026-10-07");
    expect(d.restingHrBpm).toBe(48);
    expect(d.hrvRmssdMs).toBeCloseTo(71.5, 5);
    expect(d.providerRecoveryScore).toBe(66);
    expect(d.sourceRecordId).toBe("terra:daily:d-1");
  });
});
