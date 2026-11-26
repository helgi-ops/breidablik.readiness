/**
 * Privacy for practices, shown at /privacy/practices:
 *   Part A — the trainer's own data (we are the controller).
 *   Part B — the clients' data (the practice is the controller, we are the
 *            processor): the data processing terms (GDPR Art. 28) that the
 *            practice terms refer to.
 *
 * DRAFT (2026-11-22): must be read by a lawyer before it is relied on. Facts
 * checked against the system on 2026-11-22: database (Supabase) and app servers
 * (Vercel, fra1) in Frankfurt, Germany; email via Resend; AI-written summaries
 * via Anthropic (USA). The transfer basis for Anthropic is a placeholder.
 */
import type { LegalText } from "@/components/legal/LegalDocument";
import type { Lang } from "@/lib/lang";
import { OPERATOR } from "./operator";

const op = OPERATOR;
const TRANSFER_BASIS_EN = "[TRANSFER BASIS — e.g. EU standard contractual clauses; to confirm]";
const TRANSFER_BASIS_IS = "[GRUNDVÖLLUR MIÐLUNAR — t.d. staðlaðir samningsskilmálar ESB; á eftir að staðfesta]";

export const PRACTICE_PRIVACY: Record<Lang, LegalText> = {
  EN: {
    eyebrow: "Privacy",
    title: "Privacy and data processing for practices",
    intro: `This page has two parts: how we handle your own data as a trainer, and how we process your clients' data on your behalf. MicroPulse is operated by ${op.name}.`,
    sections: [
      {
        h: "Your data as a trainer (we decide about it)",
        list: [
          "What: your name, email, practice name and country; how you use the app (which pages and features); and what you write to support.",
          "Why: to run your account, contact you about the service, and improve it. The legal basis is our contract with you and our legitimate interest in improving the service.",
          "How long: while your account is open, and up to 30 days after you close it, unless the law requires longer.",
        ],
      },
      {
        h: "Your clients' data (you decide about it)",
        p: [
          "For your clients' data, your practice is the controller and we are the processor. We process it only to provide MicroPulse to you, following your instructions as given through the app. This section is the data processing agreement between us.",
        ],
        list: [
          "What: check-in answers (sleep, fatigue, soreness and more), logged training (sets, weights, effort), body weight, uploaded reports, messages, and pain reported in corrective exercises. Some of this is health data.",
          "Confidentiality: only people at our company who need it to run or support the service can access it, and they are bound to confidentiality.",
          "Security: access is limited per practice in the database, data is encrypted in transit, and access to the production systems is restricted.",
          "Requests from clients: we help you answer requests to see, correct, export or delete a client's data.",
          "Breaches: if a breach affects your clients' data, we tell you without undue delay, with what we know.",
          "End: when you close your account, we delete the data within 30 days, and can export it for you first.",
        ],
      },
      {
        h: "Service providers we use",
        p: ["These providers process data for us, under contract. You agree that we may use them; we will tell you before adding a new one."],
        list: [
          "Supabase — database and sign-in (Frankfurt, Germany).",
          "Vercel — hosting of the app (Frankfurt, Germany).",
          "Resend — sending email, such as client invitations.",
          `Anthropic — AI-written summaries, always labelled as AI (USA; ${TRANSFER_BASIS_EN}).`,
          "Apple, Google and Mozilla — delivering push notifications to the devices that turned them on.",
        ],
      },
      {
        h: "Your rights",
        p: [
          `You can ask to see, correct, export or delete your data, or object to how we use it, by writing to ${op.supportEmail}. You can also complain to the Icelandic Data Protection Authority (Persónuvernd, personuvernd.is).`,
        ],
      },
    ],
  },
  IS: {
    eyebrow: "Persónuvernd",
    title: "Persónuvernd og vinnsla gagna fyrir stofur",
    intro: `Þessi síða er í tveimur hlutum: hvernig við förum með þín eigin gögn sem þjálfara, og hvernig við vinnum gögn viðskiptavina þinna fyrir þína hönd. ${op.name} rekur MicroPulse.`,
    sections: [
      {
        h: "Gögnin þín sem þjálfara (við ráðum þeim)",
        list: [
          "Hvað: nafn, netfang, nafn stofu og land; hvernig þú notar appið (hvaða síður og eiginleika); og það sem þú skrifar til þjónustunnar.",
          "Af hverju: til að reka aðganginn, hafa samband við þig um þjónustuna og bæta hana. Heimildin er samningurinn við þig og lögmætir hagsmunir okkar af því að bæta þjónustuna.",
          "Hve lengi: á meðan aðgangurinn er opinn og í allt að 30 daga eftir að honum er lokað, nema lög krefjist lengri geymslu.",
        ],
      },
      {
        h: "Gögn viðskiptavina þinna (þú ræður þeim)",
        p: [
          "Stofan þín er ábyrgðaraðili gagna viðskiptavina sinna og við erum vinnsluaðili. Við vinnum þau aðeins til að veita þér MicroPulse, samkvæmt fyrirmælum þínum eins og þau eru gefin í appinu. Þessi hluti er vinnslusamningurinn á milli okkar.",
        ],
        list: [
          "Hvað: svör í check-in (svefn, þreyta, harðsperrur o.fl.), skráðar æfingar (sett, þyngdir, áreynsla), líkamsþyngd, skýrslur sem hlaðið er upp, skilaboð og verkir skráðir í leiðréttingaræfingum. Sumt af þessu eru heilsufarsupplýsingar.",
          "Trúnaður: aðeins þeir hjá fyrirtækinu sem þurfa þess til að reka eða styðja þjónustuna hafa aðgang, og þeir eru bundnir trúnaði.",
          "Öryggi: aðgangur er afmarkaður við hverja stofu í gagnagrunninum, gögn eru dulkóðuð í flutningi og aðgangur að kerfunum er takmarkaður.",
          "Beiðnir viðskiptavina: við hjálpum þér að svara beiðnum um að sjá, leiðrétta, afhenda eða eyða gögnum viðskiptavinar.",
          "Öryggisbrestir: ef brestur snertir gögn viðskiptavina þinna látum við þig vita án ótilhlýðilegrar tafar, með því sem við vitum.",
          "Lok: þegar þú lokar aðganginum eyðum við gögnunum innan 30 daga og getum afhent þér þau fyrst.",
        ],
      },
      {
        h: "Þjónustuaðilar sem við notum",
        p: ["Þessir aðilar vinna gögn fyrir okkur samkvæmt samningi. Þú samþykkir að við notum þá; við látum þig vita áður en nýjum er bætt við."],
        list: [
          "Supabase — gagnagrunnur og innskráning (Frankfurt, Þýskalandi).",
          "Vercel — hýsing appsins (Frankfurt, Þýskalandi).",
          "Resend — sending tölvupósts, t.d. boða til viðskiptavina.",
          `Anthropic — samantektir skrifaðar af gervigreind, alltaf merktar sem slíkar (Bandaríkjunum; ${TRANSFER_BASIS_IS}).`,
          "Apple, Google og Mozilla — afhending tilkynninga (push) á tæki sem kveiktu á þeim.",
        ],
      },
      {
        h: "Réttindi þín",
        p: [
          `Þú getur beðið um að sjá, leiðrétta, fá afhent eða eyða gögnunum þínum, eða andmælt notkun þeirra, með því að skrifa á ${op.supportEmail}. Þú getur líka kvartað til Persónuverndar (personuvernd.is).`,
        ],
      },
    ],
  },
};
