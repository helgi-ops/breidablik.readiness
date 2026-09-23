/**
 * Client-side video compressor — downscale + re-encode a short clip in the browser before upload, so
 * a phone clip (often 4K, hundreds of MB) fits under the storage limit and costs less to keep. Plays
 * the clip once through an off-screen canvas and records the canvas stream with MediaRecorder (WebM).
 *
 * Best-effort: if the browser can't do it (no captureStream / MediaRecorder / decode fails) or the
 * result isn't actually smaller, it returns the ORIGINAL file — never a broken/larger upload. Pure
 * browser APIs, no dependencies. Audio is dropped (a tactical reference clip needs none, and it keeps
 * the file small).
 */

export interface CompressOptions {
  maxHeight?: number;          // downscale so height ≤ this (default 720); never upscales
  bitsPerSecond?: number;      // target video bitrate (default 2 Mbps)
  maxSeconds?: number;         // stop after this many seconds (default 45)
  onProgress?: (fraction: number) => void;
}

const pickMime = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return null;
};

export async function compressVideoClip(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxHeight = opts.maxHeight ?? 720;
  const bitsPerSecond = opts.bitsPerSecond ?? 2_000_000;
  const maxSeconds = opts.maxSeconds ?? 45;

  const mime = pickMime();
  const canvasEl = document.createElement("canvas");
  const canCapture = typeof canvasEl.captureStream === "function";
  if (!mime || !canCapture) return file; // unsupported → upload original

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("decode failed"));
    });

    const srcH = video.videoHeight || maxHeight;
    const srcW = video.videoWidth || Math.round((maxHeight * 16) / 9);
    const scale = Math.min(1, maxHeight / srcH);
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    canvasEl.width = w; canvasEl.height = h;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return file;

    const stream = canvasEl.captureStream(25);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitsPerSecond });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const duration = Number.isFinite(video.duration) ? Math.min(video.duration, maxSeconds) : maxSeconds;
    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      opts.onProgress?.(duration > 0 ? Math.min(1, video.currentTime / duration) : 0);
      raf = requestAnimationFrame(draw);
    };

    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });

    rec.start(250);
    await video.play().catch(() => { /* autoplay guards — muted play usually allowed */ });
    draw();

    await new Promise<void>((resolve) => {
      const stop = () => { cancelAnimationFrame(raf); try { rec.stop(); } catch { /* ignore */ } video.pause(); resolve(); };
      video.onended = stop;
      const guard = setInterval(() => { if (video.currentTime >= duration - 0.05) { clearInterval(guard); stop(); } }, 200);
    });

    const blob = await done;
    if (blob.size === 0 || blob.size >= file.size) return file; // no gain → keep original
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webm`, { type: "video/webm" });
  } catch {
    return file; // any failure → upload original
  } finally {
    URL.revokeObjectURL(url);
  }
}
