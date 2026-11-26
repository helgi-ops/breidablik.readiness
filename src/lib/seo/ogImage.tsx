import { ImageResponse } from "next/og";

/**
 * The share image (Open Graph / Twitter) for public pages: bone background,
 * ink headline, cobalt accent and the MicroPulse dot waveform. Design tokens
 * from CLAUDE.md; drawn, so it never goes stale.
 */
export const OG_SIZE = { width: 1200, height: 630 };

// The pulse-mark waveform (public/brand/micropulse-mark.svg), as dot centres.
const WAVE: Array<[number, number]> = [
  [20, 120], [36, 120], [52, 120], [68, 120], [84, 120], [100, 112], [116, 100], [132, 112], [148, 120],
  [164, 120], [180, 108], [190, 92], [196, 74], [202, 56], [208, 40], [214, 56], [220, 74], [226, 92],
  [232, 110], [240, 128], [248, 138], [256, 128], [264, 120], [280, 112], [296, 104], [312, 112],
  [328, 120], [344, 120], [360, 120], [376, 120],
];

export function renderOgImage({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "#f4f2ec", color: "#14181c", padding: "64px 72px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", position: "relative", width: 132, height: 66 }}>
            {WAVE.map(([x, y], i) => (
              <div
                key={i}
                style={{
                  position: "absolute", left: x * 0.33 - 1.7, top: y * 0.33 - 1.7, width: 3.4, height: 3.4,
                  borderRadius: 9999, background: "#2740e6",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>MicroPulse</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 26, fontWeight: 600, color: "#2740e6", textTransform: "uppercase", letterSpacing: 2 }}>{eyebrow}</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 1000 }}>{title}</div>
          <div style={{ fontSize: 30, color: "#4a5056", maxWidth: 980, lineHeight: 1.3 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {["#1c7a4a", "#de9328", "#a83e28"].map((c) => (
            <div key={c} style={{ width: 56, height: 10, borderRadius: 9999, background: c }} />
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
