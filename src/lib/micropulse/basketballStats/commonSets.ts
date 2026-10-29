/**
 * commonSets — a small library of recognisable half-court sets the AI matcher compares a
 * clip against (and that coaches can drop in as a starter template to tweak).
 *
 * Coordinates use the shared diagram schema (0–100 x, 0–94 y; basket ≈ x50 y84 — see
 * playDiagram.ts). Each set carries a plain bilingual DESCRIPTION — that text, not the
 * drawing, is what the vision model matches against, so keep it concrete (formation + the
 * key action). Descriptive scouting only; never a readiness or training signal.
 */

import type { PlayDiagram } from "./playDiagram";

export type CommonSet = {
  key: string;
  name: { en: string; is: string };
  playType: string;
  description: { en: string; is: string };
  diagram: PlayDiagram;
};

export const COMMON_SETS: CommonSet[] = [
  {
    key: "horns",
    name: {"en":"Horns","is":"Horns"},
    playType: "pnrHandler",
    description: {"en":"Two bigs at the elbows, two shooters in the corners, point guard up top (a 'horns' shape). The handler uses one of the two high ball-screens while the other big rolls or pops.","is":"Tveir stórir á olnbogunum, tvær skyttur í hornunum, leikstjóri efst (horns-form). Leikstjóri nýtir aðra af tveimur háum skýlingum meðan hinn stóri rúllar eða poppar."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":68,"ball":true,"label":"1"},{"id":"o2","team":"off","x":38,"y":44,"label":"5"},{"id":"o3","team":"off","x":62,"y":44,"label":"4"},{"id":"o4","team":"off","x":8,"y":14,"label":"2"},{"id":"o5","team":"off","x":92,"y":14,"label":"3"}],"arrows":[{"from":[38,44],"to":[46,62],"kind":"screen"},{"from":[50,68],"to":[40,48],"kind":"dribble"},{"from":[62,44],"to":[60,24],"kind":"move"}]},
  },
  {
    key: "spread_pnr",
    name: {"en":"Spread ball-screen","is":"Spread skýling"},
    playType: "pnrHandler",
    description: {"en":"Four players spaced around the arc with one screener — a side or middle ball-screen with the floor spread, shooters in both corners and a clear driving lane.","is":"Fjórir leikmenn dreifðir um þriggja stiga boga með einn skyljara — hliðar- eða miðju-skýling með opið gólf, skyttur í báðum hornum og opin akrein að körfu."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":70,"ball":true,"label":"1"},{"id":"o2","team":"off","x":42,"y":54,"label":"5"},{"id":"o3","team":"off","x":14,"y":44,"label":"2"},{"id":"o4","team":"off","x":8,"y":16,"label":"3"},{"id":"o5","team":"off","x":92,"y":16,"label":"4"}],"arrows":[{"from":[42,54],"to":[48,64],"kind":"screen"},{"from":[50,70],"to":[64,46],"kind":"dribble"}]},
  },
  {
    key: "floppy",
    name: {"en":"Floppy","is":"Floppy"},
    playType: "screenOff",
    description: {"en":"A shooter starts under the rim and chooses one of two screens — a single down-screen one way or a double/baseline screen the other — to pop out to a wing or corner for a catch-and-shoot.","is":"Skytta byrjar undir körfu og velur aðra af tveimur skýlingum — staka niður annars vegar eða tvöfalda/grunnlínu hins vegar — til að losna út á væng eða horn fyrir grípa-og-skjóta."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":68,"ball":true,"label":"1"},{"id":"o2","team":"off","x":50,"y":14,"label":"2"},{"id":"o3","team":"off","x":40,"y":20,"label":"5"},{"id":"o4","team":"off","x":60,"y":20,"label":"4"},{"id":"o5","team":"off","x":82,"y":46,"label":"3"}],"arrows":[{"from":[50,14],"to":[12,22],"kind":"move"},{"from":[40,20],"to":[40,26],"kind":"screen"}]},
  },
  {
    key: "zipper",
    name: {"en":"Zipper","is":"Zipper"},
    playType: "screenOff",
    description: {"en":"A guard sprints up from the block to the top off a screen (a 'zipper' cut) to receive the ball, usually flowing straight into a ball-screen or hand-off.","is":"Vörður spretta frá blokk upp á topp af skýlingu ('zipper' skurður) til að taka við boltanum, oftast beint inn í skýlingu eða afhendingu."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":72,"y":54,"ball":true,"label":"1"},{"id":"o2","team":"off","x":45,"y":20,"label":"2"},{"id":"o3","team":"off","x":48,"y":52,"label":"5"},{"id":"o4","team":"off","x":10,"y":44,"label":"3"},{"id":"o5","team":"off","x":8,"y":16,"label":"4"}],"arrows":[{"from":[48,52],"to":[49,58],"kind":"screen"},{"from":[45,20],"to":[50,64],"kind":"move"},{"from":[72,54],"to":[52,64],"kind":"pass"}]},
  },
  {
    key: "horns_flare",
    name: {"en":"Horns flare","is":"Horns flare"},
    playType: "catchShoot",
    description: {"en":"From a horns look, a big steps out to set a flare screen for a shooter lifting to the wing, who receives a skip pass for a catch-and-shoot three.","is":"Úr horns-uppstillingu stígur stór út og setur flare-skýlingu fyrir skyttu sem lyftir sér á væng og fær langsendingu í grípa-og-skjóta þristi."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":68,"ball":true,"label":"1"},{"id":"o2","team":"off","x":38,"y":44,"label":"5"},{"id":"o3","team":"off","x":62,"y":44,"label":"4"},{"id":"o4","team":"off","x":74,"y":48,"label":"3"},{"id":"o5","team":"off","x":8,"y":16,"label":"2"}],"arrows":[{"from":[62,44],"to":[84,54],"kind":"screen"},{"from":[50,68],"to":[86,52],"kind":"pass"}]},
  },
  {
    key: "iso_clearout",
    name: {"en":"Isolation / clear-out","is":"Einn á einn / clear-out"},
    playType: "iso",
    description: {"en":"The ball-handler is isolated on a wing or at the top with everyone else cleared to the weak side, attacking one-on-one off the dribble.","is":"Boltamaðurinn er einangraður á væng eða efst meðan allir aðrir eru ruddir yfir á veiku hliðina, sækir einn á einn af rakningu."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":78,"y":52,"ball":true,"label":"1"},{"id":"o2","team":"off","x":50,"y":72,"label":"2"},{"id":"o3","team":"off","x":10,"y":52,"label":"3"},{"id":"o4","team":"off","x":8,"y":16,"label":"4"},{"id":"o5","team":"off","x":24,"y":20,"label":"5"}],"arrows":[{"from":[78,52],"to":[66,32],"kind":"dribble"}]},
  },
  {
    key: "spain_pnr",
    name: {"en":"Spain pick-and-roll","is":"Spain skýling"},
    playType: "pnrHandler",
    description: {"en":"A ball-screen for the handler, then as the screener rolls to the rim a perimeter player sets a back-screen on the roller's defender; the back-screener usually pops out for three (a.k.a. stack pick-and-roll).","is":"Skýling fyrir leikstjóra og um leið og skyljarinn rúllar að körfu setur ytri leikmaður bak-skýlingu á varnarmann rúllarans; bak-skyljarinn poppar oftast út í þristi (líka kallað stack skýling)."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":68,"ball":true,"label":"1"},{"id":"o2","team":"off","x":44,"y":54,"label":"5"},{"id":"o3","team":"off","x":40,"y":40,"label":"4"},{"id":"o4","team":"off","x":8,"y":16,"label":"2"},{"id":"o5","team":"off","x":92,"y":16,"label":"3"}],"arrows":[{"from":[44,54],"to":[48,64],"kind":"screen"},{"from":[50,68],"to":[60,48],"kind":"dribble"},{"from":[40,40],"to":[45,50],"kind":"screen"},{"from":[44,54],"to":[50,28],"kind":"move"}]},
  },
  {
    key: "hammer",
    name: {"en":"Hammer","is":"Hammer"},
    playType: "catchShoot",
    description: {"en":"A strong-side baseline drive draws the help while, away from the ball, a player sets a back/baseline screen (the 'hammer') to free a shooter cutting to the weak-side corner for a kick-out three.","is":"Grunnlínu-sókn öðrum megin dregur hjálpina á sig meðan, fjarri boltanum, leikmaður setur bak-/grunnlínu-skýlingu ('hammer') til að losa skyttu sem sker í fjær-hornið fyrir þrist úr sendingu til baka."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":78,"y":50,"ball":true,"label":"1"},{"id":"o2","team":"off","x":35,"y":20,"label":"5"},{"id":"o3","team":"off","x":22,"y":34,"label":"2"},{"id":"o4","team":"off","x":50,"y":72,"label":"3"},{"id":"o5","team":"off","x":92,"y":18,"label":"4"}],"arrows":[{"from":[78,50],"to":[66,20],"kind":"dribble"},{"from":[35,20],"to":[28,18],"kind":"screen"},{"from":[22,34],"to":[8,16],"kind":"move"},{"from":[66,20],"to":[9,16],"kind":"pass"}]},
  },
  {
    key: "chicago",
    name: {"en":"Chicago (pin-down into hand-off)","is":"Chicago (pindown í afhendingu)"},
    playType: "pnrHandler",
    description: {"en":"A pin-down screen immediately into a dribble hand-off (a.k.a. Zoom): the screener's man and the hand-off defender both have to fight through screens, freeing the receiver attacking off the hand-off.","is":"Pindown-skýling beint í rakningu-afhendingu (líka kallað Zoom): bæði varnarmaður skyljarans og afhendingar-varnarmaðurinn þurfa að berjast í gegnum skýlingar, sem losar þann sem tekur við og sækir af afhendingunni."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":55,"y":60,"ball":true,"label":"5"},{"id":"o2","team":"off","x":25,"y":39,"label":"4"},{"id":"o3","team":"off","x":20,"y":22,"label":"2"},{"id":"o4","team":"off","x":82,"y":46,"label":"3"},{"id":"o5","team":"off","x":90,"y":16,"label":"1"}],"arrows":[{"from":[25,39],"to":[22,46],"kind":"screen"},{"from":[20,22],"to":[23,47],"kind":"move"},{"from":[55,60],"to":[36,50],"kind":"dribble"}]},
  },
  {
    key: "elevator",
    name: {"en":"Elevator doors","is":"Lyftuhurðir"},
    playType: "catchShoot",
    description: {"en":"A shooter cuts up through a gap between two screeners standing side-by-side; the screeners step together to 'close the doors' behind him, then he catches at the top or elbow for a jumper.","is":"Skytta sker upp í gegnum bil milli tveggja skyljara sem standa hlið við hlið; skyljararnir stíga saman og 'loka hurðunum' á eftir henni, svo tekur hún við efst eða á olnboga í stökkskoti."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":80,"y":54,"ball":true,"label":"1"},{"id":"o2","team":"off","x":44,"y":50,"label":"4"},{"id":"o3","team":"off","x":56,"y":50,"label":"5"},{"id":"o4","team":"off","x":50,"y":16,"label":"2"},{"id":"o5","team":"off","x":12,"y":34,"label":"3"}],"arrows":[{"from":[50,16],"to":[50,58],"kind":"move"},{"from":[44,50],"to":[48,50],"kind":"screen"},{"from":[56,50],"to":[52,50],"kind":"screen"},{"from":[80,54],"to":[52,60],"kind":"pass"}]},
  },
  {
    key: "flex",
    name: {"en":"Flex","is":"Flex"},
    playType: "cut",
    description: {"en":"A continuity: a weak-side player makes a baseline 'flex cut' off a post screen to the ball-side block while a down-screen ('screen-the-screener') frees a player popping to the top — then it repeats to the other side.","is":"Samfella: leikmaður á veiku hliðinni gerir grunnlínu-'flex-skurð' af póst-skýlingu að blokk boltamegin meðan niður-skýling ('skýla skyljaranum') losar leikmann sem poppar á toppinn — svo endurtekst hinum megin."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":30,"y":64,"ball":true,"label":"1"},{"id":"o2","team":"off","x":60,"y":22,"label":"5"},{"id":"o3","team":"off","x":90,"y":28,"label":"2"},{"id":"o4","team":"off","x":42,"y":48,"label":"4"},{"id":"o5","team":"off","x":10,"y":28,"label":"3"}],"arrows":[{"from":[60,22],"to":[66,20],"kind":"screen"},{"from":[90,28],"to":[58,14],"kind":"move"},{"from":[42,48],"to":[40,54],"kind":"screen"}]},
  },
  {
    key: "iverson",
    name: {"en":"Iverson cut","is":"Iverson skurður"},
    playType: "cut",
    description: {"en":"A scorer cuts from one wing across the top, over the two elbows and off staggered screens there (an 'Iverson cut'), to catch on the opposite wing on the move.","is":"Skorari sker frá einum væng yfir toppinn, yfir olnbogana tvo og af stöðluðum skýlingum þar ('Iverson skurður'), til að taka við á hinum vængnum á hreyfingu."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":72,"ball":true,"label":"1"},{"id":"o2","team":"off","x":40,"y":48,"label":"4"},{"id":"o3","team":"off","x":60,"y":48,"label":"5"},{"id":"o4","team":"off","x":85,"y":49,"label":"2"},{"id":"o5","team":"off","x":10,"y":20,"label":"3"}],"arrows":[{"from":[85,49],"to":[15,49],"kind":"move"},{"from":[60,48],"to":[62,48],"kind":"screen"},{"from":[40,48],"to":[42,48],"kind":"screen"}]},
  },
  {
    key: "pistol_21",
    name: {"en":"Pistol / 21","is":"Pistol / 21"},
    playType: "pnrHandler",
    description: {"en":"Early-offense side action toward the sideline: the guard dribbles at the wing for a hand-off ('21'), then the trailing big follows into a ball-screen for the hand-off receiver — a quick two-man game before the defense is set.","is":"Snemm-sókn út að hliðarlínu: leikstjóri rekur að vængnum í afhendingu ('21') og svo fylgir stóri sem trailar inn í skýlingu fyrir þann sem tók við — hraður tveggja-manna leikur áður en vörnin er tilbúin."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":62,"y":66,"ball":true,"label":"1"},{"id":"o2","team":"off","x":84,"y":48,"label":"2"},{"id":"o3","team":"off","x":92,"y":14,"label":"3"},{"id":"o4","team":"off","x":50,"y":54,"label":"5"},{"id":"o5","team":"off","x":10,"y":39,"label":"4"}],"arrows":[{"from":[62,66],"to":[78,50],"kind":"dribble"},{"from":[84,48],"to":[72,52],"kind":"move"},{"from":[50,54],"to":[74,46],"kind":"screen"}]},
  },
  {
    key: "horns_twist",
    name: {"en":"Horns twist","is":"Horns twist"},
    playType: "pnrHandler",
    description: {"en":"From a horns set the handler takes the first high ball-screen, then immediately 'twists' back off a second screen from the other big going the opposite way while the first screener rolls — it counters a defense that commits early to the first screen.","is":"Úr horns-uppstillingu tekur leikstjóri fyrstu háu skýlinguna og 'twistar' svo strax til baka af annarri skýlingu frá hinum stóra í gagnstæða átt meðan fyrsti skyljarinn rúllar — svar við vörn sem skuldbindur sig snemma á fyrstu skýlinguna."},
    diagram: {"court":"half","players":[{"id":"o1","team":"off","x":50,"y":68,"ball":true,"label":"1"},{"id":"o2","team":"off","x":38,"y":44,"label":"5"},{"id":"o3","team":"off","x":62,"y":44,"label":"4"},{"id":"o4","team":"off","x":8,"y":16,"label":"2"},{"id":"o5","team":"off","x":92,"y":16,"label":"3"}],"arrows":[{"from":[38,44],"to":[45,61],"kind":"screen"},{"from":[62,44],"to":[55,61],"kind":"screen"},{"from":[50,68],"to":[66,46],"kind":"dribble"},{"from":[38,44],"to":[46,28],"kind":"move"}]},
  },
];

export const COMMON_SET_KEYS = new Set(COMMON_SETS.map((s) => s.key));
export const commonSetByKey = (key: string): CommonSet | undefined => COMMON_SETS.find((s) => s.key === key);
