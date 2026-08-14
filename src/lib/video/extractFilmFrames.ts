/**
 * extractFilmFrames — client-side (browser) frame sampler for short basketball clips.
 *
 * The app runs on Vercel (serverless, ~4.5 MB body / ~300s ceiling) with NO ffmpeg/CV in
 * the stack, so a raw video can never be decoded server-side. Instead the browser decodes
 * the clip in an off-screen <video>, seeks to N evenly-spaced timestamps, and captures each
 * to a downscaled <canvas>. Only the small JPEG frames (bare base64) leave the client — the
 * video bytes never touch the network. The frames are then handed to Claude vision.
 *
 * Descriptive tooling — this file computes nothing about readiness/load; it only samples pixels.
 */

/** A short clip past this (seconds) still works, but ≤12 sampled frames get coarse — warn. */
export const MAX_CLIP_SECONDS = 45;

/** Hard ceiling on frames: bounds both the POST payload and the vision token cost. */
export const MAX_FRAMES = 12;

export type ExtractResult = {
  /** Bare base64 JPEG strings (no `data:` prefix) — ready for an Anthropic image block. */
  frames: string[];
  durationSec: number;
  width: number;
  height: number;
  /** The timestamps (seconds) each frame was sampled at, in order. */
  sampledAt: number[];
};

/** Thrown when the browser can't decode this file (commonly HEVC / .mov / DRM / corrupt). */
export class FrameExtractError extends Error {
  code: "DECODE_UNSUPPORTED" | "NO_DURATION" | "ABORTED";
  constructor(code: FrameExtractError["code"], message: string) {
    super(message);
    this.name = "FrameExtractError";
    this.code = code;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function waitEvent(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      el.removeEventListener(ok, onOk);
      el.removeEventListener("error", onErr);
      clearTimeout(timer);
    };
    const onOk = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const onErr = () => { if (!done) { done = true; cleanup(); reject(new FrameExtractError("DECODE_UNSUPPORTED", "The browser could not decode this video.")); } };
    const timer = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new FrameExtractError("DECODE_UNSUPPORTED", `Timed out waiting for "${ok}".`)); } }, timeoutMs);
    el.addEventListener(ok, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}

/** Cheap luminance variance on a downsampled read — near-zero ⇒ a blank / letterbox frame. */
function frameVariance(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0, sumSq = 0, n = 0;
    // Sample every ~64th pixel — enough to tell "black frame" from "real frame" cheaply.
    for (let i = 0; i < data.length; i += 256) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum; sumSq += lum * lum; n++;
    }
    if (n === 0) return 0;
    const mean = sum / n;
    return sumSq / n - mean * mean;
  } catch {
    // getImageData can throw on a tainted canvas — treat as "can't tell", not blank.
    return Infinity;
  }
}

/**
 * Sample `count` frames (default 8, hard-capped at 12) from a short clip.
 * @throws {FrameExtractError} with code DECODE_UNSUPPORTED when the browser can't decode it.
 */
export async function extractFilmFrames(
  file: File,
  opts: { count?: number; maxWidth?: number; quality?: number } = {},
): Promise<ExtractResult> {
  const count = clamp(Math.round(opts.count ?? 8), 1, MAX_FRAMES);
  const maxWidth = opts.maxWidth ?? 640;
  const quality = opts.quality ?? 0.7;

  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.src = url;

  try {
    await waitEvent(v, "loadedmetadata", 15000);
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new FrameExtractError("NO_DURATION", "This clip has no readable duration.");
    }
    if (!v.videoWidth || !v.videoHeight) {
      throw new FrameExtractError("DECODE_UNSUPPORTED", "The browser reported no video dimensions (often HEVC/.mov).");
    }

    const scale = Math.min(1, maxWidth / v.videoWidth);
    const cw = Math.max(1, Math.round(v.videoWidth * scale));
    const ch = Math.max(1, Math.round(v.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new FrameExtractError("DECODE_UNSUPPORTED", "Could not get a 2D canvas context.");

    // Evenly spaced across the middle of the clip, avoiding the very first/last frame.
    const lo = Math.min(0.1, duration * 0.02);
    const hi = Math.max(lo, duration - Math.min(0.1, duration * 0.02));
    const span = hi - lo;
    const times = count === 1
      ? [lo + span / 2]
      : Array.from({ length: count }, (_, i) => lo + (span * i) / (count - 1));

    const frames: string[] = [];
    const sampledAt: number[] = [];
    for (let i = 0; i < times.length; i++) {
      let t = clamp(times[i], 0, Math.max(0, duration - 0.01));
      v.currentTime = t;
      await waitEvent(v, "seeked", 10000);
      ctx.drawImage(v, 0, 0, cw, ch);
      // Blank/letterbox guard: nudge once and re-grab if the frame is near-flat.
      if (frameVariance(ctx, cw, ch) < 3 && span > 0.6) {
        t = clamp(t + 0.3, 0, Math.max(0, duration - 0.01));
        v.currentTime = t;
        await waitEvent(v, "seeked", 10000);
        ctx.drawImage(v, 0, 0, cw, ch);
      }
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      if (base64 && base64 !== dataUrl) { frames.push(base64); sampledAt.push(Math.round(t * 10) / 10); }
    }

    if (frames.length === 0) {
      throw new FrameExtractError("DECODE_UNSUPPORTED", "No frames could be captured from this clip.");
    }
    return { frames, durationSec: duration, width: v.videoWidth, height: v.videoHeight, sampledAt };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
