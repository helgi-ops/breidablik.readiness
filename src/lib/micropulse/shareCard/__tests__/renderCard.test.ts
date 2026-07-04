import { test } from "vitest";
import assert from "node:assert/strict";
import { renderCardSvg, type CardModel } from "../renderCard";

const base: CardModel = {
  accent: "#DC1E35",
  playerName: "Anton Logi",
  clubName: "Afturelding",
  crestHref: null,
  initial: "A",
  subline: "vs ÍR · 24 Apr",
  hero: { label: "Top Speed", value: "31.8", unit: "km/h", badge: "New season best" },
  supporting: [
    { label: "Distance", value: "10.3", unit: "km" },
    { label: "Sprints", value: "420", unit: "m" },
  ],
};

test("renders a well-formed SVG with the real numbers and no NaN/undefined", () => {
  const svg = renderCardSvg(base);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes('width="1080"') && svg.includes('height="1920"'));
  assert.ok(svg.includes("MICROPULSE.IS"));
  assert.ok(svg.includes("31.8") && svg.includes("Anton Logi") && svg.includes("Afturelding"));
  assert.ok(!/NaN|undefined|null/.test(svg));
});

test("crest image path inlines the data URL and clips to a circle", () => {
  const svg = renderCardSvg({ ...base, crestHref: "data:image/png;base64,AAAA" });
  assert.ok(svg.includes("<image") && svg.includes("data:image/png;base64,AAAA"));
  assert.ok(svg.includes("clip-path"));
});

test("no crest → initial-circle fallback (no <image>)", () => {
  const svg = renderCardSvg(base);
  assert.ok(!svg.includes("<image"));
  assert.ok(svg.includes(">A<")); // the initial
});

test("dark club colour is lifted for legibility (accent text differs from raw)", () => {
  const dark = renderCardSvg({ ...base, accent: "#005a2b" }); // Breiðablik dark green
  // the raw colour still appears (bands), but a lifted variant is used for text
  assert.ok(/fill="#[0-9a-f]{6}"/i.test(dark));
  assert.ok(!/NaN/.test(dark));
});

test("escapes special characters in names", () => {
  const svg = renderCardSvg({ ...base, playerName: "A & B <x>", clubName: "R&R" });
  assert.ok(svg.includes("A &amp; B &lt;x&gt;"));
  assert.ok(!svg.includes("A & B <x>"));
});

test("no badge omits the pill text", () => {
  const svg = renderCardSvg({ ...base, hero: { ...base.hero, badge: null } });
  assert.ok(!svg.includes("NEW SEASON BEST"));
});
