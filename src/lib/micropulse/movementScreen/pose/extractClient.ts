/**
 * Browser pose extraction (Stage 2, client-only). Loads the shared MediaPipe
 * BlazePose landmarker at runtime (from a CDN — no bundled dependency) and runs
 * it over an uploaded video to produce `PoseFrame[]` for the pure analyser. The
 * video is processed IN THE BROWSER (the raw clip is not sent anywhere for pose
 * estimation), keeping PHI local until the coach confirms and saves.
 *
 * Fast path: play the muted clip once and sample presented frames via
 * requestVideoFrameCallback (≈ clip length, not one seek per frame). Fallback:
 * timed seek-sampling. Every wait is bounded so it can never hang. This is the
 * only non-deterministic, non-unit-tested part of the pipeline; it degrades
 * gracefully — a load/decode failure throws a clear error and the coach records
 * findings manually.
 */
import type { PoseFrame, PoseLandmark } from "./landmarks";

const TASKS_VERSION = "0.10.14";
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
// The LITE model — ~3 MB, ~3× faster than full on CPU; plenty for a screen.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type ExtractProgress = (fraction: number) => void;

type RVFCMeta = { mediaTime: number };
type RVFCVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: RVFCMeta) => void) => number };

function once(el: HTMLVideoElement, ev: string): Promise<void> {
  return new Promise((resolve) => {
    const h = () => { el.removeEventListener(ev, h); resolve(); };
    el.addEventListener(ev, h);
  });
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function extractPoseFrames(
  file: File,
  opts: { fps?: number; maxFrames?: number; onProgress?: ExtractProgress } = {},
): Promise<PoseFrame[]> {
  if (typeof window === "undefined") throw new Error("Pose extraction runs in the browser only");
  const maxFrames = opts.maxFrames ?? 90;
  const onProgress = opts.onProgress;

  const visionMod: unknown = await import(/* webpackIgnore: true */ VISION_URL).catch(() => {
    throw new Error("Could not load the pose model (network/CDN blocked). Record findings manually.");
  });
  const vision = visionMod as {
    FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
    PoseLandmarker: { createFromOptions: (fs: unknown, o: unknown) => Promise<PoseLandmarkerLike> };
  };

  const restoreLogs = suppressMediaPipeLogs();
  let landmarker: PoseLandmarkerLike | null = null;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as RVFCVideo;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    // Proceed once frames are decodable (bounded — never wait forever).
    await Promise.race([once(video, "loadeddata"), wait(15000)]);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    const frames: PoseFrame[] = [];
    const model = landmarker;
    const sample = (mediaTimeSec: number) => {
      let res: { landmarks?: RawLandmark[][] } | null = null;
      try { res = model.detectForVideo(video, Math.round(mediaTimeSec * 1000)); } catch { res = null; }
      const first = res?.landmarks?.[0];
      if (first && first.length >= 33) frames.push({ tMs: Math.round(mediaTimeSec * 1000), lm: first.map(toLandmark) });
      if (duration) onProgress?.(Math.min(1, mediaTimeSec / duration));
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      // Fast path: play once, sample each presented frame.
      await video.play().catch(() => {});
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; try { video.pause(); } catch { /* noop */ } resolve(); } };
        const overall = window.setTimeout(finish, 60000);
        let lastT = -1;
        const step = (_now: number, meta: RVFCMeta) => {
          if (done) return;
          if (video.ended || frames.length >= maxFrames) { window.clearTimeout(overall); finish(); return; }
          if (meta.mediaTime > lastT) { lastT = meta.mediaTime; sample(meta.mediaTime); }
          video.requestVideoFrameCallback!(step);
        };
        video.requestVideoFrameCallback!(step);
        video.addEventListener("ended", () => { window.clearTimeout(overall); finish(); }, { once: true });
      });
    } else {
      // Fallback: timed seek-sampling.
      if (!duration) throw new Error("Could not read the video duration");
      const fps = opts.fps ?? 15;
      const total = Math.min(maxFrames, Math.max(1, Math.floor(duration * fps)));
      const step = duration / total;
      for (let i = 0; i < total; i++) {
        video.currentTime = i * step;
        const ok = await Promise.race([once(video, "seeked").then(() => true), wait(3000).then(() => false)]);
        if (!ok) continue;
        sample(video.currentTime);
      }
    }
    return frames;
  } finally {
    try { landmarker?.close(); } catch { /* noop */ }
    try { video.pause(); } catch { /* noop */ }
    URL.revokeObjectURL(url);
    restoreLogs();
  }
}

type RawLandmark = { x: number; y: number; z?: number; visibility?: number };
type PoseLandmarkerLike = {
  detectForVideo: (v: HTMLVideoElement, tMs: number) => { landmarks?: RawLandmark[][] };
  close: () => void;
};

function toLandmark(p: RawLandmark): PoseLandmark {
  return { x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 1 };
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
