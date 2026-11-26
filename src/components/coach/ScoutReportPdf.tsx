"use client";

/**
 * ScoutReportPdf — a pre-match opponent scouting report the coach can print for the staff.
 *
 * Explainability-first layered read (docs/explainability-first.md), same family as the
 * basketball opponent report (BasketballOpponentPdf):
 *   Page 1  Summary — the verdict (AI read, labelled AI, or the rule summary) → 2-3 plain
 *           facts (standing, goals, form) → the game plan (where to hurt them / respect this).
 *   Page 2  How they play — style, attack, defence (+ rule recommendations with their
 *           signal), key players, set pieces.
 *   Page 3+ The numbers — standing, profile vs league vs you, finishing & goalkeeping,
 *           StatsBomb signals, home/away, recent-form window, them vs you; then caveats
 *           and references.
 *
 * Every rule sentence is composed deterministically from `buildOpponentReport` (rules decide,
 * this only lays them out). AI prose, when passed, is labelled AI. Styling comes from the
 * shared PDF kit (src/components/pdf/brand.tsx). Descriptive context only: never touches the
 * readiness colour, the daily decision, or the training plan.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, Bar, BrandPage, C, Card, Cols, FactRow, KeyValues, Label, Provenance, Section, Table, TONE, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import type { Tone } from "@/components/pdf/brand";
import type { OpponentReport, Bi, Cited } from "@/lib/micropulse/scouting/opponentReport";
import { metricsFromScoutMatches } from "@/lib/micropulse/scouting/opponentReport";

// Recent-form window table order — all the per-match metrics, not just the 3 in the verdict.
const L5_KEYS = ["xgf", "xga", "possession", "ppda", "shots", "shotsAgainst", "passesFinalThird", "progressivePasses", "crosses", "positionalAttacks", "counterattacks", "defDuelsWonPct", "offensiveDuelsWonPct"] as const;

type Lang = "EN" | "IS";
const resultTone = (r: "W" | "D" | "L"): Tone => (r === "W" ? "green" : r === "D" ? "amber" : "red");

const pick = (b: Bi, lang: Lang) => b[lang.toLowerCase() as "en" | "is"];
const f1 = (v: number | null | undefined): string => (v == null ? "-" : v.toFixed(1));
const fi = (v: number | null | undefined): string => (v == null ? "-" : String(Math.round(v)));
// Percentages and whole counts read as integers; per-match rates keep one decimal.
const PCT = new Set(["possession", "defDuelsWonPct", "crossAccPct", "offensiveDuelsWonPct", "forwardPassAccPct", "passesFinalThirdAccPct"]);
const COUNT = new Set(["minutes", "goals", "assists"]);
const fm = (metric: string, v: number | null | undefined): string =>
  v == null ? "-" : PCT.has(metric) || COUNT.has(metric) ? fi(v) : f1(v);

type TB = { t: string; b: string };
export type ScoutProse = {
  verdict?: string; verdictBody?: string; facts?: string[];
  howTheyPlay?: string; whereToHurt?: TB[]; respect?: TB[]; gamePlan?: string;
} | null;

/** W/D/L square with the letter printed (colour never the only signal). */
function FormDot({ r, isIS }: { r: "W" | "D" | "L"; isIS: boolean }) {
  return (
    <View style={{ width: 15, height: 15, borderRadius: 3, marginLeft: 3, alignItems: "center", justifyContent: "center", backgroundColor: TONE[resultTone(r)].fill }}>
      <Text style={[fb(700), { color: "#ffffff", fontSize: 8.5 }]}>{isIS ? (r === "W" ? "S" : r === "D" ? "J" : "T") : r}</Text>
    </View>
  );
}

