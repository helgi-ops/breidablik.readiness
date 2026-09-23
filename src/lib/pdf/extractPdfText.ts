/**
 * Client-side PDF text extraction (pdfjs-dist). Pulls the text layer out of a PDF IN THE BROWSER so a
 * large design/plan PDF can be read (title/agenda) WITHOUT uploading the file — only the tiny extracted
 * text crosses the network. Returns "" when the PDF has no text layer (scanned/image-only), so the
 * caller can fall back or tell the coach. Browser-only.
 */

export async function extractPdfText(file: File, opts: { maxChars?: number; maxPages?: number } = {}): Promise<{ text: string; pages: number }> {
  const maxChars = opts.maxChars ?? 60_000;
  const maxPages = opts.maxPages ?? 80;

  const pdfjs = await import("pdfjs-dist");
  // Bundled worker (webpack/turbopack resolve `new URL(..., import.meta.url)` to an emitted asset URL).
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  } catch { /* if it can't be set, pdfjs falls back to a main-thread fake worker */ }

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = doc.numPages;
  const out: string[] = [];
  let chars = 0;
  for (let p = 1; p <= Math.min(pages, maxPages) && chars < maxChars; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ("str" in it ? (it as { str: string }).str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (line) { out.push(line); chars += line.length; }
    page.cleanup();
  }
  await doc.destroy();
  return { text: out.join("\n").slice(0, maxChars), pages };
}
