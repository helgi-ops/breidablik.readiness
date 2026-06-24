/**
 * Quality catalogue + game-model demand profiles for the "How to train this
 * player" engine (docs/train-like-you-play-individual.md).
 *
 * FIXED, paper-cited lookup — rules decide which qualities, AI only phrases later.
 * No AI, no recompute here: this is the typed decision substrate.
 */

export type GameModel = "high_press" | "possession" | "direct_transition" | "low_block_counter" | "balanced";

export const GAME_MODELS: GameModel[] = ["high_press", "possession", "direct_transition", "low_block_counter", "balanced"];

export const GAME_MODEL_LABEL: Record<GameModel, { EN: string; IS: string }> = {
  high_press: { EN: "High press", IS: "Hár pressa" },
  possession: { EN: "Possession", IS: "Boltahald" },
  direct_transition: { EN: "Direct / transition", IS: "Beint / umskipti" },
  low_block_counter: { EN: "Low block + counter", IS: "Lág vörn + skyndisókn" },
  balanced: { EN: "Balanced", IS: "Jafnvægi" },
};

export type Quality =
  | "max_velocity"
  | "repeated_sprint"
  | "acceleration"
  | "deceleration"
  | "change_of_direction"
  | "lr_asymmetry"
  | "hamstring_resilience"
  | "aerobic_density";

export const QUALITY_KEYS: Quality[] = [
  "max_velocity", "repeated_sprint", "acceleration", "deceleration",
  "change_of_direction", "lr_asymmetry", "hamstring_resilience", "aerobic_density",
];

/** How much each game model taxes each quality (0..1). Drives ranking. */
export const MODEL_DEMAND: Record<GameModel, Partial<Record<Quality, number>>> = {
  high_press: { repeated_sprint: 1.0, acceleration: 0.8, deceleration: 0.8, aerobic_density: 0.7, hamstring_resilience: 0.5 },
  possession: { change_of_direction: 0.9, acceleration: 0.7, deceleration: 0.7, repeated_sprint: 0.6, aerobic_density: 0.6 },
  direct_transition: { max_velocity: 1.0, hamstring_resilience: 0.9, acceleration: 0.6, repeated_sprint: 0.5 },
  low_block_counter: { max_velocity: 0.9, repeated_sprint: 0.8, deceleration: 0.8, hamstring_resilience: 0.6 },
  balanced: { max_velocity: 0.5, repeated_sprint: 0.5, acceleration: 0.5, deceleration: 0.5, change_of_direction: 0.5, hamstring_resilience: 0.5, aerobic_density: 0.5 },
};

export type QualityDef = {
  key: Quality;
  plain: { EN: string; IS: string };
  headline: { EN: string; IS: string };
  /** Rationale template; "{model}" is replaced with the game-model label. */
  why: { EN: string; IS: string };
  citation: string;
  methodFamily?: string;
  /** Pro-only: needs IMA — on GPS-only (Lite) it goes to notAssessable, never guessed. */
  proOnly?: boolean;
  /** The plain signal name shown as evidence (the actual column is supplied by the endpoint). */
  signalPlain: { EN: string; IS: string };
};

