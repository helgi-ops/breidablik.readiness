"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/form-vs-state — Readiness-Adjusted Tactical Output (differentiator #2), own page.
 *
 * Separates "he's out of form" from "he was physically compromised": reads a player's recent
 * per-match tactical output (OBV) against his readiness colour on each match date + context.
 * A tactical-output read (StatsBomb), NOT physical — so it is NOT GPS-gated. Advisory /
 * descriptive; it never touches the readiness colour or the daily decision.
 */

import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import FormVsStatePanel from "@/components/coach/FormVsStatePanel";

export default function FormVsStatePage() {
  const [lang] = useLang();
  const is = lang === "IS";
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Form vs ástand" : "Form vs State"}</h1>
      <PagePurpose
        tutorial="form-vs-state"
        en="Separates two things coaches confuse: “he's out of form” vs “he was physically compromised.” Reads a player's tactical output (OBV) against his readiness colour and match context, and tags whether a trend is a genuine form change or a state/context artifact. An analysis lens — never the readiness verdict."
        is="Aðskilur tvennt sem þjálfarar rugla saman: „hann er í lélegu formi“ vs „hann var líkamlega skertur“. Les tæknilegt úttak (OBV) leikmanns í ljósi readiness-litarins og leiksamhengis, og merkir hvort þróun sé raunveruleg form-breyting eða ástands-/samhengis-skekkja. Greinandi linsa — aldrei readiness-dómurinn."
      />
      <FormVsStateExplainer is={is} />
      <div className="mt-4">
        <FormVsStatePanel standalone />
      </div>
    </div>
  );
}

/** Always-available, expandable in-page explainer — what OBV is, what each verdict means, how
 *  to read the table. Layer-2 detail per the explainability rules: on the page, behind a toggle. */
