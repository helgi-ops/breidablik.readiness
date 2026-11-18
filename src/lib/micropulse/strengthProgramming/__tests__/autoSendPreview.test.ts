/**
 * "B" (2026-11-18): before the 09:00 automatic send, the player's Today card is a preview. On teams with the send on
 * (individualised modes), the engine default is built by the SAME builder as the send, so the card at 08:30 is the
 * session that arrives at 09:00 (checked on Breiðablik's 23 sessions of 2026-11-18: identical). Layer order unchanged.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { autoSendPreviewNote } from "../autoSendPreview";

const base = { autoTeam: true, isToday: true, nowHHMM: "08:30", sameAsSend: true, isIS: false };

describe("autoSendPreviewNote", () => {
  it("before 09:00 on an auto-send team: a preview, said plainly", () => {
    expect(autoSendPreviewNote(base)?.title).toBe("Preview · your coach's plan");
    expect(autoSendPreviewNote(base)?.text).toMatch(/sent to you at 09:00/);
    expect(autoSendPreviewNote({ ...base, isIS: true })?.title).toBe("Forsýn · áætlun þjálfarans");
  });
  it("a card built another way (team programme) says the 09:00 session may differ", () => {
    expect(autoSendPreviewNote({ ...base, sameAsSend: false })?.text).toMatch(/may differ/);
    expect(autoSendPreviewNote({ ...base, sameAsSend: false, isIS: true })?.text).toMatch(/getur verið önnur/);
  });
  it("nothing from 09:00 on, on other days, or when auto-send is off", () => {
    expect(autoSendPreviewNote({ ...base, nowHHMM: "09:00" })).toBeNull();
    expect(autoSendPreviewNote({ ...base, nowHHMM: "14:10" })).toBeNull();
    expect(autoSendPreviewNote({ ...base, isToday: false })).toBeNull();
    expect(autoSendPreviewNote({ ...base, autoTeam: false })).toBeNull();
  });
  it("no jargon, no gendered words", () => {
    const all = [true, false].flatMap((same) => [true, false].map((isIS) => autoSendPreviewNote({ ...base, sameAsSend: same, isIS })));
    expect(JSON.stringify(all)).not.toMatch(/MD-|verdict|individualis|hans\b|engine/i);
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../../../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the default route previews with the send's own builder, today only, display-only", () => {
    const src = read("src/app/api/player/today-strength-default/route.ts");
    expect(src).toMatch(/if \(teamId && day === todayIso\(\)\)/);
    expect(src).toMatch(/t\?\.strength_auto_send && mode !== "standard"/);
    expect(src).toMatch(/buildAutoSession\(sb, ctx,/);
    expect(src).toMatch(/autoPreview: new Date\(\)\.toISOString\(\)\.slice\(11, 16\) < AUTO_SEND_AT/);
    expect(src).not.toMatch(/persistTodayStrengthOverride\(|from\("player_today_strength_override"\)|notifyPlayer\(/);
    // The week check still comes first: no week set / day off → no preview.
    expect(src.indexOf('reason: "no_planned_day"')).toBeLessThan(src.indexOf("buildAutoSession(sb, ctx,"));
  });
  it("Today labels it, never on a coach-sent card, and the layer order is untouched", () => {
    const src = read("src/app/player/PlayerClient.tsx");
    expect(src).toMatch(/previewNote: plan\?\.source === "COACH_SENT" \? null : autoSendPreviewNote\(/);
    expect(src).toMatch(/sameAsSend: plan\?\.source === "ENGINE_DEFAULT" && plan\?\.auto_preview === true/);
    expect(src).toMatch(/auto_preview: def\.autoPreview === true/);
    // The engine default is still only asked for when no real source has content.
    expect(src).toMatch(/if \(!planHasStructure && planFinal\?\.source !== "COACH_SENT"\) \{/);
  });
});
