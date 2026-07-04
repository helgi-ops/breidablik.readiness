/**
 * Rasterise the share-card SVG to a PNG blob for sharing/download.
 *
 * The crest is fetched as a blob and inlined as a data URL INSIDE the SVG before
 * rasterising (see fetchImageAsDataUrl) — a same-origin data URL keeps the
 * canvas untainted, so toBlob() succeeds. Never rely on <img crossorigin>.
 * Browser-only (uses Image/canvas); import from client components.
 */

/** Fetch an image URL and return it as a data URL, or null on any failure. */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** SVG string → PNG blob at the given pixel size (defaults to the card's 1080×1920). */
export async function svgToPngBlob(svg: string, width = 1080, height = 1920): Promise<Blob> {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not render the card image."));
    img.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export the card PNG."))), "image/png");
  });
}
