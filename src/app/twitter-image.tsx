import { OG_SIZE, renderOgImage } from "@/lib/seo/ogImage";

export const alt = "MicroPulse — training load and readiness, every verdict explained";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Training intelligence",
    title: "Know who is ready to train — and why",
    sub: "Readiness and load for clubs and personal trainers. Rules decide, every verdict is explained.",
  });
}
