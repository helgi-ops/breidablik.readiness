# Claude Code brief — "Adding new matches without overwriting" guidance on both import surfaces

## Goal

Coaches re-import Wyscout data every week. Two different pages, two different
merge behaviours — and if a coach misunderstands, they can either think they'll
duplicate/lose data (and avoid re-importing) or, worse, wipe a season total by
exporting a partial file. Add a short, **impossible-to-miss, bilingual (EN/IS)**
note at the point of upload on **both** pages that states exactly how re-importing
behaves, so there is never a misunderstanding.

This is a **copy-only** change. No parser, route, schema, or upsert logic changes.
The notes must describe the behaviour that already exists (verified below).

## The behaviour to describe (already true in code — do not change it)

**Team Match Insight — per match.** `team_match_stats` upsert uses
`onConflict: "team_id,match_date,is_opponent"`
(`src/app/api/coach/team-match-stats/upload/route.ts`). So a match is keyed by
date: re-importing updates the matches already stored and inserts new ones —
never duplicates. Importing the whole season or only the new matches are both
safe. Re-importing the identical file changes nothing.

**Player Statistics — season totals.** `player_season_stats` upsert uses
`onConflict: "team_id,season,source,source_player_ref"`
(`SEASON_CONFLICT` in `src/lib/micropulse/statsIngestion/persist.ts`). Each row is
a **cumulative season total per player**, so an import **replaces** that season's
row (it does not sum match-by-match). Therefore the coach must always export the
**full season** from Advanced Search; a partial export would replace the totals
with smaller numbers. Name→player mappings are remembered
(`stat_player_mapping`, `onConflict: "team_id,source_player_ref"`), so only new
names need confirming next time.

Both pages already have a no-write **Preview** before commit — the note should
point at it as the safety net.

## Change 1 — Team Match Insight import panel

File: `src/components/coach/TeamStatsImportPanel.tsx`

**a) Add one copy key to each language in the `T` map** (next to `pickHint`):

```ts
// EN
reimportNote:
  "Safe to re-run. Matches are matched by date, so importing again updates the matches already saved and adds new ones — it never duplicates or wipes. Import the whole season or just the new matches; both work. Preview first to see exactly what will change.",
// IS
reimportNote:
  "Óhætt að endurtaka. Leikir eru paraðir eftir dagsetningu, svo nýr innflutningur uppfærir leiki sem þegar eru vistaðir og bætir nýjum við — aldrei tvítekning eða yfirskrift. Þú mátt flytja inn allt tímabilið eða bara nýju leikina; hvort tveggja virkar. Forskoðaðu fyrst til að sjá nákvæmlega hvað breytist.",
```

**b) Render it as a small highlighted note directly under the file picker /
`pickHint`**, above the Preview/Import buttons, so it's seen at the moment of
upload. Use the existing panel styling; suggested:

```tsx
<p className="mt-2 rounded-md border border-[#2740E6]/20 bg-[#EEF0FB] px-2.5 py-2 text-[12px] leading-relaxed text-[#14181C]">
  {t.reimportNote}
</p>
```

(`t` is the already-selected language object. Match the surrounding className
conventions if they differ.)

## Change 2 — Player Statistics page

File: `src/app/coach/player-stats/page.tsx`

The football "How the import works" numbered list is around lines 400–416
(IS array then EN array). Keep it, and make two edits:

**a) Add a final step to BOTH language arrays** of that list:

- EN: `"Adding new matches later: export the FULL season again and import with the same season — it updates each player's totals in place, never duplicating. Always export the whole season (not just new matches): the import replaces the season totals, it doesn't add game by game."`
- IS: `"Að bæta við nýjum leikjum síðar: flyttu út ALLT tímabilið aftur og settu inn með sama tímabili — það uppfærir totölur hvers leikmanns á sínum stað, aldrei tvítekning. Flyttu alltaf út allt tímabilið (ekki bara nýju leikina): innflutningurinn kemur í staðinn fyrir season-tölurnar, hann leggur ekki leik við leik."`

**b) Add a compact highlighted note directly above the file input**
(the "Upload — season totals only" block around line 470), so the "full season"
rule is visible at the moment of upload, not only in the collapsed how-it-works
list:

```tsx
<p className="mb-3 rounded-md border border-[#2740E6]/20 bg-[#EEF0FB] px-2.5 py-2 text-[12px] leading-relaxed text-[#14181C]">
  {is
    ? "Til að bæta við nýjum leikjum: flyttu alltaf út ALLT tímabilið og settu inn með sama tímabili. Innflutningurinn uppfærir totölur á sínum stað — hann yfirskrifar ekki og tvítekur ekki. Nafna-tengingar eru munaðar, svo þú staðfestir bara ný nöfn."
    : "To add new matches: always export the FULL season and import with the same season. The import updates totals in place — it does not wipe or duplicate. Name matches are remembered, so you only confirm new names."}
</p>
```

## Wording rules (so the two notes never contradict)

- Team Match Insight = per match → "whole season OR just new matches, both fine."
- Player Statistics = season totals → "always the WHOLE season" (partial =
  smaller totals). Never tell a coach to upload "just the new matches" on the
  player-stats page.
- Both: "Preview first, nothing is saved until you Import/Confirm." Never use the
  words "overwrite/wipe" except to say it does NOT happen.

## Definition of done

1. Both notes render in EN and IS (toggle the language and confirm).
2. Copy-only: no change to any route, parser, `onConflict`, or DB.
3. Notes sit at the upload point on each page (not only inside a collapsed
   how-it-works list) and use the cobalt-tinted note style consistent with the
   design tokens (`--primary #2740E6`, note bg `#EEF0FB`).
4. `npx eslint` clean on both changed files; typecheck passes.
5. Screenshot both panels in both languages and confirm the text is legible and
   not clipped on the collapsed panel width.

## Out of scope

- Any change to how imports actually merge (the behaviour is already correct).
- The Catapult/GPS upload page (movement data syncs automatically for these
  clubs; not part of this request).
