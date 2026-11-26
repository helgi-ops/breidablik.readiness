import { describe, expect, it } from "vitest";
import { BREIDABLIK_LOGO, clubLogoCandidates, pickReadableLogo, resolveClubBrand } from "../clubBrand";

describe("resolveClubBrand", () => {
  it("uses the club's own saved logo and short name", () => {
    expect(resolveClubBrand({ name: "Afturelding", club_short_name: "Afturelding", club_logo_url: "https://x/Logos/Afturelding.jpg" }))
      .toEqual({ name: "Afturelding", logoUrl: "https://x/Logos/Afturelding.jpg" });
  });

  it("never shows Breiðablik's crest for another club without a logo", () => {
    expect(resolveClubBrand({ name: "Keflavík", club_short_name: null, club_logo_url: null }))
      .toEqual({ name: "Keflavík", logoUrl: null });
  });

  it("keeps the shipped crest for Breiðablik squads with no logo saved", () => {
    expect(resolveClubBrand({ name: "Breiðablik", club_short_name: null, club_logo_url: null }).logoUrl).toBe(BREIDABLIK_LOGO);
    expect(resolveClubBrand({ name: "Breidablik U19", club_logo_url: "" }).logoUrl).toBe(BREIDABLIK_LOGO);
  });

  it("prefers Breiðablik's saved logo over the shipped one", () => {
    expect(resolveClubBrand({ name: "Breiðablik", club_logo_url: "https://x/Logos/breidablik-crest.png" }).logoUrl)
      .toBe("https://x/Logos/breidablik-crest.png");
  });

  it("falls back to the team name, and to nothing when there is no team", () => {
    expect(resolveClubBrand({ name: "  HK  ", club_short_name: "  " }).name).toBe("HK");
    expect(resolveClubBrand(null)).toEqual({ name: "", logoUrl: null });
  });
});

describe("logo checks", () => {
  const res = (ok: boolean, type: string) => ({ ok, headers: { get: () => type } });

  it("Breiðablik falls back to the shipped crest when its saved logo is gone", async () => {
    const cands = clubLogoCandidates({ name: "Breiðablik", club_logo_url: "https://x/Logos/breidablik-crest.png" });
    expect(cands).toEqual(["https://x/Logos/breidablik-crest.png", BREIDABLIK_LOGO]);
    const pick = await pickReadableLogo(cands, async (u) => (u === BREIDABLIK_LOGO ? res(true, "image/png") : res(false, "application/json")));
    expect(pick).toBe(BREIDABLIK_LOGO);
  });

  it("another club with an unreadable logo gets no logo, not Breiðablik's", async () => {
    const cands = clubLogoCandidates({ name: "HK", club_logo_url: "https://x/hk.svg" });
    expect(cands).toEqual(["https://x/hk.svg"]);
    expect(await pickReadableLogo(cands, async () => res(true, "image/svg+xml"))).toBeNull();
  });

  it("accepts JPEG and survives a network error", async () => {
    const pick = await pickReadableLogo(["https://x/a.png", "https://x/b.jpg"], async (u) => {
      if (u.endsWith(".png")) throw new Error("offline");
      return res(true, "image/jpeg");
    });
    expect(pick).toBe("https://x/b.jpg");
  });
});