/** A rule block: label → bold verdict sentence → the cited facts in mute. */
function Block({ label, verdict, facts, children }: { label: string; verdict: string; facts?: string; children?: React.ReactNode }) {
  return (
    <Card wrap style={{ marginBottom: 8 }}>
      <Label color={C.cobalt}>{label}</Label>
      <Text style={[fh(700), { fontSize: 10.5, lineHeight: 1.35, marginTop: 1 }]}>{clean(verdict)}</Text>
      {facts ? <Text style={[fb(400), { fontSize: 8.25, color: C.mute, marginTop: 3, lineHeight: 1.4 }]}>{clean(facts)}</Text> : null}
      {children}
    </Card>
  );
}

/** "Title body" items inside an AI box (where to hurt them / respect this). */
function TbList({ items }: { items: TB[] }) {
  return (
    <View style={{ marginTop: 6 }}>
      {items.map((x, i) => (
        <View key={i} wrap={false} style={{ paddingVertical: 3.5, borderTopWidth: i ? 1 : 0, borderTopColor: C.cobaltEdge }}>
          <Text style={[fb(600), { fontSize: 9, lineHeight: 1.3 }]}>{clean(x.t)}</Text>
          <Text style={[fb(400), { fontSize: 8.25, color: "#2b2f35", marginTop: 1, lineHeight: 1.4 }]}>{clean(x.b)}</Text>
        </View>
      ))}
    </View>
  );
}

