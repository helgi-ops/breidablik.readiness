/**
 * DataProcessingSummary — the plain-language "what/why/who/your rights" of the
 * app's data processing, shown BOTH in the first-run consent prompt and on the
 * /privacy page (one source, so the consent a player agrees to always matches
 * the policy they can go back and read).
 *
 * This is a plain-language SUMMARY written to satisfy informed consent under
 * GDPR (health/performance data = special category, Art. 9). It is NOT a
 * substitute for a lawyer-reviewed privacy policy — the club/operator should
 * have it reviewed before relying on it in production.
 *
 * Two variants: "club" (players at a club — the original text, unchanged so no
 * player is re-asked) and "pt" (clients of a personal trainer: no GPS/Catapult,
 * the trainer and their practice see it). The PT text describes narrower
 * processing than the club text existing PT clients agreed to, so it does not
 * bump CURRENT_POLICY_VERSION.
 */

type Lang = "IS" | "EN";

const T = {
  IS: {
    what: "Hvaða gögn eru unnin",
    whatItems: [
      "Líðan og check-in — svefn, þreyta, harðsperrur, streita, skap.",
      "Álag úr GPS- og hröðunarmælum (Catapult) — vegalengd, hraði, hröðun/hemlun, hreyfimynstur.",
      "Áreynsla (RPE), styrktaræfingar og skráð meiðsla-/heilsustaða.",
    ],
    why: "Til hvers",
    whyText:
      "Til að meta hvort þú sért líkamlega tilbúin(n), stýra æfingaálagi og draga úr meiðslahættu. Kerfið reiknar ráðleggingar út frá þínum eigin viðmiðum — reglur ráða, útskýringar fylgja.",
    who: "Hver sér gögnin",
    whoText:
      "Þjálfarar og styrktarþjálfarar hjá liðinu þínu. Gögnin eru ekki seld og ekki deilt með þriðja aðila án sérstaks samþykkis þíns.",
    rights: "Réttindi þín",
    rightsText:
      "Þú getur hvenær sem er skoðað hver hefur aðgang og afturkallað samþykkið undir „Friðhelgi“ í appinu. Vinnslan fer fram samkvæmt persónuverndarlögum (GDPR).",
    minor: "Þú ert undir 18 ára — forráðamaður þarf að staðfesta þetta samþykki fyrir þína hönd.",
  },
  EN: {
    what: "What data is processed",
    whatItems: [
      "Wellness & check-ins — sleep, fatigue, soreness, stress, mood.",
      "GPS & accelerometer load (Catapult) — distance, speed, accel/decel, movement patterns.",
      "Perceived effort (RPE), strength sessions, and recorded injury/health status.",
    ],
    why: "Why",
    whyText:
      "To assess whether you're physically ready, manage training load, and reduce injury risk. The system computes guidance from your own baselines — rules decide, explanations follow.",
    who: "Who sees it",
    whoText:
      "Your coaches and S&C staff at your club. Your data is not sold and not shared with third parties without your specific consent.",
    rights: "Your rights",
    rightsText:
      "You can see who has access and revoke this consent at any time under “Privacy” in the app. Processing is carried out under GDPR.",
    minor: "You are under 18 — a parent or guardian must confirm this consent on your behalf.",
  },
} as const;

/** Clients of a personal trainer (the /client app). */
const T_PT = {
  IS: {
    ...T.IS,
    whatItems: [
      "Líðan og check-in — svefn, þreyta, harðsperrur og annað sem þú svarar.",
      "Æfingarnar þínar — sett, þyngdir, endurtekningar og áreynsla (RPE).",
      "Líkamsþyngd, skýrslur sem þú eða þjálfarinn hleður upp, skilaboð og verkir sem þú skráir í leiðréttingaræfingum.",
    ],
    whyText:
      "Svo þjálfarinn þinn geti skipulagt og stillt æfingarnar, og svo appið geti lagað æfingu dagsins að líðan þinni. Reglur ráða, útskýringar fylgja.",
    whoText:
      "Þjálfarinn þinn og stofan hans. MicroPulse vinnur gögnin fyrir hönd stofunnar. Gögnin eru ekki seld og ekki deilt með öðrum án sérstaks samþykkis þíns.",
  },
  EN: {
    ...T.EN,
    whatItems: [
      "Wellness & check-ins — sleep, fatigue, soreness and anything else you answer.",
      "Your training — sets, weights, reps and perceived effort (RPE).",
      "Body weight, reports you or your trainer upload, messages, and pain you report in corrective exercises.",
    ],
    whyText:
      "So your trainer can plan and adjust your training, and so the app can fit today's session to how you feel. Rules decide, explanations follow.",
    whoText:
      "Your trainer and their practice. MicroPulse processes the data on the practice's behalf. Your data is not sold and not shared with anyone else without your specific consent.",
  },
} as const;

export function DataProcessingSummary({ lang, isMinor = false, variant = "club" }: { lang: Lang; isMinor?: boolean; variant?: "club" | "pt" }) {
  const t = variant === "pt" ? T_PT[lang] : T[lang];
  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-700">
      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900">{t.what}</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {t.whatItems.map((it) => <li key={it}>{it}</li>)}
        </ul>
      </section>
      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900">{t.why}</h3>
        <p className="mt-1">{t.whyText}</p>
      </section>
      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900">{t.who}</h3>
        <p className="mt-1">{t.whoText}</p>
      </section>
      <section>
        <h3 className="text-[13px] font-semibold text-zinc-900">{t.rights}</h3>
        <p className="mt-1">{t.rightsText}</p>
      </section>
      {isMinor && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {t.minor}
        </p>
      )}
    </div>
  );
}
