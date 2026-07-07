// Minimal ambient types for pdf-parse (ships no declarations). We only use `.text`.
declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}
