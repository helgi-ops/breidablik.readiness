import { OG_SIZE, renderOgImage } from "@/lib/seo/ogImage";

export const alt = "MicroPulse for personal trainers";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "For personal trainers",
    title: "Your clients' training, in one app",
    sub: "Programmes, logged sets, sessions that adapt to how they feel, and a monthly report — free in early access.",
  });
}
