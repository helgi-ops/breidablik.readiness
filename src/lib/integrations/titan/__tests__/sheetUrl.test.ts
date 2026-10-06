import { describe, it, expect } from "vitest";
import { isAllowedTitanSheetUrl } from "../sheetUrl";

describe("isAllowedTitanSheetUrl (SSRF guard)", () => {
  it("accepts a Google published-CSV URL", () => {
    expect(isAllowedTitanSheetUrl("https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=12345&single=true&output=csv")).toBe(true);
    expect(isAllowedTitanSheetUrl("https://docs.google.com/spreadsheets/d/e/2PACX/pub?output=csv")).toBe(true);
    expect(isAllowedTitanSheetUrl("https://docs.google.com/spreadsheets/d/abc/export?format=csv&gid=0")).toBe(true);
    expect(isAllowedTitanSheetUrl("https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv&gid=0")).toBe(true);
  });

  it("rejects non-google / non-https / internal hosts (no SSRF)", () => {
    expect(isAllowedTitanSheetUrl("http://docs.google.com/spreadsheets/d/e/x/pub?output=csv")).toBe(false); // not https
    expect(isAllowedTitanSheetUrl("https://evil.com/spreadsheets/pub?output=csv")).toBe(false);
    expect(isAllowedTitanSheetUrl("https://docs.google.com.evil.com/spreadsheets/pub?output=csv")).toBe(false);
    expect(isAllowedTitanSheetUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedTitanSheetUrl("https://docs.google.com/document/d/abc/pub")).toBe(false); // not a spreadsheet
    expect(isAllowedTitanSheetUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedTitanSheetUrl("not a url")).toBe(false);
    expect(isAllowedTitanSheetUrl("")).toBe(false);
  });

  it("rejects a Google spreadsheet URL with no CSV/gid hint (an editor link, not a published CSV)", () => {
    expect(isAllowedTitanSheetUrl("https://docs.google.com/spreadsheets/d/abc/edit")).toBe(false);
  });
});