function FormVsStateExplainer({ is }: { is: boolean }) {
  const glossary: { term: string; def: string }[] = is
    ? [
        { term: "OBV (On-Ball Value)", def: "StatsBomb-tala fyrir sóknarvirði. Hver aðgerð með boltann (sending, burður, rekstur, skot, varnaraðgerð) fær plús eða mínus eftir því hversu mikið hún breytti líkum liðsins á að skora mínus að fá á sig — út frá því hvar boltinn byrjaði og endaði. Leiks-OBV = summan: ein tala um heildarvirði sem hann bætti við með boltanum. Ríkari en mörk/stoðsendingar því hún metur uppbygginguna líka." },
        { term: "Venja (OBV/90)", def: "Hans eigin tímabils-meðaltal á 90 mínútur — viðmiðið sem hver leikur er borinn saman við. Við berum leikmann saman við sjálfan sig, ekki við aðra." },
        { term: "Readiness-litur", def: "Canonical morgunlitur leikmannsins þann leikdag (grænn / gulur / rauður) úr readiness_entries — nákvæmlega sami litur og daglega yfirlitið sýnir. Gulur/rauður = líkamlega skertur þann dag." },
        { term: "Hreinn vs skertur leikur", def: "Hreinn = grænn OG ekki úti gegn toppliði. Skertur = gulur/rauður EÐA úti gegn toppliði. Lykillinn: dýfa í hreinum leikjum er form; dýfa aðeins í skertum leikjum er ástand + leikjaprógramm." },
        { term: "Stig andstæðings", def: "Úr njósnastöðu í deildinni: topp (sæti 1–4), mið (5–8), neðri (9+). „—“ þýðir að andstæðingurinn er enn ekki njósnaður." },
        { term: "~áætl", def: "Readiness-liturinn þann dag var reiknaður (ekki skráður inn af leikmanni). Lækkar vissu — við eignum ekki dýfu ástandi sem við giskuðum á." },
      ]
    : [
        { term: "OBV (On-Ball Value)", def: "StatsBomb's possession-value number. Each on-ball action (pass, carry, dribble, shot, defensive action) scores plus or minus by how much it changed his team's probability of scoring minus conceding — from where the ball started and ended. Match OBV = the sum: one number for the end-to-end value he added on the ball. Richer than goals/assists because it credits the build-up too." },
        { term: "Norm (OBV/90)", def: "His own season average per 90 minutes — the baseline every match is compared against. We compare a player to himself, not to others." },
        { term: "Readiness colour", def: "The player's canonical morning colour on that match day (green / amber / red) from readiness_entries — the exact colour the Daily Briefing shows. Amber/red = physically compromised that day." },
        { term: "Clean vs compromised match", def: "Clean = green AND not away-to-a-top-side. Compromised = amber/red OR away-to-a-top-side. The crux: a dip on clean matches is form; a dip only on compromised matches is state + the schedule." },
        { term: "Opponent level", def: "From the scouted league position: top (1–4), mid (5–8), low (9+). “—” means the opponent isn't scouted yet." },
        { term: "~est", def: "The readiness colour that day was estimated (not checked in by the player). Lowers confidence — we won't attribute a dip to a state we guessed." },
      ];

  const verdicts: { chip: string; cls: string; def: string }[] = is
    ? [
        { chip: "Skýrist af ástandi", cls: "border-blue-300 bg-blue-50 text-blue-700", def: "Úttakið datt, en dýfan lendir á gulum/rauðum eða úti-gegn-toppi leikjum — í hreinum leikjum heldur hann venju. Þetta er ekki form-viðvörun; talan var bæld af ástandi og leikjaprógrammi." },
        { chip: "Raunveruleg form-dýfa", cls: "border-red-300 bg-red-50 text-red-700", def: "Úttakið datt líka í hreinum leikjum (grænn, heima). Ástand útskýrir það ekki — þetta er raunverulegt form-/kunnáttu-merki sem er þess virði að skoða." },
        { chip: "Yfir-frammistaða þrátt fyrir skert ástand", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Yfir venju þrátt fyrir háa skerts-hlutdeild. Raunverulega frábært — hann skilaði virði þegar líkaminn og leikirnir voru á móti honum." },
        { chip: "Stöðugt", cls: "border-slate-300 bg-slate-50 text-slate-600", def: "Úttak er nálægt venju hans — engin marktæk dýfa eða toppur að skýra." },
        { chip: "Ekki nóg enn", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Færri en 4 metnir leikir (úttak + readiness), eða engin venja enn. Við sýnum merktu söguna en gefum EKKI dóm — heiðarlegra en að giska. Lifnar við eftir því sem fleiri per-leiks gögn eru skráð." },
      ]
    : [
        { chip: "Explained by state", cls: "border-blue-300 bg-blue-50 text-blue-700", def: "Output dipped, but the dip lands on amber/red or away-to-top matches — on clean matches he holds his norm. This is not a form flag; the number was suppressed by state and the schedule." },
        { chip: "Genuine form dip", cls: "border-red-300 bg-red-50 text-red-700", def: "Output dipped on clean matches too (green, home). State does not explain it — this is a real form/skill signal worth a look." },
        { chip: "Over-performing while compromised", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Above his norm despite a high compromised-share. Genuinely excellent — he delivered value when his body and the fixtures were against him." },
        { chip: "Steady", cls: "border-slate-300 bg-slate-50 text-slate-600", def: "Output sits near his norm — no meaningful dip or spike to explain." },
        { chip: "Not enough yet", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Fewer than 4 graded matches (output + readiness), or no norm yet. We show the tagged history but give NO verdict — more honest than guessing. It lights up as more per-match data is entered." },
      ];

  return (
    <details className="group mt-3 rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">
          {is ? "Hvað er ég að skoða? OBV, dómarnir og taflan útskýrð" : "What am I looking at? OBV, the verdicts and the table explained"}
        </span>
        <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
      </summary>
      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Í stuttu máli" : "In one line"}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
            {is
              ? "Þegar tæknilegt úttak leikmanns (OBV) dettur spyrjum við eina spurningu: er þetta raunverulegt form-vandamál, eða var hann líkamlega skertur? Við merkjum hvern nýlegan leik með readiness-litnum hans og samhenginu, og segjum þér hvort er — án þess að snerta readiness-dóminn."
              : "When a player's tactical output (OBV) dips we ask one question: is this a real form problem, or was he physically compromised? We tag each recent match with his readiness colour and context, and tell you which — without ever touching the readiness verdict."}
          </p>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Orðin á síðunni" : "The words on this page"}</h3>
          <dl className="mt-2 space-y-2.5">
            {glossary.map((g) => (
              <div key={g.term}>
                <dt className="text-[13px] font-semibold text-slate-900">{g.term}</dt>
                <dd className="text-[12.5px] leading-relaxed text-slate-600">{g.def}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Dómarnir fimm" : "The five verdicts"}</h3>
          <ul className="mt-2 space-y-2.5">
            {verdicts.map((v) => (
              <li key={v.chip} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.chip}</span>
                <span className="text-[12.5px] leading-relaxed text-slate-600">{v.def}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
          {is
            ? "Af hverju bara fáir leikir? OBV kemur úr per-leikmanns StatsBomb-skrám og flestir leikir eru enn aðeins skráðir á liðs-stigi — því sýna flestir leikmenn „ekki nóg enn“ í dag. Þetta lifnar við sjálfkrafa eftir því sem fleiri per-leiks leikmannaskrár eru fluttar inn."
            : "Why only a few matches? OBV comes from per-player StatsBomb files and most matches are still entered only at team level — so most players read “not enough yet” today. This fills in automatically as more per-match player files are ingested."}
        </p>
      </div>
    </details>
  );
}
