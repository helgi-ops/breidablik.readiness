import { describe, it, expect } from "vitest";
import { parseVimeoRef } from "../client";

describe("parseVimeoRef", () => {
  it("reads id + private hash from every Vimeo URL form", () => {
    expect(parseVimeoRef("https://vimeo.com/manage/videos/1240483077/9458877e85")).toEqual({ id: "1240483077", hash: "9458877e85" });
    expect(parseVimeoRef("https://vimeo.com/1240483077/9458877e85")).toEqual({ id: "1240483077", hash: "9458877e85" });
    expect(parseVimeoRef("https://player.vimeo.com/video/1240483077?h=9458877e85")).toEqual({ id: "1240483077", hash: "9458877e85" });
    expect(parseVimeoRef("https://vimeo.com/1240483077")).toEqual({ id: "1240483077", hash: null });
    expect(parseVimeoRef("https://vimeo.com/1240483077:9458877e85")).toEqual({ id: "1240483077", hash: "9458877e85" });
  });
  it("rejects non-Vimeo / malformed links", () => {
    expect(parseVimeoRef("https://youtube.com/watch?v=abc")).toBeNull();
    expect(parseVimeoRef("https://vimeo.com/about")).toBeNull();
    expect(parseVimeoRef("not a url")).toBeNull();
  });
});
