/**
 * Browser pose extraction (Stage 2, client-only). Loads the shared MediaPipe
 * BlazePose landmarker at runtime (from a CDN — no bundled dependency) and runs
 * it over an uploaded video to produce `PoseFrame[]` for the pure analyser. The
 * video is processed IN THE BROWSER (the raw clip is not sent anywhere for pose
 * estimation), keeping PHI local until the coach confirms and saves.
 *
 * This is the only non-deterministic, non-unit-tested part of the pipeline. It
 * degrades gracefully: a load/decode failure throws a clear error and the coach
 * records findings manually.
 */
import type { PoseFrame, PoseLandmark } from "./landmarks";

const TASKS_VERSION = "0.10.14";
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

export type ExtractProgress = (fraction: number) => void;

function once(el: HTMLVideoElement, ev: string): Promise<void> {
  return new Promise((resolve) => {
    const h = () => { el.removeEventListener(ev, h); resolve(); };
    el.addEventListener(ev, h);
  });
}

/**
 * Extract pose frames from a video File. Samples ~fps frames per second up to
 * maxFrames. Runs entirely client-side. Throws on load/decode failure.
 */
export async function extractPoseFrames(
  file: File,
  opts: { fps?: number; maxFrames?: number; onProgress?: ExtractProgress } = {},
): Promise<PoseFrame[]> {
  if (typeof window === "undefined") throw new Error("Pose extraction runs in the browser only");
  const fps = opts.fps ?? 30;
  const maxFrames = opts.maxFrames ?? 150;

  // Runtime CDN import (variable specifier → never bundled).
  const visionMod: unknown = await import(/* webpackIgnore: true */ VISION_URL).catch(() => {
    throw new Error("Could not load the pose model (network/CDN blocked). Record findings manually.");
  });
  const vision = visionMod as {
    FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
    PoseLandmarker: { createFromOptions: (fs: unknown, o: unknown) => Promise<PoseLandmarkerLike> };
  };

  // MediaPipe/TFLite writes benign INFO lines (e.g. "Created TensorFlow Lite
  // XNNPACK delegate for CPU.") via console.error/warn — the Next dev overlay
  // then flags them as a "Console Error". Swallow just those known lines while
  // the model runs; everything else passes through.
  const restoreLogs = suppressMediaPipeLogs();
  let landmarker: PoseLandmarkerLike | null = null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    await once(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error("Could not read the video duration");
    const step = 1 / fps;
    const total = Math.min(maxFrames, Math.max(1, Math.floor(duration * fps)));
    const frames: PoseFrame[] = [];
    for (let i = 0; i < total; i++) {
      const t = i * step;
      if (t > duration) break;
      video.currentTime = t;
      await once(video, "seeked");
      let res: { landmarks?: RawLandmark[][] } | null = null;
      try { res = landmarker.detectForVideo(video, t * 1000); } catch { res = null; }
      const first = res?.landmarks?.[0];
      if (first && first.length >= 33) {
        frames.push({ tMs: Math.round(t * 1000), lm: first.map(toLandmark) });
      }
      opts.onProgress?.((i + 1) / total);
    }
    return frames;
  } finally {
    try { landmarker?.close(); } catch { /* noop */ }
    URL.revokeObjectURL(url);
    restoreLogs();
  }
}

/** Silence MediaPipe/TFLite's benign init chatter (routed through console.*) so
 *  the dev overlay doesn't surface it as an error. Restores the originals. */
function suppressMediaPipeLogs(): () => void {
  const re = /XNNPACK|TensorFlow Lite|Created TensorFlow|GL version|OpenGL|WebGL|WEBGL|feedback tensors|Graph successfully|infe?rence/i;
  const orig = { error: console.error, warn: console.warn, info: console.info, log: console.log };
  const wrap = (fn: (...a: unknown[]) => void) => (...args: unknown[]) => {
    const s = typeof args[0] === "string" ? args[0] : "";
    if (re.test(s)) return;
    fn(...args);
  };
  console.error = wrap(orig.error) as typeof console.error;
  console.warn = wrap(orig.warn) as typeof console.warn;
  console.info = wrap(orig.info) as typeof console.info;
  console.log = wrap(orig.log) as typeof console.log;
  return () => {
    console.error = orig.error;
    console.warn = orig.warn;
    console.info = orig.info;
    console.log = orig.log;
  };
}

type RawLandmark = { x: number; y: number; z?: number; visibility?: number };
type PoseLandmarkerLike = {
  detectForVideo: (v: HTMLVideoElement, tMs: number) => { landmarks?: RawLandmark[][] };
  close: () => void;
};

function toLandmark(p: RawLandmark): PoseLandmark {
  return { x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 1 };
}