export function Doc({ report, lang, label, prose }: { report: OpponentReport; lang: Lang; label: (k: string) => string; prose?: ScoutProse }) {
  const isIS = lang === "IS";
  const W = isIS ? "S" : "W", D = isIS ? "J" : "D", L = isIS ? "T" : "L";
  const factLine = (facts: Cited[]) =>
    facts.map((c) => `${label(c.metric)} ${fm(c.metric, c.value)}${c.league != null ? ` (${isIS ? "deild" : "lg"} ${fm(c.metric, c.league)})` : ""}`).join("   ·   ");

  // Abstract is a purpose-written, concise lede; the closing note pulls the matchup + form
  // together (the defensive read already lives in its own section + the game plan).
  const abstract = pick(report.summary, lang);
  const interpretation = [report.matchup.verdict, report.form.verdict].map((b) => pick(b, lang)).join(" ");
  const srcName = report.source === "statsbomb" ? "StatsBomb" : "Wyscout";

  // Caveats name the actual source (never hardcode "Wyscout" on a StatsBomb report).
  const footText = report.source === "statsbomb"
    ? (isIS
      ? "Lýsandi samhengi úr StatsBomb Team Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Reglur reikna staðreyndirnar; textinn raðar þeim aðeins upp — engin AI. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. xG, PPDA og OBV eru StatsBomb-líkön með óvissu; season-meðaltöl segja til um stíl, ekki um einstakan leik. Dýpri gögn (event- og 360-gögn) eru v2 (StatsBomb Data API)."
      : "Descriptive context from StatsBomb Team Stats (the opponent's season), benchmarked against the league average and your team. Rules compute the facts; this only lays them out — no AI. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. xG, PPDA and OBV are StatsBomb models with uncertainty; season averages describe style, not a single match. Deeper data (event & 360 data) is v2 (StatsBomb Data API).")
    : (isIS
      ? "Lýsandi samhengi úr Wyscout Team-Stats (árstölfræði andstæðingsins), borið saman við deildar-meðaltal og þitt lið. Reglur reikna staðreyndirnar; textinn raðar þeim aðeins upp — engin AI. Ráðleggingar sýna merkið sem þær koma frá og eru til viðmiðunar — þjálfarinn ræður. Snertir aldrei readiness-litinn né daglegu ákvörðunina. xG og PPDA eru Wyscout-líkön með óvissu; season-meðaltöl segja til um stíl, ekki um einstakan leik. Dýpri gögn (myndbönd, event-gögn) eru v2 (Wyscout Data API)."
      : "Descriptive context from Wyscout Team-Stats (the opponent's season), benchmarked against the league average and your team. Rules compute the facts; this only lays them out — no AI. Recommendations show the signal they came from and are guidance — the coach decides. Never touches the readiness colour or the daily decision. xG and PPDA are Wyscout models with uncertainty; season averages describe style, not a single match. Deeper data (video, event data) is v2 (Wyscout Data API).");
  const note = isIS
    ? `Lýsandi andstæðingagreining úr ${srcName}-tölum tímabilsins. Reglur reikna staðreyndirnar${prose ? "; AI-texti er merktur AI" : ""}. Snertir aldrei readiness.`
    : `Descriptive opponent scouting from ${srcName} season stats. Rules compute the facts${prose ? "; AI text is labelled AI" : ""}. Never touches readiness.`;

  // Profile table: them / league / you, from block facts (+ matchup for "you").
  const factMap: Record<string, Cited> = {};
  [...report.identity.facts, ...report.attack.facts, ...report.defend.facts].forEach((c) => { factMap[c.metric] = c; });
  const youMap: Record<string, number | null> = {};
  report.matchup.rows.forEach((r) => { youMap[r.metric] = r.you; });
  const PROFILE = ["xgf", "gf", "xga", "ga", "shots", "shotsAgainst", "possession", "ppda", "defDuelsWonPct", "passesFinalThird", "crosses"];
  const profileRows = PROFILE
    .filter((k) => factMap[k] && factMap[k].value != null)
    .map((k) => ({ metric: k, them: factMap[k].value, league: factMap[k].league ?? null, you: youMap[k] ?? null }));

  // Standings + efficiency (finishing / goalkeeping) — derived from the report's own numbers.
  const rec = report.record;
  const gfM = factMap["gf"]?.value ?? null, gaM = factMap["ga"]?.value ?? null;
  const xgfM = factMap["xgf"]?.value ?? null, xgaM = factMap["xga"]?.value ?? null;
  const gfTot = report.goalsFor, gaTot = report.goalsAgainst;   // full-precision season totals (not round-then-multiply)
  const l5w = report.form.results.filter((r) => r === "W").length, l5d = report.form.results.filter((r) => r === "D").length, l5l = report.form.results.filter((r) => r === "L").length;
  const finishing = gfM != null && xgfM != null ? Math.round((gfM - xgfM) * 100) / 100 : null;
  const keeping = xgaM != null && gaM != null ? Math.round((xgaM - gaM) * 100) / 100 : null;
  const signed = (v: number | null) => (v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(2));
  const sp = report.setPieces, kp = report.keyPlayers, splits = report.splits, sb = report.statsbomb;
  const recStr = rec ? `${rec.w}${W} ${rec.d}${D} ${rec.l}${L}` : null;

  // Layer 1 — plain rule facts.
  const trendWord = report.form.trend === "rising" ? (isIS ? "á uppleið" : "rising") : report.form.trend === "falling" ? (isIS ? "á niðurleið" : "falling") : (isIS ? "stöðugt" : "steady");
  const facts: { value: string; label: string; sub?: string; tone?: Tone }[] = [];
  if (report.position != null || recStr) facts.push({ value: report.position != null ? `${report.position}.` : recStr!, label: report.position != null ? (isIS ? "Sæti í deild" : "League position") : (isIS ? "Árangur" : "Record"), sub: `${report.matches} ${isIS ? "leikir" : "matches"}${recStr && report.position != null ? ` · ${recStr}` : ""}` });
  if (gfTot != null && gaTot != null) facts.push({ value: `${gfTot} : ${gaTot}`, label: isIS ? "Mörk skoruð : á sig" : "Goals for : against", sub: xgfM != null || xgaM != null ? `xG ${f1(xgfM)} / xGA ${f1(xgaM)} ${isIS ? "í leik" : "per match"}` : undefined });
  if (report.form.results.length) facts.push({ value: `${l5w}${W} ${l5d}${D} ${l5l}${L}`, label: isIS ? `Síðustu ${report.form.results.length}` : `Last ${report.form.results.length}`, sub: isIS ? `Form ${trendWord}` : `Form ${trendWord}` });

  const prosePlan = !!(prose && (prose.whereToHurt?.length || prose.respect?.length));
  const aiLbl = isIS ? "LES TÖLURNAR - ÁKVEÐUR EKKERT" : "READS THE NUMBERS - DECIDES NOTHING";

  const formRows = (() => {
    const wm = report.form.windowMetrics;
    const season5 = metricsFromScoutMatches(report.allMatches);
    return L5_KEYS
      .map((k) => ({ metric: k, val: wm[k] as number | null, season: (season5[k] ?? null) as number | null }))
      .filter((r) => r.val != null);
  })();

  return (
    <Document title={`${clean(report.opponent)} - ${isIS ? "andstæðingagreining" : "opponent scouting"} ${report.season}`} author="MicroPulse">
      {/* ───────────── Page 1 — Summary & game plan ───────────── */}
      <BrandPage
        doc={isIS ? "Andstæðingagreining" : "Opponent scouting"}
        context={`${clean(report.opponent)} · ${report.season}`}
        title={clean(report.opponent)}
        kicker={`${isIS ? "Andstæðingagreining" : "Opponent scouting"} · ${report.season} · ${isIS ? "Byggt á" : "Built from"} ${srcName}`}
        subtitle={`${isIS ? "Hvað leiktölfræðin segir — og hvar á að meiða þá" : "What the match stats say — and where to hurt them"} · ${isIS ? "Unnið fyrir þjálfarateymið" : "Prepared for the coaching staff"}`}
        chips={[
          { text: `${report.matches} ${isIS ? "leikir" : "matches"}${recStr ? ` (${recStr})` : ""}` },
          ...(prose ? [{ text: isIS ? "AI-skrifað" : "AI-written", tone: "cobalt" as Tone }] : []),
        ]}
        note={note}
      >
        {prose ? (
          <AiBox
            label={`${isIS ? "DÓMUR" : "VERDICT"} · ${aiLbl}`}
            headline={prose.verdict ?? abstract}
            body={prose.verdictBody}
            cites={isIS ? `AI skrifaði úr ${srcName}-tölunum í þessari skýrslu — vitnar í gögnin, ákveður ekkert.` : `AI-written from the ${srcName} numbers in this report — cites the data, decides nothing.`}
          >
            {prose.facts?.length ? (
              <View style={{ marginTop: 7 }}>
                <Label color={C.cobalt}>{isIS ? "Af hverju — staðreyndirnar á bak við" : "Why — the facts behind it"}</Label>
                {prose.facts.slice(0, 3).map((f, i) => (
                  <View key={i} wrap={false} style={{ flexDirection: "row", gap: 6, marginBottom: 2.5 }}>
                    <Text style={[fh(700), { width: 9, fontSize: 9, color: C.cobalt }]}>{i + 1}</Text>
                    <Text style={[fb(400), { flex: 1, fontSize: 8.75, lineHeight: 1.45 }]}>{clean(f)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </AiBox>
        ) : (
          <Verdict label={isIS ? "Útdráttur" : "Summary"} headline={abstract} confidence={`${report.matches} ${isIS ? "leikir" : "matches"} · ${srcName}`} />
        )}

        {facts.length ? <FactRow facts={facts} /> : null}

        <Section title={isIS ? "Leikáætlun" : "Game plan"}>
          {prose?.gamePlan ? (
            <AiBox label={aiLbl} body={prose.gamePlan} />
          ) : (
            <Card style={{ marginBottom: 8 }}>
              <Text style={[fh(700), { fontSize: 11, lineHeight: 1.35, color: C.cobalt }]}>{clean(pick(report.gameplan, lang))}</Text>
              <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginTop: 4 }]}>{clean(interpretation)}</Text>
            </Card>
          )}
          {prosePlan && prose ? (
            <Cols gap={8}>
              {prose.whereToHurt?.length ? (
                <AiBox label={isIS ? "HVAR Á AÐ MEIÐA ÞÁ" : "WHERE TO HURT THEM"}><TbList items={prose.whereToHurt} /></AiBox>
              ) : null}
              {prose.respect?.length ? (
                <AiBox label={isIS ? "VIRTU ÞETTA · FASTALEIKIR" : "RESPECT THIS · SET PIECES"}><TbList items={prose.respect} /></AiBox>
              ) : null}
            </Cols>
          ) : null}
        </Section>
      </BrandPage>

      {/* ───────────── Page 2 — How they play ───────────── */}
      <BrandPage doc={isIS ? "Hvernig þeir spila" : "How they play"} context={`${clean(report.opponent)} · ${report.season}`} note={note}>
        {prose?.howTheyPlay ? (
          <Section title={isIS ? "Hvernig þeir spila" : "How they play"}>
            <AiBox label={aiLbl} body={prose.howTheyPlay} />
          </Section>
        ) : null}

        <Block label={isIS ? "Stíll" : "Style"} verdict={pick(report.identity.verdict, lang)} facts={factLine(report.identity.facts)} />
        <Block label={isIS ? "Hvernig þeir sækja" : "How they attack"} verdict={pick(report.attack.verdict, lang)} facts={factLine(report.attack.facts)} />
        <Block label={isIS ? "Hvernig þeir verjast — hvar á að meiða þá" : "How they defend — where to hurt them"} verdict={pick(report.defend.verdict, lang)} facts={factLine(report.defend.facts)}>
          {report.defend.recommendations.length ? (
            <View style={{ marginTop: 6 }}>
              {report.defend.recommendations.map((r) => (
                <View key={r.id} wrap={false} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                  <Text style={[fh(700), { width: 9, fontSize: 9, color: C.cobalt }]}>»</Text>
                  <Text style={[fb(400), { flex: 1, fontSize: 8.75, lineHeight: 1.45 }]}>
                    {clean(pick(r.text, lang))} <Text style={{ color: C.mute }}>{`(${isIS ? "merki" : "signal"}: ${label(r.signal.metric)} ${fm(r.signal.metric, r.signal.value)})`}</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Block>

        {report.keyPlayers.available && report.keyPlayers.topScorers.length > 0 ? (
          <Block label={isIS ? "Lykilmenn" : "Key players"} verdict={pick(report.keyPlayers.verdict, lang)}>
            <View style={{ marginTop: 6 }}>
              <Table
                dense
                cols={[{ label: isIS ? "Leikmaður" : "Player", flex: 1 }, { label: isIS ? "Mín." : "Min.", width: 50, align: "right" }, { label: isIS ? "Mörk" : "Goals", width: 50, align: "right", strong: true }, { label: "xG", width: 50, align: "right" }]}
                rows={report.keyPlayers.topScorers.map((p) => {
                  const over = p.goals != null && p.xg != null && p.goals - p.xg >= 1.5;
                  const under = p.goals != null && p.xg != null && p.xg - p.goals >= 2.5;
                  const flag = over ? (isIS ? "yfir-nýtir" : "overperforming") : under ? (isIS ? "vannýtir" : "underperforming") : null;
                  return [
                    <Text key="n" style={[fb(600), { fontSize: 8.5 }]}>
                      {clean(p.name)}
                      {p.position ? <Text style={[fb(400), { color: C.mute }]}>{`  ${clean(p.position)}`}</Text> : null}
                      {flag ? <Text style={[fb(600), { color: TONE.amber.text }]}>{`  · ${flag}`}</Text> : null}
                    </Text>,
                    fi(p.minutes), fi(p.goals), f1(p.xg),
                  ];
                })}
              />
            </View>
            {kp.watch.length ? (
              <Text style={[fb(400), { fontSize: 8.25, color: C.mute, marginTop: 5, lineHeight: 1.4 }]}>
                <Text style={[fb(600), { color: C.ink }]}>{isIS ? "Fylgstu líka með: " : "Also watch: "}</Text>
                {clean(kp.watch.map((p) => `${p.name} (${fi(p.goals)}${isIS ? " mörk" : "g"} / ${f1(p.xg)} xG)`).join(", "))}{isIS ? " - komast í færin en klára ekki; eiga inni." : " - getting chances but not converting; due a goal."}
              </Text>
            ) : null}
          </Block>
        ) : null}

        <Block
          label={isIS ? "Fastaleikir og skallaógn" : "Set pieces & aerial threat"}
          verdict={pick(report.setPieces.verdict, lang)}
          facts={sp.players.length ? sp.players.map((p) => `${p.name}${p.position ? ` (${p.position})` : ""} - ${p.goals}${isIS ? " mörk" : "g"}`).join("   ·   ") : undefined}
        />
      </BrandPage>

      {/* ───────────── Page 3+ — The numbers ───────────── */}
      <BrandPage doc={isIS ? "Á bak við tölurnar" : "Behind the numbers"} context={`${clean(report.opponent)} · ${report.season}`} note={note}>
        {rec || finishing != null || keeping != null ? (
          <View wrap={false} style={{ marginBottom: 10 }}>
            <Cols gap={8}>
              {rec ? (
                <Card>
                  <Text style={[fh(700), { fontSize: 11, marginBottom: 4 }]}>{isIS ? "Staðan" : "Standing"}</Text>
                  <KeyValues
                    rows={[
                      ...(report.position != null ? [[isIS ? "Sæti" : "League position", isIS ? `${report.position}.` : `${report.position}`] as [string, string]] : []),
                      [isIS ? "Leikir" : "Matches", String(report.matches)],
                      [isIS ? "Sigrar - Jafntefli - Töp" : "Wins - Draws - Losses", `${rec.w}${W}  ${rec.d}${D}  ${rec.l}${L}`],
                      ...(gfTot != null && gaTot != null ? [[isIS ? "Mörk skoruð : á sig" : "Goals for : against", `${gfTot} : ${gaTot}`] as [string, string]] : []),
                      [isIS ? "Síðustu 5" : "Last 5", `${l5w}${W}  ${l5d}${D}  ${l5l}${L}`],
                      ...(report.form.results.length
                        ? [[isIS ? "Form (nýjast til vinstri)" : "Form (latest left)", <View key="f" style={{ flexDirection: "row" }}>{report.form.results.map((r, i) => <FormDot key={i} r={r} isIS={isIS} />)}</View>] as [string, React.ReactNode]]
                        : []),
                    ]}
                  />
                </Card>
              ) : null}
              {finishing != null || keeping != null ? (
                <Card>
                  <Text style={[fh(700), { fontSize: 11, marginBottom: 4 }]}>{isIS ? "Nýting og markvarsla" : "Finishing & goalkeeping"}</Text>
                  <KeyValues
                    rows={[
                      [isIS ? "xG fyrir / mörk skoruð" : "xG for / goals scored", `${f1(xgfM)} / ${f1(gfM)}`],
                      [isIS ? "Nýting (mörk - xG)" : "Finishing (goals - xG)", signed(finishing)],
                      [isIS ? "xG á móti / mörk á sig" : "xG against / goals conceded", `${f1(xgaM)} / ${f1(gaM)}`],
                      [isIS ? "Markvarsla (xGA - mörk á sig)" : "Goalkeeping (xGA - conceded)", signed(keeping)],
                    ]}
                  />
                </Card>
              ) : null}
            </Cols>
          </View>
        ) : null}

        <Section title={isIS ? "Prófíll — þeir vs deild vs þú" : "Profile — them vs league vs you"} hint={isIS ? "Á leik. Súlur: þeir (blátt) vs deild (grátt), hlutfallslegt." : "Per match. Bars: them (blue) vs league (grey), relative."}>
          <Table
            cols={[{ label: isIS ? "Mælikvarði (á leik)" : "Metric (per match)", flex: 1 }, { label: isIS ? "Þeir" : "Them", width: 54, align: "right", strong: true }, { label: isIS ? "Deild" : "League", width: 54, align: "right" }, { label: isIS ? "Þú" : "You", width: 54, align: "right" }, { label: "", width: 80 }]}
            rows={profileRows.map((r) => {
              const mx = Math.max(r.them ?? 0, r.league ?? 0);
              return [
                label(r.metric), fm(r.metric, r.them), fm(r.metric, r.league), fm(r.metric, r.you),
                <View key="b" style={{ paddingLeft: 8, gap: 1.5 }}>
                  <Bar value={r.them ?? 0} max={mx} height={3} />
                  <Bar value={r.league ?? 0} max={mx} height={3} color={C.faint} />
                </View>,
              ];
            })}
          />
        </Section>

        {sb ? (
          <Section title={isIS ? "StatsBomb-merki (dýpri en Wyscout)" : "StatsBomb signals (deeper than Wyscout)"} wrap={false}>
            <Table
              cols={[{ label: isIS ? "Mælikvarði (á leik)" : "Metric (per match)", flex: 1 }, { label: isIS ? "Þeir" : "Them", width: 60, align: "right", strong: true }, { label: isIS ? "Deild" : "League", width: 60, align: "right" }]}
              rows={([
                [isIS ? "OBV (sóknarvirði)" : "OBV (attacking value)", sb.obv, sb.obvLeague],
                [isIS ? "OBV á móti" : "OBV against", sb.obvAgainst, sb.obvAgainstLeague],
                [isIS ? "Klár færi" : "Clear shots", sb.clearShots, sb.clearShotsLeague],
                [isIS ? "Klár færi á móti" : "Clear shots against", sb.clearShotsAgainst, sb.clearShotsAgainstLeague],
                [isIS ? "Fastaleikja-xG" : "Set-piece xG", sb.setPieceXg, sb.setPieceXgLeague],
                [isIS ? "Fastaleikja-xG á móti" : "Set-piece xG against", sb.setPieceXgAgainst, sb.setPieceXgAgainstLeague],
                [isIS ? "Horna-xG" : "Corner xG", sb.cornerXg, sb.cornerXgLeague],
              ] as Array<[string, number | null, number | null]>).filter(([, v]) => v != null).map(([lab, them, lg]) => [lab, f1(them), f1(lg)])}
            />
            <Provenance>{isIS ? "OBV = verðmæti aðgerða á vellinum (StatsBomb). Hærra á móti = þeir gefa frá sér meira virði. Klár færi = hágæða skottækifæri; „á móti“ hátt = þeir eru berskjaldaðir, sæktu skýr færi." : "OBV = value added by on-ball actions (StatsBomb). Higher against = they concede more value. Clear shots = high-quality chances; a high \"against\" = they're exposed, so attack for clear sights of goal."}</Provenance>
          </Section>
        ) : null}

        {splits && (splits.home.games > 0 || splits.away.games > 0) ? (
          <Section title={isIS ? "Heima vs úti" : "Home vs away"} wrap={false}>
            <Table
              cols={[{ label: "", flex: 1 }, { label: isIS ? "Lk" : "Pl", width: 54, align: "right" }, { label: isIS ? "S-J-T" : "W-D-L", width: 64, align: "right", strong: true }, { label: "xG", width: 54, align: "right" }, { label: "xGA", width: 54, align: "right" }]}
              rows={([["home", splits.home], ["away", splits.away]] as const).map(([k, sd]) => [
                k === "home" ? (isIS ? "Heima" : "Home") : (isIS ? "Úti" : "Away"), String(sd.games), `${sd.w}-${sd.d}-${sd.l}`, f1(sd.xg), f1(sd.xga),
              ])}
            />
          </Section>
        ) : null}

        <Section title={isIS ? "Form" : "Form"}>
          <Text style={[fb(400), { fontSize: 9, lineHeight: 1.45, marginBottom: 6 }]}>{clean(pick(report.form.verdict, lang))}</Text>
          {/* Full recent-form window table — every per-match metric averaged over the last N,
              vs the opponent's own season average. Empty for xG-only opponents. */}
          {formRows.length ? (
            <Table
              dense
              cols={[{ label: isIS ? `Síðustu ${report.form.n} (meðaltal á leik)` : `Last ${report.form.n} (avg per match)`, flex: 1 }, { label: isIS ? `Síð. ${report.form.n}` : `Last ${report.form.n}`, width: 60, align: "right", strong: true }, { label: isIS ? "Tímabil" : "Season", width: 60, align: "right" }]}
              rows={formRows.map((r) => [label(r.metric), fm(r.metric, r.val), fm(r.metric, r.season)])}
            />
          ) : null}
          {report.worstDefeats.length ? (
            <Text style={[fb(400), { fontSize: 8.25, color: C.mute, marginTop: 5, lineHeight: 1.4 }]}>
              <Text style={[fb(600), { color: C.ink }]}>{isIS ? "Þyngstu töp: " : "Heaviest defeats: "}</Text>
              {clean(report.worstDefeats.map((m) => `${m.gf}-${m.ga}${m.opponent ? ` ${isIS ? "gegn" : "vs"} ${m.opponent}` : ""}`).join("   ·   "))}{isIS ? " - svona líta þeir út þegar þeir eru keyrðir." : " - how they look when overrun."}
            </Text>
          ) : null}
        </Section>

        <Section title={isIS ? "Þeir vs þú" : "Them vs you"}>
          <Text style={[fh(700), { fontSize: 10.5, lineHeight: 1.35, marginBottom: 4 }]}>{clean(pick(report.matchup.verdict, lang))}</Text>
          {report.headToHead.map((h, i) => {
            const verb = h.result === "W" ? (isIS ? "vann ykkur" : "beat you") : h.result === "L" ? (isIS ? "tapaði fyrir ykkur" : "lost to you") : (isIS ? "gerði jafntefli við ykkur" : "drew with you");
            const score = h.gf != null && h.ga != null ? ` ${h.gf}-${h.ga}` : "";
            const where = h.isHome === true ? (isIS ? " á heimavelli þeirra" : " at their ground") : h.isHome === false ? (isIS ? " á ykkar velli" : " at your ground") : "";
            return (
              <Text key={i} style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginBottom: 2 }]}>
                {isIS ? "Fyrri viðureign: " : "Earlier meeting: "}<Text style={fb(600)}>{clean(`${report.opponent} ${verb}${score}`)}</Text>{`${where} (${h.date}).`}
              </Text>
            );
          })}
          <View style={{ marginTop: 4 }}>
            <Table
              dense
              cols={[{ label: isIS ? "Mælikvarði" : "Metric", flex: 1 }, { label: isIS ? "Þeir" : "Them", width: 60, align: "right" }, { label: isIS ? "Þú" : "You", width: 60, align: "right" }]}
              rows={report.matchup.rows.filter((r) => r.them != null || r.you != null).map((r) => [label(r.metric), fm(r.metric, r.them), fm(r.metric, r.you)])}
            />
          </View>
        </Section>

        <Section title={isIS ? "Fyrirvarar og heimildir" : "Caveats & references"} wrap={false}>
          <Card>
            <Text style={[fb(400), { fontSize: 8.25, lineHeight: 1.5 }]}>{clean(footText)}</Text>
            <Text style={[fb(400), { fontSize: 7.5, color: C.mute, marginTop: 6, lineHeight: 1.45 }]}>
              <Text style={fb(600)}>{isIS ? "Heimildir: " : "References: "}</Text>
              Rathke, A. (2017). An examination of expected goals and shot efficiency in soccer. Journal of Human Sport and Exercise, 12(2proc), S514-S529.
              {"  "}Fernández-Navarro, J., Fradua, L., Zubillaga, A., Ford, P. R., & McRobert, A. P. (2016). Attacking and defensive styles of play in soccer. Journal of Sports Sciences, 34(24), 2195-2204.
            </Text>
          </Card>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadScoutReportPdf(report: OpponentReport, lang: Lang, label: (k: string) => string, prose?: ScoutProse) {
  const blob = await renderPdfBlob(() => <Doc report={report} lang={lang} label={label} prose={prose} />);
  saveBlob(blob, `${report.opponent.replace(/\s+/g, "-")}-scouting-${report.season}.pdf`);
}
