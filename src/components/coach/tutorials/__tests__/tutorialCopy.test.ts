import { test } from "vitest";
import assert from "node:assert/strict";
import { TUTORIALS, type TutorialSlug } from "../tutorialCopy";

const SLUGS: TutorialSlug[] = [
  "today",
  "week-setup",
  "load-intelligence",
  "quadrant",
  "indoor-load",
  "decel-intelligence",
  "ima-intelligence",
  "match-movement",
  "position-comparison",
  "post-match-recovery",
];

// `requireDistinct` is false for titles/headings — product terms (Decision
// Summary, Daily Briefing, Quadrant, ACWR…) are legitimately identical EN/IS, as
// in the source guide. For prose (intro/body) identical text signals a missed
// translation, so we require the two to differ there.
function assertBi(b: { en: string; is: string }, where: string, requireDistinct = true) {
  assert.ok(b && typeof b.en === "string" && b.en.trim().length > 0, `${where}: missing EN`);
  assert.ok(b && typeof b.is === "string" && b.is.trim().length > 0, `${where}: missing IS`);
  if (requireDistinct) assert.notEqual(b.en, b.is, `${where}: EN and IS identical`);
}

test("every tutorial slug is present and fully bilingual", () => {
  for (const slug of SLUGS) {
    const t = TUTORIALS[slug];
    assert.ok(t, `missing tutorial: ${slug}`);
    assertBi(t.title, `${slug}.title`, false);
    if (t.intro) assertBi(t.intro, `${slug}.intro`);
    assert.ok(t.sections.length > 0, `${slug}: no sections`);
    for (const [i, s] of t.sections.entries()) {
      assertBi(s.heading, `${slug}.sections[${i}].heading`, false);
      assert.ok(s.body.length > 0, `${slug}.sections[${i}]: empty body`);
      s.body.forEach((p, j) => assertBi(p, `${slug}.sections[${i}].body[${j}]`));
    }
  }
});

test("TUTORIALS has no slugs beyond the declared set", () => {
  assert.deepEqual(Object.keys(TUTORIALS).sort(), [...SLUGS].sort());
});

// Per-page overview videos are optional (produced by Cowork, added as they land).
// The invariant that must hold: any video URL present is a real https embed.
test("any tutorial video is an https embed URL", () => {
  for (const slug of SLUGS) {
    const url = TUTORIALS[slug].videoEmbedUrl;
    if (url) assert.match(url, /^https:\/\//, `${slug} video should be https`);
  }
});