export const CATALOGUE: Record<Quality, QualityDef> = {
  max_velocity: {
    key: "max_velocity",
    plain: { EN: "Max-velocity maintenance", IS: "Hámarkshraða-viðhald" },
    headline: { EN: "Prioritise top-speed maintenance", IS: "Forgangsraða hámarkshraða-viðhaldi" },
    why: { EN: "He covers a lot of his work at high speed and your {model} taxes top-end sprinting — exposing top speed regularly protects and develops it.", IS: "Hann vinnur mikið á háum hraða og {model} reynir á hámarkshraða — regluleg háhraða-útsetning verndar og þróar hann." },
    citation: "Haugen 2019; Buchheit 2014",
    methodFamily: "max-velocity",
    signalPlain: { EN: "high-speed running share / top speed", IS: "háhraðahlaups-hlutfall / hámarkshraði" },
  },
  repeated_sprint: {
    key: "repeated_sprint",
    plain: { EN: "Repeated-sprint capacity", IS: "Endurtekinna-spretta geta" },
    headline: { EN: "Build repeated-sprint capacity", IS: "Byggja endurtekinna-spretta getu" },
    why: { EN: "He repeats high-speed efforts often and your {model} demands recovering between sprints — repeated-sprint work builds that tolerance.", IS: "Hann endurtekur háhraða-átök oft og {model} krefst endurheimtar milli spretta — endurtekinna-spretta vinna byggir þol." },
    citation: "Buchheit 2024",
    methodFamily: "repeated-sprint",
    signalPlain: { EN: "high-speed-running efforts", IS: "háhraðahlaups-átök" },
  },
  acceleration: {
    key: "acceleration",
    plain: { EN: "Acceleration mechanics", IS: "Hröðunar-tækni" },
    headline: { EN: "Sharpen acceleration mechanics", IS: "Skerpa hröðunar-tækni" },
    why: { EN: "His accelerations are high and your {model} lives on first-step explosiveness — acceleration work improves output and resilience.", IS: "Hröðun hans er mikil og {model} byggir á fyrsta-skrefs sprengikrafti — hröðunar-vinna bætir afköst og þol." },
    citation: "Morin 2016; di Prampero 2015",
    methodFamily: "acceleration",
    signalPlain: { EN: "acceleration efforts / peak acceleration", IS: "hröðunar-átök / hámarkshröðun" },
  },
  deceleration: {
    key: "deceleration",
    plain: { EN: "Deceleration / braking tolerance", IS: "Hemlunar-þol" },
    headline: { EN: "Build deceleration / braking tolerance", IS: "Byggja hemlunar-þol" },
    why: { EN: "He brakes hard and often, and your {model} loads decelerations — eccentric braking work raises tissue tolerance (the main injury driver).", IS: "Hann hemlar fast og oft, og {model} hleður hemlunum — sérvirk hemlunar-vinna hækkar vefja-þol (helsta meiðsla-orsökin)." },
    citation: "Harper 2019; McBurnie 2022",
    methodFamily: "eccentric-braking",
    signalPlain: { EN: "deceleration efforts / peak deceleration / HML", IS: "hemlunar-átök / hámarks-hemlun / HML" },
  },
  change_of_direction: {
    key: "change_of_direction",
    plain: { EN: "Change-of-direction & multidirectional", IS: "Stefnubreytingar & fjölátta" },
    headline: { EN: "Develop change-of-direction quality", IS: "Þróa stefnubreytinga-gæði" },
    why: { EN: "His change-of-direction volume is high and your {model} demands tight-space turning — multidirectional work develops it.", IS: "Stefnubreytinga-magn hans er mikið og {model} krefst snúninga í þröngu rými — fjölátta vinna þróar það." },
    citation: "McBurnie 2022",
    methodFamily: "cod",
    proOnly: true,
    signalPlain: { EN: "IMA change-of-direction events", IS: "IMA stefnubreytinga-atburðir" },
  },
  lr_asymmetry: {
    key: "lr_asymmetry",
    plain: { EN: "Left/right asymmetry correction", IS: "Vinstri/hægri ósamhverfa" },
    headline: { EN: "Correct a left/right imbalance", IS: "Leiðrétta vinstri/hægri ójafnvægi" },
    why: { EN: "His turning/braking is lopsided to one side — correcting the imbalance lowers overload risk on the dominant side.", IS: "Snúningar/hemlanir hans hallast á aðra hlið — leiðrétting lækkar of-álags-áhættu á ríkjandi hlið." },
    citation: "Robertson 2017",
    methodFamily: "asymmetry",
    proOnly: true,
    signalPlain: { EN: "IMA left vs right change-of-direction", IS: "IMA vinstri vs hægri stefnubreytingar" },
  },
  hamstring_resilience: {
    key: "hamstring_resilience",
    plain: { EN: "Hamstring eccentric / sprint-resilience", IS: "Aftanlæris-þol / sprett-seigla" },
    headline: { EN: "Protect the hamstrings (sprint-resilience)", IS: "Vernda aftanlæri (sprett-seigla)" },
    why: { EN: "His high-speed exposure is high — the main hamstring injury driver — so eccentric + sprint-resilience work is a priority.", IS: "Háhraða-útsetning hans er mikil — helsta aftanlæris-meiðsla-orsökin — svo sérvirk + sprett-seiglu vinna er forgangur." },
    citation: "Gabbett 2017; Nédélec 2012",
    methodFamily: "eccentric-hamstring",
    signalPlain: { EN: "sprint / high-speed exposure", IS: "spretta / háhraða-útsetning" },
  },
  aerobic_density: {
    key: "aerobic_density",
    plain: { EN: "Aerobic / density base", IS: "Þol / þéttleika-grunnur" },
    headline: { EN: "Build the aerobic / density base", IS: "Byggja þol- / þéttleika-grunn" },
    why: { EN: "His work rate (load per minute) runs high and your {model} demands sustaining it — an aerobic/density base supports repeated high-intensity work.", IS: "Vinnuhraði hans (álag á mínútu) er hár og {model} krefst þess að halda honum — þol-/þéttleika-grunnur styður endurtekna háákefð." },
    citation: "Buchheit 2014",
    methodFamily: "aerobic",
    signalPlain: { EN: "player load per minute / session density", IS: "player load á mínútu / þéttleiki" },
  },
};
