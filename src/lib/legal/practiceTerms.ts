/**
 * Terms for practices (personal trainers / S&C coaches on the self-serve plan),
 * shown at /terms and agreed to at /signup/trainer.
 *
 * DRAFT (2026-11-22): written as a starting point and must be read by a lawyer
 * before it is relied on. Company details come from OPERATOR (placeholders until
 * filled in). Bump PRACTICE_TERMS_VERSION when the text changes.
 */
import type { LegalText } from "@/components/legal/LegalDocument";
import type { Lang } from "@/lib/lang";
import { OPERATOR } from "./operator";

const op = OPERATOR;

export const PRACTICE_TERMS: Record<Lang, LegalText> = {
  EN: {
    eyebrow: "Terms",
    title: "Terms for practices",
    intro: `These terms apply when a personal trainer, strength coach or practice ("you") uses MicroPulse for their clients. MicroPulse is operated by ${op.name} ("we"). Clubs that have a separate written agreement with us are covered by that agreement instead.`,
    sections: [
      {
        h: "Your account",
        p: [
          "You must be at least 18 and give correct details when you sign up. You are responsible for keeping your login safe and for what happens in your practice's account, including by people you invite.",
        ],
      },
      {
        h: "Your clients",
        p: [
          "You decide whom to invite and what data to keep about them. You are responsible for having a lawful basis for processing your clients' data and for telling them about it; the client privacy notice at /privacy helps with that. Clients under 18 need a parent's or guardian's consent.",
          "MicroPulse gives training guidance based on rules and your clients' own data. It is not medical advice and does not replace your professional judgement. You remain responsible for the training you prescribe.",
        ],
      },
      {
        h: "Price",
        p: [
          "MicroPulse is free for practices during early access. Before we start charging, we will email you at least 30 days in advance with the price. You can then choose to stop, and we will export or delete your data on request. Your clients never pay us.",
        ],
      },
      {
        h: "Acceptable use",
        list: [
          "Use MicroPulse only lawfully and for coaching your own clients.",
          "Do not try to access other practices' or clubs' data, or test, probe or break our security.",
          "Do not copy, resell or reverse-engineer the service.",
          "Only upload content you have the right to use.",
        ],
      },
      {
        h: "Your content and data",
        p: [
          "You keep the rights to the programmes, notes and data you add. You give us the rights we need to store and process them to run the service for you. When we process your clients' personal data, we do so on your behalf under the data processing terms at /privacy/practices, which form part of these terms.",
        ],
      },
      {
        h: "Changes and availability",
        p: [
          "During early access, features may change. We work to keep the service available but cannot promise it will always be uninterrupted or error-free. If we change these terms in a way that matters, we will tell you by email before the change applies.",
        ],
      },
      {
        h: "Ending",
        p: [
          `You can stop at any time by writing to ${op.supportEmail}. We will delete your practice's and your clients' data within 30 days, unless the law requires us to keep something longer, and can export it for you first. We may suspend an account that breaks these terms, and will tell you why.`,
        ],
      },
      {
        h: "Liability",
        p: [
          "While MicroPulse is free, it is provided as it is. To the extent the law allows, we are not liable for indirect losses such as lost income or lost data. Nothing in these terms limits liability that cannot be limited by law.",
        ],
      },
      {
        h: "Law",
        p: ["These terms are governed by Icelandic law. Disputes go to Reykjavík District Court (Héraðsdómur Reykjavíkur), unless the law gives you another choice."],
      },
    ],
  },
  IS: {
    eyebrow: "Skilmálar",
    title: "Skilmálar fyrir stofur",
    intro: `Þessir skilmálar gilda þegar einkaþjálfari, styrktarþjálfari eða stofa („þú") notar MicroPulse fyrir viðskiptavini sína. ${op.name} („við") rekur MicroPulse. Félög sem eru með sérstakan skriflegan samning við okkur falla undir hann í staðinn.`,
    sections: [
      {
        h: "Aðgangurinn þinn",
        p: [
          "Þú þarft að vera orðin(n) 18 ára og gefa réttar upplýsingar við skráningu. Þú berð ábyrgð á að halda innskráningunni öruggri og á því sem gerist í aðgangi stofunnar, líka af hálfu þeirra sem þú býður.",
        ],
      },
      {
        h: "Viðskiptavinir þínir",
        p: [
          "Þú ákveður hverjum þú býður og hvaða gögn þú geymir um þá. Þú berð ábyrgð á að hafa lögmæta heimild til að vinna gögn viðskiptavina og á að upplýsa þá um það; persónuverndaryfirlitið fyrir viðskiptavini á /privacy hjálpar til við það. Viðskiptavinir undir 18 ára þurfa samþykki foreldris eða forráðamanns.",
          "MicroPulse gefur ráðleggingar um æfingar út frá reglum og gögnum viðskiptavinanna sjálfra. Það er ekki læknisráð og kemur ekki í stað faglegs mats þíns. Þú berð áfram ábyrgð á æfingunum sem þú leggur fyrir.",
        ],
      },
      {
        h: "Verð",
        p: [
          "MicroPulse er frítt fyrir stofur á meðan á prufutíma stendur. Áður en við byrjum að rukka sendum við þér tölvupóst með verðinu með minnst 30 daga fyrirvara. Þá getur þú valið að hætta og við afhendum eða eyðum gögnunum þínum ef þú biður um það. Viðskiptavinir þínir borga okkur aldrei.",
        ],
      },
      {
        h: "Leyfileg notkun",
        list: [
          "Notaðu MicroPulse aðeins á lögmætan hátt og til að þjálfa þína eigin viðskiptavini.",
          "Reyndu ekki að komast í gögn annarra stofa eða félaga, eða að prófa, kanna eða brjóta öryggið.",
          "Ekki afrita, endurselja eða bakþýða þjónustuna.",
          "Hladdu aðeins upp efni sem þú hefur rétt til að nota.",
        ],
      },
      {
        h: "Efnið þitt og gögnin",
        p: [
          "Þú heldur réttinum að áætlunum, athugasemdum og gögnum sem þú bætir við. Þú veitir okkur þann rétt sem við þurfum til að geyma þau og vinna til að reka þjónustuna fyrir þig. Þegar við vinnum persónuupplýsingar viðskiptavina þinna gerum við það fyrir þína hönd samkvæmt vinnsluskilmálunum á /privacy/practices, sem eru hluti af þessum skilmálum.",
        ],
      },
      {
        h: "Breytingar og aðgengi",
        p: [
          "Á prufutíma geta eiginleikar breyst. Við leggjum okkur fram um að þjónustan sé aðgengileg en getum ekki lofað að hún verði alltaf án truflana eða villna. Ef við breytum skilmálunum á þann hátt að það skipti máli látum við þig vita með tölvupósti áður en breytingin tekur gildi.",
        ],
      },
      {
        h: "Uppsögn",
        p: [
          `Þú getur hætt hvenær sem er með því að skrifa á ${op.supportEmail}. Við eyðum gögnum stofunnar og viðskiptavina hennar innan 30 daga, nema lög krefjist lengri geymslu, og getum afhent þér þau fyrst. Við getum lokað aðgangi sem brýtur þessa skilmála og segjum þér þá af hverju.`,
        ],
      },
      {
        h: "Ábyrgð",
        p: [
          "Á meðan MicroPulse er frítt er það veitt eins og það er. Að því marki sem lög leyfa berum við ekki ábyrgð á óbeinu tjóni, svo sem tekjumissi eða gagnatapi. Ekkert í þessum skilmálum takmarkar ábyrgð sem ekki má takmarka samkvæmt lögum.",
        ],
      },
      {
        h: "Lög og varnarþing",
        p: ["Um skilmálana gilda íslensk lög. Ágreiningur fer fyrir Héraðsdóm Reykjavíkur, nema lög veiti þér annan kost."],
      },
    ],
  },
};
