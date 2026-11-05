import { describe, it, expect } from "vitest";
import { parseVideoLink } from "../videoLink";

describe("parseVideoLink", () => {
  it("parses the common YouTube URL shapes to an id + thumbnail + embed", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=5",
    ]) {
      const r = parseVideoLink(u);
      expect(r.provider).toBe("youtube");
      expect(r.id).toBe("dQw4w9WgXcQ");
      expect(r.thumb).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
      expect(r.embed).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  });
  it("treats a non-YouTube link as 'other' with no thumbnail", () => {
    const r = parseVideoLink("https://hudl.com/video/123");
    expect(r.provider).toBe("other");
    expect(r.id).toBeNull();
    expect(r.thumb).toBeNull();
  });
  it("is safe on empty/null input", () => {
    expect(parseVideoLink(null).provider).toBe("other");
    expect(parseVideoLink("").id).toBeNull();
  });
});
