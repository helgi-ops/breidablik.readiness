/**
 * Blog / fræðslugreinar fyrir MicroPulse heimasíðu.
 *
 * Hvert grein hefur IS og EN útgáfur. Efnið er geymt sem
 * Markdown-lík strengir sem birtast á /blog/[slug].
 */

export interface BlogArticle {
  slug: string;
  date: string;
  readMin: number;
  category: "meidslafovarnir" | "alagsstjornun" | "thjalfunarfraedi";
  author: string;
  titleIS: string;
  titleEN: string;
  summaryIS: string;
  summaryEN: string;
  audience: "players" | "coaches" | "both";
  sectionsIS: { heading: string; body: string }[];
  sectionsEN: { heading: string; body: string }[];
}

export const CATEGORY_LABELS: Record<BlogArticle["category"], { is: string; en: string; color: string }> = {
  meidslafovarnir: { is: "Meiðslaforvarnir", en: "Injury Prevention", color: "emerald" },
  alagsstjornun: { is: "Álagsstjórnun", en: "Load Management", color: "blue" },
  thjalfunarfraedi: { is: "Þjálfunarfræði", en: "Training Science", color: "purple" },
};

export const AUDIENCE_LABELS: Record<BlogArticle["audience"], { is: string; en: string }> = {
  players: { is: "Leikmenn", en: "Players" },
  coaches: { is: "Þjálfarar", en: "Coaches" },
  both: { is: "Leikmenn & þjálfarar", en: "Players & Coaches" },
};

export const ARTICLES: BlogArticle[] = [
  {
    slug: "rpe-og-srpe-innra-alag",
    date: "2026-08-05",
    readMin: 11,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "both",
    titleIS: "Áreynsluskyn (RPE) og session-RPE: vísindin á bak við einfaldasta álagsmælinn",
    titleEN: "RPE and session-RPE: the science behind the simplest load metric",
    summaryIS: `Ítarleg yfirferð fyrir þjálfara og íþróttafólk um Rate of Perceived Exertion (RPE) og session-RPE (sRPE) — söguna, réttmætið, formúlurnar og hvernig á að nota þetta rétt.`,
    summaryEN: `A detailed review for coaches and athletes on Rate of Perceived Exertion (RPE) and session-RPE (sRPE) — the history, the validity, the formulas, and how to use it properly.`,
    sectionsIS: [
      {
        heading: `Inngangur`,
        body: `Fátt í íþróttavísindum er jafn ódýrt, einfalt og vanmetið og ein spurning eftir æfingu: „Hversu erfið var þessi æfing, á skalanum 0–10?" Út frá því einu — margfölduðu með lengd æfingarinnar — er hægt að reikna innra þjálfunarálag hvers leikmanns, fylgjast með uppsöfnun, greina einhæfni í álagi og meta áhættu á ofþjálfun og meiðslum. Þessi aðferð heitir session-RPE og hún er í dag ein mest rannsakaða og mest notaða álagsmæling í íþróttum heims (Haddad o.fl., 2017).

Þessi grein fer yfir hvaðan aðferðin kemur, hversu vel hún stenst vísindalega skoðun, hvernig hún tengist „innra vs ytra álagi", hvernig monotony og strain eru reiknuð, og — það sem mestu skiptir — hvernig á að safna og nota RPE þannig að tölurnar þýði raunverulega eitthvað.`,
      },
      {
        heading: `1. Rótin: Borg og áreynsluskynið`,
        body: `Hugtakið áreynsluskyn (rating of perceived exertion, RPE) á rætur í verkum sænska sálfræðingsins Gunnars Borg. Grundvallargrein hans, Psychophysical bases of perceived exertion (Borg, 1982), setti fram þá hugmynd að hægt sé að mæla huglæga skynjun á áreynslu á áreiðanlegan, magnbundinn hátt — að líkaminn sé í raun einn samþættur skynjari sem tekur inn merki frá vöðvum, hjarta, lungum og miðtaugakerfi og skilar einni heildartölu.

Borg þróaði tvo kvarða:

Borg 6–20 kvarðinn — hannaður þannig að talan margfölduð með 10 gæfi grófa spá um hjartsláttartíðni (RPE 13 ≈ 130 slög/mín hjá ungum einstaklingi). Talnabilið 6–20 endurspeglar hvíldar- til hámarkspúls.

Category-Ratio 10 kvarðinn (CR10) — 0 til 10 (stundum með ankeri yfir 10), sem hegðar sér eins og hlutfallskvarði og hentar betur til að lýsa vaxandi óþægindum og mæði. Það er CR10 (eða modified CR-10) sem session-RPE aðferðin notar.

Réttmæti Borg-kvarðans fyrir bæði þolþjálfun og styrktarþjálfun hefur ítrekað mælst hátt, þótt síðari greiningar bendi á að nákvæmnin sé háð aðstæðum og hvernig kvarðinn er kynntur (Borg, 1982; Haddad o.fl., 2017).`,
      },
      {
        heading: `2. Frá RPE til session-RPE: aðferð Fosters`,
        body: `Stökkið frá augnabliks-RPE yfir í nothæfan álagsmæli fyrir heilar æfingar kom frá Carl Foster og samstarfsfólki. Í grein sinni A new approach to monitoring exercise training (Foster o.fl., 2001) lögðu þau til einfalda margföldun:

session-RPE álag (AU) = RPE (CR10, 0–10) × lengd æfingar (mínútur)

Talan er í arbitrary units (AU, handahófseiningar). Ein 60 mínútna æfing sem leikmaður metur 7 gefur 420 AU; létt 30 mínútna endurheimt metin 3 gefur 90 AU. Þetta er snjallt vegna þess að álag er alltaf bæði ákefð og magn — stutt hörð æfing og löng létt æfing geta gefið sama álag, og aðferðin fangar hvort tveggja í einni tölu.

Lykilatriði: RPE er tekið fyrir æfinguna í heild, ekki á einstaka augnabliki, og helst nokkru eftir að henni lýkur (sjá kafla 6). Foster o.fl. (2001) sýndu að session-RPE fylgdi hlutlægum hjartsláttar-mælingum vel bæði í þrek- og millibilsæfingum og í körfuboltaæfingum, þótt algildu tölurnar væru ekki þær sömu.`,
      },
      {
        heading: `3. Innra vs ytra álag — hvað er RPE eiginlega að mæla?`,
        body: `Til að skilja hvað session-RPE mælir þarf greinarmuninn á ytra álagi og innra álagi (Impellizzeri, Marcora & Coutts, 2019):

Ytra álag (external load) er vinnan sem leikmaðurinn vinnur — vegalengd, háhraðahlaup, fjöldi spretta, lyftur og kíló, hröðun/hemlun. Þetta mæla GPS, hröðunarmælar og æfingaskrár.

Innra álag (internal load) er líffræðilega og sálræna svörunin við þeirri vinnu — hjartsláttur, laktat, áreynsluskyn, þreyta. Sama ytra álag getur valdið gjörólíku innra álagi hjá tveimur leikmönnum, eða hjá sama leikmanni á ferskum degi vs þreyttum.

session-RPE er mæling á innra álagi. Þar liggur styrkur hennar: hún fangar hvernig líkaminn raunverulega upplifði æfinguna, ekki bara hvað stóð á blaðinu. Impellizzeri o.fl. (2019) árétta að besta myndin fæst þegar innra og ytra álag eru lesin saman — ytra álagið segir hvað var gert, innra álagið hvernig leikmaðurinn réð við það.`,
      },
      {
        heading: `4. Réttmæti og áreiðanleiki`,
        body: `Aðferðin er ekki bara þægileg — hún stenst vísindalega skoðun óvenju vel fyrir svo einfalt tæki.

Í fótbolta. Impellizzeri o.fl. (2004), í grein sem varð tímamótaverk, söfnuðu innra álagi úr 479 æfingum og báru session-RPE saman við þrjár hjartsláttar-byggðar álagsaðferðir. Allar einstaklingsbundnar fylgnitölur voru marktækar, á bilinu r = 0,50 til 0,85 (P < 0,01). Niðurstaðan: session-RPE er góður mælikvarði á heildar innra álag fótboltaæfinga — og krefst hvorki búnaðar né kostnaðar.

Yfirlitið. Í kerfisbundinni yfirferð sinni fóru Haddad o.fl. (2017) yfir bókmenntirnar frá 2001–2016. Þau fundu að 950 rannsóknir höfðu vitnað í upphaflegu Foster-greinina og að 36 rannsóknir höfðu prófað réttmæti og áreiðanleika aðferðarinnar með modified CR-10 kvarðanum. Niðurstaðan staðfesti gott réttmæti, áreiðanleika og innra samræmi session-RPE í fjölda íþrótta og hjá bæði körlum og konum.

Í styrktarþjálfun virkar aðferðin líka (Day o.fl., 2004), með þeim fyrirvara að þar endurspeglar RPE fremur staðbundna vöðvaáreynslu og óþægindi en miðlægt hjarta-/öndunarálag — svo túlka þarf tölur úr lyftingum í sínu samhengi.`,
      },
      {
        heading: `5. Monotony og strain: þegar álagið sjálft verður áhætta`,
        body: `Ári fyrir session-RPE greinina hafði Foster (1998) þegar bent á að heildarmagn álags eitt og sér segir ekki alla söguna — dreifing álagsins yfir vikuna skiptir líka máli. Út frá daglegu session-RPE álagi skilgreindi hann tvær stærðir:

Monotony (einhæfni) = meðaltal daglegs álags ÷ staðalfrávik daglegs álags (yfir vikuna). Há monotony þýðir að allir dagar eru svipaðir — engir raunverulegir hvíldardagar, enginn munur á hörðum og léttum.

Strain (álagsstreita) = vikuálag (samtala) × monotony. Þetta refsar fyrir sambland af miklu álagi og lítilli fjölbreytni.

Foster tengdi háa monotony og strain við aukna tíðni veikinda, meiðsla og einkenna ofþjálfunar. Skilaboðin eru einföld og öflug: það er ekki bara hversu mikið þú þjálfar, heldur hvernig þú dreifir því — vika með háu en einhæfu álagi er áhættusamari en vika með sama heildarálagi en skýrum hörðum/léttum sveiflum.

Nýrri rannsóknir styðja dose-response tengsl þessara markara við líkamsástand: hjá atvinnufótboltamönnum tengdust breytingar í vikuálagi, monotony og strain marktækt við breytingar á hámarks-súrefnisupptöku, hámarks loftháðum hraða (MAS) og styrk yfir 10 vikna tímabil (Clemente o.fl. / Nikolaidis o.fl., 2019).`,
      },
      {
        heading: `6. Hvernig á að safna session-RPE rétt`,
        body: `Aðferðin er aðeins jafn góð og gögnin sem fara inn. Hagnýtar reglur úr bókmenntunum:

1. Notaðu CR10 kvarðann (0–10) með stöðluðum orðum við tölurnar (0 = hvíld, 10 = hámarks áreynsla), og notaðu sama kvarðann alltaf.

2. Spyrðu ~30 mínútum eftir æfingu. Rannsóknir sýna að RPE tekið strax (5–10 mín) getur litast of mikið af síðasta — sérstaklega hörðu eða léttu — hluta æfingarinnar; um 30 mínútum síðar endurspeglar talan æfinguna í heild betur (Uchida o.fl.; Singh o.fl.). Í sumum greinum (t.d. hnefaleikum) dugar 10 mín, en 30 mín er örugga viðmiðið.

3. Safnaðu einslega. Leikmenn eiga ekki að heyra svar hvers annars — annars hópast tölurnar saman (félagsleg áhrif).

4. Margfaldaðu með raunlengd virkrar æfingar í mínútum, ekki heildartíma með hléum ef þau eru löng.

5. Vertu samkvæm(ur). Gildið liggur í þróuninni yfir vikur og mánuði, svo aðferðin verður að vera eins í hvert sinn.`,
      },
      {
        heading: `7. Þættir sem hafa áhrif á RPE`,
        body: `RPE er huglægt, og það er bæði styrkur þess og veikleiki. Haddad o.fl. (2017) draga saman þætti sem geta breytt tölunni án þess að ytra álag breytist:

Æfingagerð — millibils- og styrktarþjálfun vs samfellt þol geta gefið ólík RPE fyrir sama innra álag.

Líðan, svefn og streita — þreyttur, illa sofinn eða stressaður leikmaður metur sömu æfingu erfiðari. (Þetta er ekki „skekkja" — það er raunveruleg upplýsing um innra álag.)

Umhverfi — hiti, raki og hæð yfir sjávarmáli hækka RPE.

Reynsla og persónuleiki — vanari íþróttamenn og ólíkar persónugerðir kvarða áreynslu misjafnt.

Tímasetning og orðalag spurningarinnar — sbr. kafla 6.

Þetta undirstrikar að RPE á að lesa á móti eigin normi hvers leikmanns, ekki sem fastan þröskuld milli manna.`,
      },
      {
        heading: `8. Notkun í reynd`,
        body: `Vikuálag og þróun. Uppsafnað session-RPE álag per viku sýnir hvort leikmaður er að byggja upp, halda í horfinu eða safna þreytu.

Acute:Chronic Workload Ratio (ACWR). session-RPE-byggt álag er algeng undirstaða ACWR — hlutfall bráða- (t.d. 7 daga) á móti krónísku (t.d. 28 daga) álagi — sem hefur verið tengt meiðslaáhættu þegar það rís of hratt (Gabbett, 2016; Hulin o.fl., 2016). Nota ber það sem viðmið, ekki spádóm.

Huglægt vs hlutlægt. Yfirlit Saw o.fl. (2016) á 56 rannsóknum komst að því að huglæg sjálfsmöt (þ.m.t. RPE og líðan) endurspegluðu bráða- og langtímaálag með meiri næmni og samræmi en mörg hlutlæg mælitæki — og að þau bera sjálfstæðar upplýsingar. Session-RPE er því ekki „annars flokks" gögn þegar GPS vantar; það er sinn eigin gildi mælikvarði.`,
      },
      {
        heading: `9. Takmarkanir og varúð`,
        body: `RPE er ein tala og getur ekki aðgreint hvaðan þreytan kemur (miðlæg vs útlæg, efnaskipta vs vélræn). Best er að lesa það við hlið hlutlægs álags og líðan.

Í styrktarþjálfun endurspeglar það staðbundna áreynslu fremur en hjarta-/öndunarálag.

Það er háð heiðarleika og skilningi leikmannsins — kvarðinn þarf að vera kenndur og festur í rútínu.

Menningarlegur/tungumálalegur munur á orðum kvarðans getur haft áhrif; nota skal staðlaða þýðingu.`,
      },
      {
        heading: `10. Samantekt`,
        body: `session-RPE er sjaldgæft dæmi um mælitæki sem er í senn ódýrt, einfalt og vísindalega vel staðfest. Út frá Borg-kvarðanum (Borg, 1982) og margföldun Fosters (Foster o.fl., 2001) fæst mæling á innra álagi sem fylgir hjartsláttar-byggðum aðferðum vel (Impellizzeri o.fl., 2004), stenst kerfisbundna skoðun (Haddad o.fl., 2017), og gefur — í gegnum monotony og strain (Foster, 1998) — snemmviðvörun um einhæft, áhættusamt álag. Lykillinn að því að tölurnar þýði eitthvað er agi: réttur kvarði, ~30 mín eftir æfingu, einslega, samkvæmt, og alltaf lesið á móti eigin normi leikmannsins.

Hagnýt ráð í hnotskurn: notaðu CR10 × mínútur; spyrðu 30 mín eftir æfingu og einslega; fylgstu með vikuálagi, monotony (haltu henni lágri með skýrum hörðum/léttum dögum) og strain; og lestu RPE sem persónulegt merki — ekki fastan þröskuld.`,
      },
      {
        heading: `Heimildir`,
        body: `Borg, G. (1982). Psychophysical bases of perceived exertion. Medicine & Science in Sports & Exercise, 14(5), 377–381. https://pubmed.ncbi.nlm.nih.gov/7154893/

Foster, C. (1998). Monitoring training in athletes with reference to overtraining syndrome. Medicine & Science in Sports & Exercise, 30(7), 1164–1168.

Foster, C., Florhaug, J. A., Franklin, J., o.fl. (2001). A new approach to monitoring exercise training. Journal of Strength & Conditioning Research, 15(1), 109–115. https://pubmed.ncbi.nlm.nih.gov/11708692/

Impellizzeri, F. M., Rampinini, E., Coutts, A. J., Sassi, A., & Marcora, S. M. (2004). Use of RPE-based training load in soccer. Medicine & Science in Sports & Exercise, 36(6), 1042–1047.

Impellizzeri, F. M., Marcora, S. M., & Coutts, A. J. (2019). Internal and External Training Load: 15 Years On. International Journal of Sports Physiology and Performance, 14(2), 270–273. https://journals.humankinetics.com/view/journals/ijspp/14/2/article-p270.xml

Haddad, M., Stylianides, G., Djaoui, L., Dellal, A., & Chamari, K. (2017). Session-RPE Method for Training Load Monitoring: Validity, Ecological Usefulness, and Influencing Factors. Frontiers in Neuroscience, 11, 612. https://pmc.ncbi.nlm.nih.gov/articles/PMC5673663/

Day, M. L., McGuigan, M. R., Brice, G., & Foster, C. (2004). Monitoring exercise intensity during resistance training using the session RPE scale. Journal of Strength & Conditioning Research, 18(2), 353–358. https://pubmed.ncbi.nlm.nih.gov/15142026/

Saw, A. E., Main, L. C., & Gastin, P. B. (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures — a systematic review. British Journal of Sports Medicine, 50(5), 281–291.

Gabbett, T. J. (2016). The training–injury prevention paradox: should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280.

Hulin, B. T., Gabbett, T. J., o.fl. (2016). The acute:chronic workload ratio predicts injury. British Journal of Sports Medicine, 50(4), 231–236.

Halson, S. L. (2014). Monitoring training load to understand fatigue in athletes. Sports Medicine, 44(Suppl 2), S139–S147.

Clemente, F. M., Nikolaidis, P. T., Rosemann, T., & Knechtle, B. (2019). Variations of training load, monotony, and strain and dose–response relationships with maximal aerobic speed, maximal oxygen uptake, and isokinetic strength in professional soccer players. PLoS ONE, 14(2), e0212819.

Athugasemd: Heimildir eru settar fram í APA stíl með tenglum í frumheimildir.`,
      },
    ],
    sectionsEN: [
      {
        heading: `Introduction`,
        body: `Few things in sport science are as cheap, as simple, and as underrated as one question after training: "How hard was that session, on a scale of 0–10?" From that single answer — multiplied by the session's duration — you can quantify each player's internal training load, track its accumulation, detect monotony in the load, and gauge the risk of overtraining and injury. This method is called session-RPE, and it is today one of the most researched and most widely used load metrics in world sport (Haddad et al., 2017).

This article covers where the method comes from, how well it holds up to scientific scrutiny, how it relates to the "internal vs external load" framework, how monotony and strain are calculated, and — most importantly — how to collect and use RPE so that the numbers actually mean something.`,
      },
      {
        heading: `1. The root: Borg and perceived exertion`,
        body: `The concept of perceived exertion (rating of perceived exertion, RPE) originates in the work of the Swedish psychologist Gunnar Borg. His foundational paper, Psychophysical bases of perceived exertion (Borg, 1982), advanced the idea that the subjective sense of effort can be measured in a reliable, quantitative way — that the body is, in effect, a single integrated sensor taking in signals from the muscles, heart, lungs and central nervous system and returning one overall number.

Borg developed two scales:

The Borg 6–20 scale — designed so that the number multiplied by 10 gives a rough estimate of heart rate (RPE 13 ≈ 130 bpm in a young person). The 6–20 range mirrors resting-to-maximal heart rate.

The Category-Ratio 10 scale (CR10) — 0 to 10 (sometimes with an anchor above 10), which behaves like a ratio scale and is better suited to describing rising discomfort and breathlessness. It is the CR10 (or modified CR-10) that the session-RPE method uses.

The validity of the Borg scale for both endurance and resistance exercise has repeatedly been shown to be high, though later analyses note that the accuracy depends on the conditions and on how the scale is presented (Borg, 1982; Haddad et al., 2017).`,
      },
      {
        heading: `2. From RPE to session-RPE: Foster's method`,
        body: `The leap from moment-to-moment RPE to a usable load metric for whole sessions came from Carl Foster and colleagues. In their paper A new approach to monitoring exercise training (Foster et al., 2001), they proposed a simple multiplication:

session-RPE load (AU) = RPE (CR10, 0–10) × session duration (minutes)

The number is expressed in arbitrary units (AU). A 60-minute session a player rates 7 gives 420 AU; a light 30-minute recovery rated 3 gives 90 AU. This is elegant because load is always both intensity and volume — a short hard session and a long easy one can produce the same load, and the method captures both in a single figure.

Key point: RPE is taken for the session as a whole, not at any single instant, and ideally some time after it finishes (see section 6). Foster et al. (2001) showed that session-RPE tracked objective heart-rate measures well in both steady-state/interval exercise and basketball practice, even though the absolute numbers were not identical.`,
      },
      {
        heading: `3. Internal vs external load — what is RPE actually measuring?`,
        body: `To understand what session-RPE measures, you need the distinction between external load and internal load (Impellizzeri, Marcora & Coutts, 2019):

External load is the work the athlete performs — distance, high-speed running, number of sprints, lifts and kilos, accelerations/decelerations. This is measured by GPS, accelerometers and training logs.

Internal load is the biological and psychological response to that work — heart rate, lactate, perceived exertion, fatigue. The same external load can produce very different internal loads in two players, or in the same player on a fresh day versus a tired one.

session-RPE is a measure of internal load. That is its strength: it captures how the body actually experienced the session, not just what was on paper. Impellizzeri et al. (2019) stress that the best picture comes from reading internal and external load together — the external load tells you what was done, the internal load tells you how the player coped with it.`,
      },
      {
        heading: `4. Validity and reliability`,
        body: `The method is not just convenient — it stands up to scientific scrutiny unusually well for such a simple tool.

In soccer. Impellizzeri et al. (2004), in what became a landmark study, collected internal load from 479 training sessions and compared session-RPE against three heart-rate-based load methods. Every individual correlation was statistically significant, ranging from r = 0.50 to r = 0.85 (P < 0.01). The conclusion: session-RPE is a good indicator of the global internal load of soccer training — and it requires neither equipment nor cost.

The review. In their systematic review, Haddad et al. (2017) surveyed the literature from 2001–2016. They found that 950 studies had cited the original Foster paper and that 36 studies had tested the validity and reliability of the method using the modified CR-10 scale. The verdict confirmed good validity, reliability and internal consistency of session-RPE across many sports and in both men and women.

In resistance training the method also works (Day et al., 2004), with the caveat that here RPE reflects local muscular effort and discomfort more than central cardiorespiratory load — so numbers from the weight room must be interpreted in their own context.`,
      },
      {
        heading: `5. Monotony and strain: when the load itself becomes the risk`,
        body: `A year before the session-RPE paper, Foster (1998) had already noted that the total volume of load alone does not tell the whole story — how the load is distributed across the week matters too. From daily session-RPE load he defined two quantities:

Monotony = mean daily load ÷ standard deviation of daily load (across the week). High monotony means every day is similar — no real rest days, no contrast between hard and easy.

Strain = weekly load (the sum) × monotony. This penalises the combination of high load and low variety.

Foster linked high monotony and strain to increased rates of illness, injury and overtraining symptoms. The message is simple and powerful: it is not just how much you train, but how you distribute it — a week of high but monotonous load is riskier than a week of the same total load with clear hard/easy swings.

More recent work supports dose–response relationships between these markers and fitness: in professional soccer players, changes in weekly load, monotony and strain were significantly associated with changes in maximal oxygen uptake, maximal aerobic speed (MAS) and strength over a 10-week period (Clemente et al. / Nikolaidis et al., 2019).`,
      },
      {
        heading: `6. How to collect session-RPE properly`,
        body: `The method is only as good as the data going into it. Practical rules from the literature:

1. Use the CR10 scale (0–10) with standardised verbal anchors (0 = rest, 10 = maximal effort), and always use the same scale.

2. Ask ~30 minutes after the session. Studies show that RPE taken immediately (5–10 min) can be coloured too heavily by the last — especially a hard or easy — portion of the session; about 30 minutes later the number better reflects the session as a whole (Uchida et al.; Singh et al.). In some contexts (e.g. boxing) 10 min suffices, but 30 min is the safe standard.

3. Collect it privately. Players should not hear each other's answers — otherwise the numbers cluster together (social influence).

4. Multiply by actual duration of active training in minutes, not total elapsed time including long breaks.

5. Be consistent. The value lies in the trend over weeks and months, so the method must be identical every time.`,
      },
      {
        heading: `7. Factors that influence RPE`,
        body: `RPE is subjective, and that is both its strength and its weakness. Haddad et al. (2017) summarise factors that can change the number without any change in external load:

Exercise mode — interval and resistance training vs continuous endurance can give different RPE for the same internal load.

Wellbeing, sleep and stress — a tired, poorly slept or stressed player rates the same session harder. (This is not "error" — it is real information about internal load.)

Environment — heat, humidity and altitude raise RPE.

Experience and personality — more experienced athletes and different personality types scale effort differently.

Timing and wording of the question — see section 6.

This underlines that RPE should be read against each player's own norm, not as a fixed between-person threshold.`,
      },
      {
        heading: `8. Using it in practice`,
        body: `Weekly load and trend. Accumulated session-RPE load per week shows whether a player is building, maintaining or accumulating fatigue.

Acute:Chronic Workload Ratio (ACWR). session-RPE-based load is a common basis for the ACWR — the ratio of acute (e.g. 7-day) to chronic (e.g. 28-day) load — which has been linked to injury risk when it rises too fast (Gabbett, 2016; Hulin et al., 2016). It should be used as a reference, not a prediction.

Subjective vs objective. The review by Saw et al. (2016) of 56 studies found that subjective self-reports (including RPE and wellness) reflected acute and chronic load with greater sensitivity and consistency than many objective tools — and that they carry independent information. session-RPE is therefore not "second-class" data when GPS is missing; it is a valid metric in its own right.`,
      },
      {
        heading: `9. Limitations and caution`,
        body: `RPE is a single number and cannot separate where the fatigue comes from (central vs peripheral, metabolic vs mechanical). It is best read alongside objective load and wellness.

In resistance training it reflects local effort more than cardiorespiratory load.

It depends on the athlete's honesty and understanding — the scale must be taught and embedded in the routine.

Cultural/linguistic differences in the scale's wording can matter; use a standardised translation.`,
      },
      {
        heading: `10. Summary`,
        body: `session-RPE is a rare example of a tool that is at once cheap, simple and scientifically well established. From the Borg scale (Borg, 1982) and Foster's multiplication (Foster et al., 2001) you get a measure of internal load that tracks heart-rate-based methods well (Impellizzeri et al., 2004), survives systematic review (Haddad et al., 2017), and — through monotony and strain (Foster, 1998) — gives early warning of monotonous, risky load. The key to making the numbers mean something is discipline: the right scale, ~30 min after the session, privately, consistently, and always read against the player's own norm.

Practical takeaways in brief: use CR10 × minutes; ask 30 min post-session and privately; track weekly load, monotony (keep it low with clear hard/easy days) and strain; and read RPE as a personal signal — not a fixed threshold.`,
      },
      {
        heading: `References`,
        body: `Borg, G. (1982). Psychophysical bases of perceived exertion. Medicine & Science in Sports & Exercise, 14(5), 377–381. https://pubmed.ncbi.nlm.nih.gov/7154893/

Foster, C. (1998). Monitoring training in athletes with reference to overtraining syndrome. Medicine & Science in Sports & Exercise, 30(7), 1164–1168.

Foster, C., Florhaug, J. A., Franklin, J., et al. (2001). A new approach to monitoring exercise training. Journal of Strength & Conditioning Research, 15(1), 109–115. https://pubmed.ncbi.nlm.nih.gov/11708692/

Impellizzeri, F. M., Rampinini, E., Coutts, A. J., Sassi, A., & Marcora, S. M. (2004). Use of RPE-based training load in soccer. Medicine & Science in Sports & Exercise, 36(6), 1042–1047.

Impellizzeri, F. M., Marcora, S. M., & Coutts, A. J. (2019). Internal and External Training Load: 15 Years On. International Journal of Sports Physiology and Performance, 14(2), 270–273. https://journals.humankinetics.com/view/journals/ijspp/14/2/article-p270.xml

Haddad, M., Stylianides, G., Djaoui, L., Dellal, A., & Chamari, K. (2017). Session-RPE Method for Training Load Monitoring: Validity, Ecological Usefulness, and Influencing Factors. Frontiers in Neuroscience, 11, 612. https://pmc.ncbi.nlm.nih.gov/articles/PMC5673663/

Day, M. L., McGuigan, M. R., Brice, G., & Foster, C. (2004). Monitoring exercise intensity during resistance training using the session RPE scale. Journal of Strength & Conditioning Research, 18(2), 353–358. https://pubmed.ncbi.nlm.nih.gov/15142026/

Saw, A. E., Main, L. C., & Gastin, P. B. (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures — a systematic review. British Journal of Sports Medicine, 50(5), 281–291.

Gabbett, T. J. (2016). The training–injury prevention paradox: should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280.

Hulin, B. T., Gabbett, T. J., et al. (2016). The acute:chronic workload ratio predicts injury. British Journal of Sports Medicine, 50(4), 231–236.

Halson, S. L. (2014). Monitoring training load to understand fatigue in athletes. Sports Medicine, 44(Suppl 2), S139–S147.

Clemente, F. M., Nikolaidis, P. T., Rosemann, T., & Knechtle, B. (2019). Variations of training load, monotony, and strain and dose–response relationships with maximal aerobic speed, maximal oxygen uptake, and isokinetic strength in professional soccer players. PLoS ONE, 14(2), e0212819.

Note: References are formatted in APA style with links to the primary sources.`,
      },
    ],
  },
  {
    slug: "hvernig-micropulse-nemur-taugavodvathreytu",
    date: "2026-08-05",
    readMin: 9,
    category: "thjalfunarfraedi",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "Hvernig MicroPulse nemur taugavöðvaþreytu: að staðsetja þreytuna, ekki bara flagga henni",
    titleEN: "How MicroPulse Detects Neuromuscular Fatigue: Locating the Fatigue, Not Just Flagging It",
    summaryIS:
      "Stökk sem er niðri segir ekki hvar þreytan liggur. Svona staðsetur MicroPulse hana — skiptir taugavöðvaþreytu í tauga-, vefja- og kerfisþreytu út frá fasamælingum CMJ, líðanarmælingu og endurheimtarferli eftir leik — og hvers vegna það útskýrir alltaf, en tekur aldrei fram fyrir, dóminn.",
    summaryEN:
      "A jump that's down can't say where the fatigue is. This is how MicroPulse locates it — splitting neuromuscular fatigue into neural, tissue and systemic from the CMJ's phase metrics, the wellness check-in and the post-match recovery curve — and why it only ever explains, never overrides, the verdict.",
    sectionsIS: [
      {
        heading: `Stökk sem er niðri segir ekki af hverju`,
        body: `Vertical stökk með mótkreppu (countermovement jump, CMJ) — hefðbundna stökkið þar sem leikmaður dýfir sér og springur upp á kraftplötu — er eitt besta hlutlæga þreytutæki íþrótta. En eitt og sér hefur það blindan blett: það mælir heildarúttak. Lægra stökk segir að leikmaðurinn framleiddi minna, ekki hvort orsökin sé þreytt taugakerfi, skemmdur vöðvavefur eða heildar-dýfa í svefni og streitu. Lífeðlisfræðingar hafa bent á þetta í áratugi (Gandevia, 2001): sama krafttap getur átt sér mjög ólíkar rætur.

Þetta skiptir máli því lausnin er ólík fyrir hvert. Miðlæg (tauga) þreyta jafnar sig með hvíld og svefni á klukkustundum; útlæg (vefja) þreyta vegna eccentrískrar vöðvaskemmdar getur varað í daga og þarf álagsvernd, ekki bara blund. Þess vegna er gagnlega spurningin ekki „er stökkið hans niðri?" — heldur „stökkið hans er niðri, vegna hvers?" MicroPulse er byggt til að svara seinni spurningunni út frá gögnum sem það safnar nú þegar.`,
      },
      {
        heading: `Að staðsetja þreytuna: þrír ásar`,
        body: `MicroPulse skiptir taugavöðvaþreytu í þrjár merktar tegundir og les hverja úr ólíku merki sem það hefur nú þegar:

TAUGA (NEURAL) — sprengikrafts-eiginleikarnir sem taugakerfið knýr. Lækkun í hámarksafli stökksins, krafthraða (RFD — hversu hratt kraftur er byggður) eða sammiðja impúlsi bendir til minnkaðs miðlægs drifs. Snemmbúið RFD er sérstaklega tauga-drifið og fellur á undan stökkhæð (D'Emanuele, 2021).

VEFUR (TISSUE) — vöðva-/útlægu eiginleikarnir. Þegar tímasetning stökksins breytist — lengri eccentrískur (niður) fasi, lengri samdráttartími — á meðan hæðin hreyfist varla, er leikmaðurinn hljóðlega að breyta stökkstefnu sinni til að vernda auman vef. Þessir tíma- og eccentrísku mælikvarðar haldast afbrigðilegir lengst eftir vöðvaskemmd (Gathercole, 2015).

KERFI (SYSTEMIC) — heildarmyndin. Lélegur svefn, lítil orka, mikil streita og fjöl-daga lækkun í viðbúnaði úr daglegu líðanarmælingunni benda á heildarþreytu sem hvíld, ekki vefjavinna, leysir.

Daglega líðanarmælingin, CMJ og álagsgögnin kveikja hvert á sínum ási; lesin saman staðsetja þau þreytuna í stað þess að flagga henni einni.`,
      },
      {
        heading: `Aðeins hreyfing umfram eigin mæliskekkju telur`,
        body: `Kraftplata er nákvæm, en ekki hver sveifla er raunveruleg. Þreytu-næmu tímamælikvarðarnir eru líka þeir hávaðasömustu — krafthraði getur verið ~16% breytilegur milli tveggja prófa sama leikmanns, á móti ~5% fyrir stökkhæð (Gathercole, 2015). Birt hrá á móti lítilli persónulegri grunnlínu myndi sá hávaði kveikja falskt „lækkandi" flagg á venjulegum degi — klassíska of-næma-gula gildran.

Þess vegna verður hver CMJ-mælikvarði að fara umfram sína eigin mæliskekkju áður en hann flaggar: breytingin verður að vera stærri en það sem er stærra — þekktur breytileiki mælikvarðans eða breytileiki leikmannsins sjálfs — með borði. Hávaðasamur mælikvarði eins og RFD þarf mun stærri hreyfingu til að þýða eitthvað en rólegur eins og stökkhæð. Og hver samanburður er við eigin grunnlínu leikmannsins, ekki deildarmeðaltal — því þreytuþröskuldar eru einstaklingsbundnir, ekki sameiginlegir (Neyroud, 2016). MicroPulse ber líka saman meðaltal stökkva lotunnar, ekki eitt besta, sem grípur þreytu og ofurbætur áreiðanlegar en hámarks-átak (Edwards, 2018; Claudino, 2017).`,
      },
      {
        heading: `Að lesa það fyrr, og minna gróft`,
        body: `Tvær betrumbætur gera lesturinn fyrri og skarpari. Í fyrsta lagi snemmbúinn krafthraði — hversu hratt kraftur rís fyrstu 100–200 millisekúndurnar — fellur á undan stökkhæð og er knúinn af taugadrifi, sem gerir hann að fyrirvara-flaggi fyrir miðlæga þreytu (D'Emanuele, 2021). Hann er mældur sem gluggaður, kraft-normalíseraður halli (aldrei augnabliks-toppur, sem er of hávaðasamur).

Í öðru lagi er flugtíma-á-móti-samdráttartíma hlutfallið (FT:CT) — hversu mikið loft leikmaðurinn fær á hverja ýti-tíma-einingu — næmara fyrir þreytu hjá hópíþróttafólki en hið vinsæla RSI-modified, sem reyndist ónæmt í körfubolta og ruðningi (Edwards, 2018). MicroPulse meðhöndlar nú FT:CT sem aðal-sprengikrafts mælikvarðann og heldur RSI-modified sem aukalestri fremur en að reiða sig á hann. Ekkert af þessu fer framhjá hávaða-hliðinu að ofan — þau erfa það.`,
      },
      {
        heading: `Væntanlega endurheimtarferlið eftir leik`,
        body: `Lágt stökk tveimur dögum eftir leik getur verið fullkomlega eðlilegt — spurningin er hvort það sé lágt á væntanlega ferlinum, eða undir honum. MicroPulse líkanar væntanlegu stökk-dýfuna eftir leik fyrir hvern leikmann, drifna af því hversu mikið háhraða hlaup (>5,5 m/s) hann átti í þeim leik — ekki heildarvegalengd. Sönnunin er nákvæm: fyrir hverja 100 m af háhraða hlaupi lækkar hámarksafl CMJ um ~0,5% og vöðvaskemmdar-merki hækka ~30% við 24 klst; heildarvegalengd spáir hvorugu (Hader, 2019).

Væntanlega dýfan er dýpst fyrstu 0–48 klst og getur enn verið til staðar við 72 klst — stökk jafna sig hægar en spretthlaup (Nédélec, 2012; Silva, 2018). Kerfið byggir því væntanlegt band sem hlutfall af eigin grunnlínu leikmannsins á hverri klukkustund eftir leik og ber raunverulega stökkið hans saman við það. Innan bands → endurheimtist samkvæmt áætlun. Undir því → „endurheimtist hægar en vænst", sem fóðrar vefja-/útlæga lesturinn og sýnir þjálfaranum tölurnar: „48 klst eftir leik: stökk í 88% af grunnlínu — vænst ~92–100% miðað við háhraða hlaup leiksins → endurheimtist hægar en vænst."`,
      },
      {
        heading: `Reglur ákveða; þreytulesturinn útskýrir aðeins`,
        body: `Ein meginregla stýrir öllu þessu: taugavöðvaþreytu-lesturinn hreyfir aldrei viðbúnaðarlit leikmannsins. Umferðarljós-dómurinn sem þjálfari sér kemur frá persónu-viðmiðs viðbúnaðarvélinni; þreytutegundin er aðgreint, merkt túlkunarlag við hliðina á honum — það útskýrir og setur í samhengi, það tekur ekki fram fyrir. Grænn leikmaður sem endurheimtist hægt sýnir áfram grænt, með endurheimtar-nótuna sem viðbótar-samhengi, ekki niðurfærslu.

Lesturinn segir líka sitt eigið traust og eyður sínar heiðarlega. Ekkert nýlegt stökk, eða engin háhraða hlaupagögn fyrir leikinn, þýðir engan dóm og lækkað traust — aldrei þögult „engin þreyta". Hver drifkraftur nefnir mælikvarðann sem hann er byggður á og vitnar í greinina að baki, svo þjálfari sjái rökin og sjúkraþjálfari geti kafað ofan í þau. Þetta er öll hönnunin: mæla hlutlægt, staðsetja þreytuna, útskýra hana á mannamáli — og skilja ákvörðunina eftir hjá þjálfaranum.`,
      },
      {
        heading: `Heimildir`,
        body: `D'Emanuele, S., Maffiuletti, N. A., Tarperi, C., Rainoldi, A., Schena, F., & Boccia, G. (2021). Rate of force development as an indicator of neuromuscular fatigue: A scoping review. Frontiers in Human Neuroscience, 15, 701916. https://doi.org/10.3389/fnhum.2021.701916

Carroll, T. J., Taylor, J. L., & Gandevia, S. C. (2017). Recovery of central and peripheral neuromuscular fatigue after exercise. Journal of Applied Physiology, 122(5), 1068–1076. https://doi.org/10.1152/japplphysiol.00775.2016

Gathercole, R., Sporer, B., Stellingwerff, T., & Sleivert, G. (2015). Alternative countermovement-jump analysis to quantify acute neuromuscular fatigue. International Journal of Sports Physiology and Performance, 10(1), 84–92. https://doi.org/10.1123/ijspp.2013-0413

Edwards, T., Spiteri, T., Piggott, B., Bonhotal, J., Haff, G. G., & Joyce, C. (2018). Monitoring and managing fatigue in basketball. Sports, 6(1), 19. https://doi.org/10.3390/sports6010019

Claudino, J. G., Cronin, J., Mezêncio, B., McMaster, D. T., McGuigan, M., Tricoli, V., Amadio, A. C., & Serrão, J. C. (2017). The countermovement jump to monitor neuromuscular status: A meta-analysis. Journal of Science and Medicine in Sport, 20(4), 397–402. https://doi.org/10.1016/j.jsams.2016.08.011

Hader, K., Rumpf, M. C., Hertzog, M., Kilduff, L. P., Girard, O., & Silva, J. R. (2019). Monitoring the athlete match response: Can external load variables predict post-match acute and residual fatigue in soccer? A systematic review with meta-analysis. Sports Medicine – Open, 5, 53. https://doi.org/10.1186/s40798-019-0219-7

Neyroud, D., Kayser, B., & Place, N. (2016). Are there critical fatigue thresholds? Aggregated vs. individual data. Frontiers in Physiology, 7, 376. https://doi.org/10.3389/fphys.2016.00376

Nédélec, M., McCall, A., Carling, C., Legall, F., Berthoin, S., & Dupont, G. (2012). Recovery in soccer, part I: Post-match fatigue and time course of recovery. Sports Medicine, 42(12), 997–1015.

Silva, J. R., Rumpf, M. C., Hertzog, M., Castagna, C., Farooq, A., Girard, O., & Hader, K. (2018). Acute and residual soccer match-related fatigue: A systematic review and meta-analysis. Sports Medicine, 48(3), 539–583.

Gandevia, S. C. (2001). Spinal and supraspinal factors in human muscle fatigue. Physiological Reviews, 81(4), 1725–1789.

Athugasemd: Heimildir eru settar fram í APA 7. útgáfu stíl; atriði voru sannreynd í gögnum útgefenda og PubMed.`,
      },
    ],
    sectionsEN: [
      {
        heading: `A jump that's down can't tell you why`,
        body: `A countermovement jump — the standard hop where a player dips and explodes upward on a force plate — is one of the best objective fatigue tools in sport. But on its own it has a blind spot: it measures net output. A lower jump tells you the player produced less, not whether the cause is a tired nervous system, damaged muscle tissue, or a whole-body dip in sleep and stress. Physiologists have made this point for decades (Gandevia, 2001): the same drop in force can come from very different places.

That matters because the fix is different for each. Central (neural) fatigue clears with rest and sleep in hours; peripheral (tissue) fatigue from eccentric muscle damage can linger for days and needs load protection, not just a nap. So the useful question isn't "is his jump down?" — it's "his jump is down, because of what?" MicroPulse is built to answer the second question from data it already collects.`,
      },
      {
        heading: `Locating the fatigue: three axes`,
        body: `MicroPulse splits neuromuscular fatigue into three labelled types and reads each from a different signal it already has:

NEURAL — the explosive, nervous-system-driven qualities. A drop in the jump's peak power, rate of force development (how fast force is built) or concentric impulse points to reduced central drive. Early-phase RFD in particular is neural-dominated and falls before jump height does (D'Emanuele, 2021).

TISSUE — the muscular/peripheral qualities. When the jump's timing changes — a longer eccentric (lowering) phase, a longer contraction time — while height barely moves, the player is quietly changing his jump strategy to protect sore tissue. These time-and-eccentric metrics stay abnormal longest after muscle damage (Gathercole, 2015).

SYSTEMIC — the whole-body picture. Poor sleep, low energy, high stress and multi-day readiness declines from the daily check-in point to global fatigue that rest, not tissue work, resolves.

The daily wellness check-in, the CMJ and the load data each light up a different axis; read together they locate the fatigue rather than just flag it.`,
      },
      {
        heading: `Only a move beyond its own noise counts`,
        body: `A jump plate is precise, but not every wobble is real. The fatigue-sensitive timing metrics are also the noisiest — rate of force development can vary ~16% between two of the same player's tests, versus ~5% for jump height (Gathercole, 2015). Surfaced raw against a small personal baseline, that noise would fire a false "declining" flag on a normal day — the classic over-sensitive-yellow trap.

So every CMJ metric must clear its own measurement noise before it can flag: the change has to exceed the larger of the metric's known variability and the player's own observed variability, by a margin. A noisy metric like RFD needs a much bigger move to mean anything than a quiet one like jump height. And every comparison is against the player's own baseline, not a league average — because fatigue thresholds are individual, not shared (Neyroud, 2016). MicroPulse also compares the mean of the session's jumps, not the single best, which catches fatigue and supercompensation more reliably than a max effort (Edwards, 2018; Claudino, 2017).`,
      },
      {
        heading: `Reading it earlier, and less bluntly`,
        body: `Two refinements make the read earlier and sharper. First, early-phase rate of force development — how fast force rises in the first 100–200 milliseconds — drops before jump height and is dominated by neural drive, making it an early-warning flag for central fatigue (D'Emanuele, 2021). It is measured as a windowed, force-normalised slope (never an instantaneous peak, which is too noisy).

Second, the flight-time-to-contraction-time ratio (FT:CT) — how much air the player gets per unit of push time — is more fatigue-sensitive in team-sport athletes than the popular RSI-modified, which was found insensitive in basketball and rugby (Edwards, 2018). MicroPulse now treats FT:CT as the primary explosive-quality metric and keeps RSI-modified as a secondary read rather than leaning on it. None of these bypass the noise gate above — they inherit it.`,
      },
      {
        heading: `The expected recovery curve after a match`,
        body: `A low jump two days after a match can be completely normal — the question is whether it is low on the expected curve, or below it. MicroPulse models the expected post-match jump dip per player, driven by how much high-speed running (>5.5 m/s) he did in that match — not total distance. The evidence is specific: for every 100 m of high-speed running, CMJ peak power drops about 0.5% and muscle-damage markers rise ~30% at 24 hours; total distance predicts neither (Hader, 2019).

The expected dip is deepest in the first 0–48 hours and can still be present at 72 hours — jumps recover more slowly than sprinting (Nédélec, 2012; Silva, 2018). So the system builds an expected band as a percentage of the player's own baseline at each hour after the match, and compares his actual jump to it. Inside the band → recovering on schedule. Below it → "recovering slower than expected," which feeds the tissue/peripheral read and shows the coach the numbers: "48 h post-match: jump at 88% of baseline — expected ~92–100% for this match's high-speed running → recovering slower than expected."`,
      },
      {
        heading: `Rules decide; the fatigue read only explains`,
        body: `One principle governs all of this: the neuromuscular-fatigue read never moves the player's readiness colour. The traffic-light verdict a coach sees comes from the personal-norm readiness engine; the fatigue type is a distinct, labelled interpretation layer next to it — it explains and contextualises, it does not override. A green player recovering slowly still shows green, with the recovery note as added context, not a downgrade.

The read also states its own confidence and its gaps honestly. No recent jump, or no high-speed-running data for the match, means no verdict and lowered confidence — never a silent "no fatigue." Every driver names the metric it is built on and cites the paper behind it, so a coach can see the reasoning and a physio can drill into it. That is the whole design: measure objectively, locate the fatigue, explain it in plain language — and leave the decision with the coach.`,
      },
      {
        heading: `References`,
        body: `D'Emanuele, S., Maffiuletti, N. A., Tarperi, C., Rainoldi, A., Schena, F., & Boccia, G. (2021). Rate of force development as an indicator of neuromuscular fatigue: A scoping review. Frontiers in Human Neuroscience, 15, 701916. https://doi.org/10.3389/fnhum.2021.701916

Carroll, T. J., Taylor, J. L., & Gandevia, S. C. (2017). Recovery of central and peripheral neuromuscular fatigue after exercise. Journal of Applied Physiology, 122(5), 1068–1076. https://doi.org/10.1152/japplphysiol.00775.2016

Gathercole, R., Sporer, B., Stellingwerff, T., & Sleivert, G. (2015). Alternative countermovement-jump analysis to quantify acute neuromuscular fatigue. International Journal of Sports Physiology and Performance, 10(1), 84–92. https://doi.org/10.1123/ijspp.2013-0413

Edwards, T., Spiteri, T., Piggott, B., Bonhotal, J., Haff, G. G., & Joyce, C. (2018). Monitoring and managing fatigue in basketball. Sports, 6(1), 19. https://doi.org/10.3390/sports6010019

Claudino, J. G., Cronin, J., Mezêncio, B., McMaster, D. T., McGuigan, M., Tricoli, V., Amadio, A. C., & Serrão, J. C. (2017). The countermovement jump to monitor neuromuscular status: A meta-analysis. Journal of Science and Medicine in Sport, 20(4), 397–402. https://doi.org/10.1016/j.jsams.2016.08.011

Hader, K., Rumpf, M. C., Hertzog, M., Kilduff, L. P., Girard, O., & Silva, J. R. (2019). Monitoring the athlete match response: Can external load variables predict post-match acute and residual fatigue in soccer? A systematic review with meta-analysis. Sports Medicine – Open, 5, 53. https://doi.org/10.1186/s40798-019-0219-7

Neyroud, D., Kayser, B., & Place, N. (2016). Are there critical fatigue thresholds? Aggregated vs. individual data. Frontiers in Physiology, 7, 376. https://doi.org/10.3389/fphys.2016.00376

Nédélec, M., McCall, A., Carling, C., Legall, F., Berthoin, S., & Dupont, G. (2012). Recovery in soccer, part I: Post-match fatigue and time course of recovery. Sports Medicine, 42(12), 997–1015.

Silva, J. R., Rumpf, M. C., Hertzog, M., Castagna, C., Farooq, A., Girard, O., & Hader, K. (2018). Acute and residual soccer match-related fatigue: A systematic review and meta-analysis. Sports Medicine, 48(3), 539–583.

Gandevia, S. C. (2001). Spinal and supraspinal factors in human muscle fatigue. Physiological Reviews, 81(4), 1725–1789.

Note: References are formatted in APA 7th edition style; details verified against publisher and PubMed records.`,
      },
    ],
  },
  {
    slug: "lidanarmaelingar-wellness-check-ins",
    date: "2026-08-05",
    readMin: 10,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "both",
    titleIS: "Líðanarmælingar hjá íþróttafólki: Hvað segja rannsóknir um sjálfsmatsvöktun",
    titleEN: "Wellness Check-Ins for Athletes: What the Evidence Says About Self-Report Monitoring",
    summaryIS:
      "Stuttir daglegir sjálfsmatslistar — þreyta, svefn, harðsperrur, streita, skap — eru meðal útbreiddustu vöktunartækja í íþróttum. Þetta yfirlit yfir rannsóknir sýnir hvers vegna þeir eru oft næmari en dýrir hlutlægir mælikvarðar, hvernig þeir tengjast meiðslahættu og hvernig á að nota þá vel.",
    summaryEN:
      "Short daily self-report questionnaires — fatigue, sleep, soreness, stress, mood — are among the most widely used monitoring tools in sport. This review of the evidence shows why they often out-sense costly objective markers, how they relate to injury risk, and how to run them well.",
    sectionsIS: [
      {
        heading: `Útdráttur`,
        body: `„Líðanarmælingar“ hjá íþróttafólki — stuttir, sjálfsmetnir spurningalistar þar sem iðkendur meta daglega hvernig þeim líður á þáttum á borð við þreytu, svefn, harðsperrur, streitu og skap — eru orðnar eitt útbreiddasta vöktunartæki í afreks- og ungmennaíþróttum. Í þessari grein er farið yfir þær rannsóknir sem liggja að baki notkun þeirra. Heimildir sýna að huglæg sjálfsmatsgildi eru oft næmari fyrir breytingum á æfingaálagi en hlutlægir mælikvarðar sem venjulega eru safnað (Saw, Main og Gastin, 2016), að jafnvel einfaldir eins-atriða kvarðar fylgja álagi með marktækum hætti í hópíþróttum (Jeffries o.fl., 2020), og að skert líðan tengist aukinni meiðslahættu þegar æfingaálag er mikið (Lathlean, Newstead og Gastin, 2023). Einnig er fjallað um þá hagnýtu þætti sem ráða árangri vöktunarkerfis — þátttöku, heiðarleika, hnitmiðun og viðbrögð þjálfara við gögnunum (Saw, Main og Gastin, 2015) — og settar fram gagnreyndar ráðleggingar fyrir fagfólk, með sérstakri skírskotun til knattspyrnu.`,
      },
      {
        heading: `1. Inngangur`,
        body: `Að stýra jafnvæginu milli æfingaálags og endurheimtar er kjarninn í nútíma íþróttavísindum. Sé álag of lítið er iðkandinn vanbúinn; sé það of mikið án nægrar endurheimtar færist hann nær ofþjálfun, veikindum eða meiðslum. Áskorunin fyrir þjálfara og stoðteymi er sú að innri viðbrögð iðkandans við tilteknu álagi eru mjög einstaklingsbundin og verða ekki lesin áreiðanlega út frá æfingaáætluninni einni saman. Það er þetta bil sem líðanarvöktun er ætlað að brúa.

Líðanarmæling er yfirleitt stuttur spurningalisti sem fylltur er út á hverjum morgni eða fyrir æfingu, þar sem iðkandinn metur nokkra huglæga þætti á stuttum talnakvarða. Áhrifamesta fyrirmyndin á rætur að rekja til Hooper og Mackinnon (1995), sem lögðu til að vakta sjálfsmetna þreytu, streitu, harðsperrur og svefngæði sem hagnýta vísa um ofþjálfun og endurheimt. Afbrigði af þessum „Hooper-kvarða“ eru enn í daglegri notkun þremur áratugum síðar (Clemente o.fl., 2021). Aðdráttaraflið er augljóst: mælingarnar eru ódýrar, fljótlegar, ekki inngripsmiklar og hægt er að safna þeim daglega frá heilum hópi, ólíkt blóðgildum eða prófunum á rannsóknarstofu.

En mæling er aldrei betri en vísindin að baki henni og aginn við framkvæmdina. Kaflarnir sem á eftir fylgja lýsa því hvað rannsóknir sýna í raun um réttmæti og næmi þessara tækja, tengsl þeirra við meiðsla- og veikindahættu, þá mannlegu þætti sem gera eða brjóta vöktunarkerfi, og hvernig fagfólk getur beitt heimildunum í starfi.`,
      },
      {
        heading: `2. Hvers vegna huglægir mælikvarðar eiga rétt á sér`,
        body: `Mikilvægasta staka heimildin fyrir líðanarmælingum kemur frá kerfisbundnu yfirliti Saw, Main og Gastin (2016), sem ber hinn hnyttna undirtitil „huglæg sjálfsmatsgildi slá út algenga hlutlæga mælikvarða.“ Með því að draga saman meira en fimmtíu rannsóknir komust höfundarnir að því að huglæg líðan svaraði bráðu og langvinnu æfingaálagi með meira næmi og samkvæmni en margir hlutlægir mælikvarðar á borð við hvíldarpúls, breytileika hjartsláttar, hormónagildi eða frammistöðu í stökkprófum. Það sem mestu skiptir er að huglæg gildi hneigðust til að hreyfast í þá átt sem búast mátti við — versnuðu við bráða aukningu álags og hert æfingatímabil, og bötnuðu þegar álag var minnkað, svo sem á niðurtröppunartímabili.

Þessi niðurstaða breytti sýninni á sjálfsmat úr „mjúku“ viðbótargagni yfir í sjálfstæða, frumlæga vöktunarrás. Það þýðir ekki að hlutlægir mælikvarðar séu gagnslausir; heldur að vel hannaður huglægur spurningalisti fangar heildarkostnað æfinga — líkamlegan, sálrænan og lífsstílstengdan — með hætti sem enginn einn lífmarkir ræður við (Saw, Main og Gastin, 2016).

Annað kerfisbundið yfirlit, eftir Jeffries og félaga (2020), þrengdi sjónarhornið að hópíþróttum og að þeim mjög stuttu eins-atriða kvörðum sem félög nota í raun — einnar línu mat á þreytu, svefni, harðsperrum, streitu eða skapi. Þeir staðfestu að þessir einföldu mælikvarðar tengjast æfingaálagi, þótt styrkur tengslanna og jafnvel stefna þeirra sé breytileg eftir atriði, íþrótt og samhengi. Þreyta og skynjaðar harðsperrur reyndust næmust fyrir álagi. Hin hagnýta skilaboð eru uppörvandi fyrir tímabundið starfsfólk: hnitmiðun eyðir ekki sjálfkrafa merkinu, en val á atriðum skiptir máli og túlka ber niðurstöður á einstaklingsgrunni fremur en að gera ráð fyrir að þær séu einsleitar yfir allan hópinn (Jeffries o.fl., 2020).`,
      },
      {
        heading: `3. Líðan, meiðsli og veikindahætta`,
        body: `Ef mælingar endurspegluðu einungis hversu þreytt íþróttafólk væri, væri gildi þeirra takmarkað. Sterkari röksemdin er sú að huglæg líðan beri upplýsingar um síðari áhættu. Brink og félagar (2010) fylgdu eftir afreksungmennum í knattspyrnu og sýndu að vöktun streitu og endurheimtar veitti nýja innsýn í aðdraganda meiðsla og veikinda, sem styður þá hugmynd að sállíkamlegt ástand sé forboði áfalla fremur en einungis afleiðing þeirra.

Nýlega sýndu Lathlean, Newstead og Gastin (2023) hjá afreksungmennum í áströlskum fótbolta að iðkendur sem greindu frá skertri líðan voru í aukinni meiðslahættu, sérstaklega þegar æfingaálag var mikið. Þessi víxlverkun — að líðan móti samband álags og meiðsla — er mikilvæg í starfi: sama erfiða æfingin getur verið vel þolanleg fyrir vel endurheimtan iðkanda en falið í sér hættu fyrir illa endurheimtan. Mæling verður því tæki til að einstaklingsmiða álag, sem bendir á hvaða iðkendur þurfa aðlögun tiltekinn dag fremur en að beita einni reglu yfir allan hópinn (Lathlean, Newstead og Gastin, 2023).

Rannsóknir í knattspyrnu sérstaklega styrkja tengslin milli uppsafnaðs álags og skynjaðrar líðanar. Clemente o.fl. (2021) fylgdust með ungum knattspyrnuiðkendum yfir heilt keppnistímabil og greindu frá tengslum milli álagsmælikvarða og líðanargilda, þar sem Hooper-atriðin sveifluðust í takt við kröfur æfingavikunnar. Sambærileg mynstur hafa sést yfir þétt leikjatímabil og í umhverfi ungmennalandsliða, þar sem líðan og sálrænir þættir breytast með ákefð og þéttleika keppni.`,
      },
      {
        heading: `4. Mannlegu þættirnir sem gera eða brjóta kerfið`,
        body: `Endurtekinn lærdómur úr heimildunum er sá að sálfræðilegir mæligæði spurningalistans skipta minna máli en hvernig hann er felldur inn í daglegt starf. Í eigindlegri rannsókn sinni á framkvæmd bentu Saw, Main og Gastin (2015) á þá félags- og umhverfisþætti sem ráða því hvort sjálfsmatskerfi virki raunverulega: eignarhald iðkenda á kerfinu, skynjað mikilvægi og trúnaður gagnanna, einfaldleiki og hraði útfyllingar og — umfram allt — hvort iðkendur sjái starfsfólk bregðast við því sem þeir greina frá.

Nokkrar hagnýtar bilanaleiðir leiða beint af þessu. Langir eða síendurteknir spurningalistar draga úr þátttöku. Þegar iðkendur gruna að svör þeirra verði notuð gegn þeim — til dæmis til að réttlæta að þeir séu teknir úr liði — geta þeir hagrætt svörum sínum í átt að félagslega æskilegum gildum, sem eyðileggur réttmæti gagnanna hljóðlega. Og ef leikmaður greinir frá lélegum svefni eða miklum harðsperrum dag eftir dag án sýnilegrar aðlögunar af hálfu þjálfarateymisins fer æfingin að virðast tilgangslaus og þátttaka hrynur. Saw og félagar (2015) líta á vöktunarkerfið sem tvíátta samskiptatæki, ekki eftirlitstæki; iðkandinn leggur fram heiðarleg gögn og í staðinn nýtir starfsfólkið þau með sýnilegum hætti til að styðja iðkandann.`,
      },
      {
        heading: `5. Frá gögnum til ákvarðana`,
        body: `Að safna gildum er ekki það sama og að nýta þau. Þar sem huglægir mælikvarðar eru breytilegir og mjög einstaklingsbundnir túlkar flest fagfólk breytingu miðað við eigin grunnlínu hvers iðkanda fremur en fastan hópþröskuld. Algeng nálgun er að setja upp hlaupandi einstaklingsmeðaltal og merkja marktæk frávik frá því — til dæmis fall í líðanar-Z-gildi umfram tiltekin mörk — svo athyglinni sé beint að þeim iðkendum þar sem ástand hefur raunverulega breyst (Jeffries o.fl., 2020; Saw, Main og Gastin, 2016).

Líðanargögn eru öflugust þegar þau eru lesin samhliða æfingaálagi fremur en ein og sér. Víxlverkunin sem Lathlean og félagar (2023) greindu frá gefur til kynna að hin hagnýta spurning sé ekki einfaldlega „er þessi iðkandi þreyttur?“ heldur „greinir þessi iðkandi frá skertri líðan á sama tíma og álag er mikið?“ Með því að para daglega mælingu við álagsmælikvarða á borð við sRPE (session-RPE) fá starfsmenn einmitt þessa tvívíðu mynd, sem gerir kleift að taka einstaklingsmiðaðar ákvarðanir um hvort auka eigi, halda eða minnka álag hjá tilteknum iðkanda tiltekinn dag.`,
      },
      {
        heading: `6. Takmarkanir og fyrirvarar`,
        body: `Þótt heimildagrunnurinn sé styðjandi fylgja honum mikilvægir fyrirvarar. Yfirlitsgreinar benda á verulegan breytileika í því hvernig líðan er mæld, sem gerir beinan samanburð milli rannsókna erfiðan, og margir undirliggjandi spurningalistar hafa ekki verið formlega réttmætaprófaðir sem sálfræðileg mælitæki (Jeffries o.fl., 2020). Tengsl líðanar og álags eru oft hófleg að stærð og geta verið mismunandi milli einstaklinga og íþróttagreina, svo líðan ætti að upplýsa ákvarðanir fremur en að ráða þeim. Svörun og heiðarleiki eru viðvarandi ógnir: það að mæla getur breytt hegðun, og sjálfsmat er aðeins jafn sannleikanum og menningin í kringum það leyfir (Saw, Main og Gastin, 2015). Loks er stór hluti vandaðra langtímarannsókna innan tiltekinna hópa — ungmenna- og afreksknattspyrnu, áströlsks fótbolta — svo fagfólk í öðru samhengi ætti að alhæfa með varúð.`,
      },
      {
        heading: `7. Hagnýtar ráðleggingar fyrir fagfólk`,
        body: `Þegar þræðirnir eru dregnir saman styðja rannsóknirnar samræmt safn af hagnýtum meginreglum fyrir hvern þann sem heldur úti líðanarmælingum með hópi:

Hafið það stutt. Fáein vel valin eins-atriða gildi (þreyta, svefngæði, harðsperrur, streita og skap) sem hægt er að fylla út á innan við mínútu viðheldur þátttöku en varðveitir samt merkið (Jeffries o.fl., 2020).

Samræmið tímasetningu. Safnið á sama tíma á hverjum degi — yfirleitt fyrst að morgni eða við komu — svo gildin séu samanburðarhæf dag frá degi.

Túlkið miðað við einstaklinginn. Notið eigin hlaupandi grunnlínu hvers iðkanda og merkið marktæk frávik, í stað þess að dæma alla eftir einum föstum þröskuldi (Saw, Main og Gastin, 2016).

Lesið líðan með álagi, ekki í staðinn fyrir það. Parið mælinguna við álagsmælikvarða; samspil skertrar líðanar og mikils álags er lykiláhættumerkið (Lathlean, Newstead og Gastin, 2023).

Lokið hringnum. Sýnið iðkendum að svör þeirra leiði til aðgerða. Sýnileg, styðjandi notkun gagnanna er sterkasti einstaki drifkrafturinn að heiðarlegri og viðvarandi þátttöku (Saw, Main og Gastin, 2015).

Verndið traust. Haldið gögnunum trúnaðarmerktum og forðist að nota þau í refsiskyni, ella versna gæði skráningarinnar hljóðlega (Saw, Main og Gastin, 2015).`,
      },
      {
        heading: `8. Niðurstöður`,
        body: `Líðanarmælingar hafa áunnið sér sess í vöktun íþróttafólks, ekki vegna þess að þær séu flóknar heldur vegna þess að þær eru næmar, ódýrar og aðgerðatengdar. Rannsóknir sýna að skynjun iðkenda sjálfra á þreytu, svefni, harðsperrum og streitu svarar æfingaálagi að minnsta kosti jafn upplýsandi og margir dýrari hlutlægir mælikvarðar (Saw, Main og Gastin, 2016), að þessi skynjun ber upplýsingar um meiðsla- og veikindahættu (Brink o.fl., 2010; Lathlean, Newstead og Gastin, 2023), og að jafnvel mjög stuttir kvarðar eru gagnlegir þegar þeir eru túlkaðir af skynsemi (Jeffries o.fl., 2020). Gildi þeirra ræðst þó á endanum ekki af spurningalistanum sjálfum heldur af mannlega kerfinu í kringum hann — stuttum í útfyllingu, einstaklingsmiðað túlkuðum, lesnum samhliða álagi og, umfram allt, með sýnilegum hætti notuðum (Saw, Main og Gastin, 2015). Beitt þannig verður einnar mínútu dagleg mæling eitt arðbærasta tækið sem þjálfara- og frammistöðuteymi hefur yfir að ráða.`,
      },
      {
        heading: `Heimildir`,
        body: `Brink, M. S., Visscher, C., Arends, S., Zwerver, J., Post, W. J., & Lemmink, K. A. P. M. (2010). Monitoring stress and recovery: New insights for the prevention of injuries and illnesses in elite youth soccer players. British Journal of Sports Medicine, 44(11), 809–815. https://doi.org/10.1136/bjsm.2009.069476

Clemente, F. M., Silva, R., Ramirez-Campillo, R., Afonso, J., Mendes, B., & Chen, Y.-S. (2021). Association between training load and well-being measures in young soccer players during a season. International Journal of Environmental Research and Public Health, 18(9), 4451. https://doi.org/10.3390/ijerph18094451

Hooper, S. L., & Mackinnon, L. T. (1995). Monitoring overtraining in athletes: Recommendations. Sports Medicine, 20(5), 321–327. https://doi.org/10.2165/00007256-199520050-00003

Jeffries, A. C., Wallace, L., Coutts, A. J., McLaren, S. J., McCall, A., & Impellizzeri, F. M. (2020). Single-item self-report measures of team-sport athlete wellbeing and their relationship with training load: A systematic review. Journal of Athletic Training, 55(9), 1010–1019. https://doi.org/10.4085/1062-6050-542.19

Lathlean, T. J. H., Newstead, S. V., & Gastin, P. B. (2023). Elite junior Australian football players with impaired wellness are at increased injury risk at high loads. Sports Health, 15(3), 361–369. https://doi.org/10.1177/19417381221087245

Saw, A. E., Main, L. C., & Gastin, P. B. (2015). Monitoring athletes through self-report: Factors influencing implementation. Journal of Sports Science & Medicine, 14(1), 137–146.

Saw, A. E., Main, L. C., & Gastin, P. B. (2016). Monitoring the athlete training response: Subjective self-reported measures trump commonly used objective measures: A systematic review. British Journal of Sports Medicine, 50(5), 281–291. https://doi.org/10.1136/bjsports-2015-094758

Athugasemd um heimildir: Titlar og heimildaskrá eru hafðir á upprunalegu (ensku) formi eins og venja er í fræðilegri tilvísun. Blaðsíðutal fyrir Lathlean o.fl. (2023) miðast við blaðsíðutal prentaðs heftis; öll önnur atriði voru sannreynd í gögnum útgefenda og PubMed. Heimildir eru settar fram í APA 7. útgáfu stíl.`,
      },
    ],
    sectionsEN: [
      {
        heading: `Abstract`,
        body: `Athlete “wellness check-ins” — short, self-reported questionnaires that ask athletes to rate how they feel each day on dimensions such as fatigue, sleep, muscle soreness, stress and mood — have become one of the most widely used monitoring tools in high-performance and youth sport. This article reviews the research underpinning their use. The evidence shows that subjective self-report measures are often more sensitive to changes in training load than routinely collected objective markers (Saw, Main & Gastin, 2016), that even simple single-item scales track meaningfully with load in team sports (Jeffries et al., 2020), and that impaired wellness is associated with elevated injury risk when training loads are high (Lathlean, Newstead & Gastin, 2023). It also examines the practical determinants of a monitoring system’s success — compliance, honesty, brevity and the coach’s response to the data (Saw, Main & Gastin, 2015) — and offers evidence-based recommendations for practitioners, with particular relevance to football.`,
      },
      {
        heading: `1. Introduction`,
        body: `Managing the balance between training stress and recovery sits at the heart of modern sport science. Load too little and athletes are underprepared; load too much without adequate recovery and they drift toward non-functional overreaching, illness or injury. The challenge for coaches and support staff is that the athlete’s internal response to a given training dose is highly individual and cannot be read reliably from the training plan alone. This is the gap that wellness monitoring aims to fill.

A wellness check-in is typically a brief questionnaire completed each morning or before training, in which the athlete rates several perceptual dimensions on a short numerical scale. The most influential template dates back to Hooper and Mackinnon (1995), who recommended monitoring self-rated fatigue, stress, muscle soreness and sleep quality as practical markers of overtraining and recovery. Variants of this “Hooper index” remain in everyday use three decades later (Clemente et al., 2021). The enduring appeal is obvious: the measures are cheap, fast, non-invasive and can be collected daily from an entire squad, unlike blood markers or laboratory testing.

Yet a check-in is only as good as the science behind it and the discipline of its implementation. The sections that follow set out what the research actually demonstrates about the validity and sensitivity of these tools, their relationship to injury and illness risk, the human factors that make or break a monitoring programme, and how practitioners can apply the evidence in the field.`,
      },
      {
        heading: `2. Why subjective measures earn their place`,
        body: `The most important single piece of evidence for wellness check-ins comes from the systematic review by Saw, Main and Gastin (2016), pointedly subtitled “subjective self-reported measures trump commonly used objective measures.” Synthesising more than fifty studies, the authors found that subjective wellbeing generally responded to acute and chronic training load with greater sensitivity and consistency than many objective markers such as resting heart rate variability, hormonal panels or countermovement-jump performance. Crucially, subjective ratings tended to move in the expected direction — worsening with acute increases in load and intensified training, and improving with reduced load such as during a taper.

This finding reframed self-report from a “soft” supplement to hard physiology into a primary monitoring channel in its own right. It does not mean objective measures are worthless; rather, it means a well-designed perceptual questionnaire captures the integrated cost of training — physical, psychological and lifestyle-related — in a way that any single biomarker struggles to match (Saw, Main & Gastin, 2016).

A second systematic review by Jeffries and colleagues (2020) narrowed the focus to team sports and to the very short, single-item scales that clubs actually use in practice — a one-line rating of fatigue, sleep, soreness, stress or mood. They confirmed that these minimalist measures do relate to training load, though the strength and even the direction of the relationship vary by item, sport and context. Fatigue and perceived soreness tended to be the most responsive to load. The practical message is encouraging for time-pressed staff: brevity does not automatically destroy signal, but item selection matters and results should be interpreted at the individual level rather than assumed to be uniform across a squad (Jeffries et al., 2020).`,
      },
      {
        heading: `3. Wellness, injury and illness risk`,
        body: `If check-ins only reflected how tired athletes felt, their value would be limited. The stronger justification is that perceptual wellness carries information about downstream risk. Brink and colleagues (2010) followed elite youth soccer players and showed that monitoring stress and recovery yielded new insight into the build-up toward injuries and illnesses, supporting the idea that psychophysiological state is an antecedent of breakdown rather than merely a by-product of it.

More recently, Lathlean, Newstead and Gastin (2023) demonstrated in elite junior Australian football players that athletes reporting impaired wellness were at increased injury risk specifically when training loads were high. This interaction — wellness moderating the load–injury relationship — is important for practice: the same heavy session may be tolerated by a well-recovered athlete and represent a hazard for a poorly recovered one. A check-in therefore becomes a tool for individualising load, flagging which athletes need modification on a given day rather than applying a blanket rule to the group (Lathlean, Newstead & Gastin, 2023).

Work in football specifically reinforces the link between accumulated load and perceived wellbeing. Clemente et al. (2021) tracked young soccer players across a season and reported associations between training-load measures and wellness scores, with the Hooper-type items fluctuating in line with the demands of the training week. Similar patterns have been observed across congested fixture periods and in youth national-team environments, where wellness and psychological variables shift with the intensity and density of competition.`,
      },
      {
        heading: `4. The human factors that make or break a system`,
        body: `A recurring lesson in the literature is that the psychometrics of the questionnaire matter less than the way it is embedded in daily practice. In their qualitative study of implementation, Saw, Main and Gastin (2015) identified the socio-environmental factors that determine whether a self-report system actually works: athlete buy-in, the perceived relevance and confidentiality of the data, the simplicity and speed of completion, and — above all — whether athletes see staff act on what they report.

Several practical failure modes follow directly from this. Long or repetitive questionnaires erode compliance. When athletes suspect their answers will be used punitively — for example to justify dropping them — they may “game” their responses toward socially desirable scores, quietly destroying the data’s validity. And if a player reports poor sleep or high soreness day after day with no visible adjustment from the coaching staff, the exercise comes to feel pointless and completion rates collapse. Saw and colleagues (2015) frame the athlete monitoring system as a two-way communication tool, not a surveillance mechanism; the athlete provides honest data, and in return the staff demonstrably use it to support the athlete.`,
      },
      {
        heading: `5. From data to decisions`,
        body: `Collecting scores is not the same as using them. Because perceptual measures are noisy and highly individual, most practitioners interpret change relative to each athlete’s own baseline rather than against a fixed group threshold. A common approach is to establish a rolling personal average and to flag meaningful departures from it — for instance a drop in a wellness Z-score beyond a set band — so that attention is directed to the athletes whose state has genuinely shifted (Jeffries et al., 2020; Saw, Main & Gastin, 2016).

Wellness data are most powerful when read alongside training load rather than in isolation. The interaction reported by Lathlean and colleagues (2023) implies that the actionable question is not simply “is this athlete tired?” but “is this athlete reporting impaired wellness at a time when load is also high?” Pairing a daily check-in with a session-RPE load measure gives staff exactly this two-dimensional picture, allowing individualised decisions about whether to progress, hold or reduce a given athlete’s load on a given day.`,
      },
      {
        heading: `6. Limitations and cautions`,
        body: `The evidence base, while supportive, carries important caveats. Reviews note substantial heterogeneity in how wellness is measured, making direct comparison between studies difficult, and many of the underlying questionnaires have not been formally validated as psychometric instruments (Jeffries et al., 2020). Relationships between wellness and load are frequently modest in magnitude and can differ between individuals and between sports, so wellness should inform rather than dictate decisions. Reactivity and honesty remain persistent threats: the act of measuring can change behaviour, and self-report is only as truthful as the culture around it allows (Saw, Main & Gastin, 2015). Finally, most high-quality longitudinal work sits in specific populations — youth and elite football, Australian football — so practitioners in other contexts should generalise with care.`,
      },
      {
        heading: `7. Practical recommendations for practitioners`,
        body: `Drawing the threads together, the research supports a consistent set of practical principles for anyone running wellness check-ins with a squad:

Keep it short. A handful of well-chosen single items (fatigue, sleep quality, muscle soreness, stress and mood) completed in under a minute preserves compliance while retaining signal (Jeffries et al., 2020).

Standardise timing. Collect at the same point each day — typically first thing in the morning or on arrival — so scores are comparable day to day.

Interpret against the individual. Use each athlete’s own rolling baseline and flag meaningful departures, rather than judging everyone against one fixed cut-off (Saw, Main & Gastin, 2016).

Read wellness with load, not instead of it. Pair the check-in with a training-load measure; the combination of impaired wellness and high load is the key risk signal (Lathlean, Newstead & Gastin, 2023).

Close the loop. Show athletes that their responses lead to action. Visible, supportive use of the data is the single strongest driver of honest, sustained participation (Saw, Main & Gastin, 2015).

Protect trust. Keep data confidential and avoid using it punitively, or reporting quality will quietly degrade (Saw, Main & Gastin, 2015).`,
      },
      {
        heading: `8. Conclusion`,
        body: `Wellness check-ins have earned their place in athlete monitoring not because they are sophisticated but because they are sensitive, cheap and actionable. The research shows that athletes’ own perceptions of fatigue, sleep, soreness and stress respond to training load at least as informatively as many costlier objective measures (Saw, Main & Gastin, 2016), that these perceptions carry information about injury and illness risk (Brink et al., 2010; Lathlean, Newstead & Gastin, 2023), and that even very brief scales are useful when interpreted intelligently (Jeffries et al., 2020). Their value, however, is ultimately unlocked not by the questionnaire itself but by the human system around it — brief to complete, individually interpreted, read alongside load, and, above all, visibly acted upon (Saw, Main & Gastin, 2015). Used this way, a one-minute daily check-in becomes one of the highest-return tools available to a coaching and performance staff.`,
      },
      {
        heading: `References`,
        body: `Brink, M. S., Visscher, C., Arends, S., Zwerver, J., Post, W. J., & Lemmink, K. A. P. M. (2010). Monitoring stress and recovery: New insights for the prevention of injuries and illnesses in elite youth soccer players. British Journal of Sports Medicine, 44(11), 809–815. https://doi.org/10.1136/bjsm.2009.069476

Clemente, F. M., Silva, R., Ramirez-Campillo, R., Afonso, J., Mendes, B., & Chen, Y.-S. (2021). Association between training load and well-being measures in young soccer players during a season. International Journal of Environmental Research and Public Health, 18(9), 4451. https://doi.org/10.3390/ijerph18094451

Hooper, S. L., & Mackinnon, L. T. (1995). Monitoring overtraining in athletes: Recommendations. Sports Medicine, 20(5), 321–327. https://doi.org/10.2165/00007256-199520050-00003

Jeffries, A. C., Wallace, L., Coutts, A. J., McLaren, S. J., McCall, A., & Impellizzeri, F. M. (2020). Single-item self-report measures of team-sport athlete wellbeing and their relationship with training load: A systematic review. Journal of Athletic Training, 55(9), 1010–1019. https://doi.org/10.4085/1062-6050-542.19

Lathlean, T. J. H., Newstead, S. V., & Gastin, P. B. (2023). Elite junior Australian football players with impaired wellness are at increased injury risk at high loads. Sports Health, 15(3), 361–369. https://doi.org/10.1177/19417381221087245

Saw, A. E., Main, L. C., & Gastin, P. B. (2015). Monitoring athletes through self-report: Factors influencing implementation. Journal of Sports Science & Medicine, 14(1), 137–146.

Saw, A. E., Main, L. C., & Gastin, P. B. (2016). Monitoring the athlete training response: Subjective self-reported measures trump commonly used objective measures: A systematic review. British Journal of Sports Medicine, 50(5), 281–291. https://doi.org/10.1136/bjsports-2015-094758

Note on citations: page ranges for the Lathlean et al. (2023) article reflect the print issue pagination; all other bibliographic details were verified against publisher and PubMed records. References are formatted in APA 7th edition style.`,
      },
    ],
  },
  {
    slug: "met-taekni-meidslafovarnir",
    date: "2026-04-06",
    readMin: 5,
    category: "meidslafovarnir",
    author: "MicroPulse",
    audience: "both",
    titleIS: "MET tækni: Hvernig muscle energy technique dregur \u00far mei\u00f0slah\u00e6ttu",
    titleEN: "MET Technique: How Muscle Energy Technique Reduces Injury Risk",
    summaryIS:
      "Muscle Energy Technique (MET) er ein \u00e1hrifa\u00edr\u00edkasta lei\u00f0in til a\u00f0 b\u00e6ta hreyfigetu og draga \u00far v\u00f6\u00f0vaspennu. H\u00e9r er hvernig og hvers vegna h\u00fan virkar.",
    summaryEN:
      "Muscle Energy Technique (MET) is one of the most effective ways to improve range of motion and reduce muscle tension. Here is how and why it works.",
    sectionsIS: [
      {
        heading: "Hva\u00f0 er MET?",
        body: `Muscle Energy Technique (MET) er virk teygjua\u00f0fer\u00f0 \u00fear sem leikma\u00f0urinn beitir v\u00e6gri spennu gegn vi\u00f0n\u00e1mi \u00ed 5\u20136 sek\u00fandur, slappnar s\u00ed\u00f0an af og fer d\u00fdpra \u00ed teygjuna. \u00d3l\u00edkt hef\u00f0bundnum teygjum er leikma\u00f0urinn virkur \u00fe\u00e1tttakandi \u2014 v\u00f6\u00f0vinn dregst saman \u00e1\u00f0ur en hann slappnar af, sem virkjar Golgi-sinavi\u00f0br\u00f6g\u00f0 og leyfir meiri lengingu.

MET er ekki n\u00fd hugmynd; h\u00fan hefur veri\u00f0 notu\u00f0 af sj\u00fakra\u00fej\u00e1lfurum \u00ed \u00e1ratugi. N\u00fdjustu ranns\u00f3knirnar s\u00fdna \u00fe\u00f3 a\u00f0 h\u00fan er s\u00e9rstaklega \u00e1hrifa\u00edr\u00edk sem hluti af warm-up og cool-down hj\u00e1 \u00ed\u00fer\u00f3ttaf\u00f3lki til a\u00f0 koma \u00ed veg fyrir \u00e1verka \u00e1 v\u00f6\u00f0vum og li\u00f0\u00fe\u00f3fi.`,
      },
      {
        heading: "Hvers vegna er MET betri en passive teygja?",
        body: `Passive teygja (halda kyrrt \u00ed 30 sek) eykur t\u00edmabundi\u00f0 range of motion, en ranns\u00f3knir s\u00fdna a\u00f0 v\u00f6\u00f0vinn gleymir henni flj\u00f3tt. MET er \u00f6\u00f0ruv\u00edsi vegna \u00feess a\u00f0 h\u00fan notar isometric samdra\u00e1tt sem sendir taugamerki til mi\u00f0taugakerfis \u2014 a\u00f0 n\u00fa s\u00e9 \u00f3h\u00e6tt a\u00f0 lengja. \u00deetta skilar varanlegri lengingu og virkari hreyfigetu.

Kerfisbundin yfirlit og safngreiningar sty\u00f0ja \u00feessi \u00e1hrif. Muscle energy techniques auka \u00e1rei\u00f0anlega hreyfigetu og draga \u00far verkjum hj\u00e1 fj\u00f6lbreyttum h\u00f3pum (Thomas o.fl., 2019), og fyrir aftanl\u00e6risv\u00f6\u00f0va s\u00e9rstaklega skilar MET meiri hreyfigetu en \u00f3virk teygja (Kang o.fl., 2023). St\u00e6r\u00f0 \u00e1hrifanna er breytileg milli ranns\u00f3kna og einstaklinga, svo l\u00edta ber \u00e1 MET sem \u00e1rei\u00f0anlega lei\u00f0 til a\u00f0 b\u00e6ta og vi\u00f0halda hreyfigetu fremur en trygg\u00f0a mei\u00f0slaforv\u00f6rn.`,
      },
      {
        heading: "Hvernig nota leikmenn MET \u00ed MicroPulse?",
        body: `\u00deegar leikma\u00f0ur merkir \u00ed check-in a\u00f0 hann finni til \u00ed tilteknum v\u00f6\u00f0vah\u00f3pi, sendir MicroPulse kerfi\u00f0 vi\u00f0eigandi MET-\u00e6fingu \u00e1 Today s\u00ed\u00f0una hans. Til d\u00e6mis: ef leikma\u00f0ur skrifar \u00abst\u00edfur aftan \u00ed l\u00e6ri\u00bb f\u00e6r hann Hamstring MET protocol \u2014 3 \u00d7 5 sek spenna gegn vi\u00f0n\u00e1mi, s\u00ed\u00f0an auka teygjuna.

\u00dej\u00e1lfarar sj\u00e1 einnig hva\u00f0a sv\u00e6\u00f0i eru mest flaggu\u00f0 \u00e1 coach dashboard og geta brugist vi\u00f0 me\u00f0 adjusted warm-up fyrir alla h\u00f3pinn.`,
      },
      {
        heading: "MET \u00ed stuttu m\u00e1li",
        body: "1) Far\u00f0u \u00ed teygjust\u00f6\u00f0u. 2) Spenndu gegn vi\u00f0n\u00e1mi \u00ed 5 sek (~20\u201330% af max). 3) Slakka\u00f0u \u00e1 og far\u00f0u d\u00fdpra. 4) Endurtaktu 3 sinnum \u00e1 hvora hli\u00f0. \u00deetta tekur 60 sek\u00fandur \u00e1 hvern v\u00f6\u00f0vah\u00f3p og skilar mun meiri lengingu en sama t\u00edminn \u00ed passive teygju.",
      },
      {
        heading: "Heimildir",
        body: `Kang, Y.-H., Ha, W.-B., Geum, J.-H., Woo, H., Han, Y.-H., Park, S.-H., & Lee, J.-H. (2023). Effect of muscle energy technique on hamstring flexibility: A systematic review and meta-analysis. Healthcare, 11(8), 1089. https://doi.org/10.3390/healthcare11081089

Thomas, E., Cavallaro, A. R., Mani, D., Bianco, A., & Palma, A. (2019). The efficacy of muscle energy techniques in symptomatic and asymptomatic subjects: A systematic review. Chiropractic & Manual Therapies, 27, 35. https://doi.org/10.1186/s12998-019-0258-7

Athugasemd: Heimildir eru settar fram \u00ed APA 7. \u00fatg\u00e1fu st\u00edl; atri\u00f0i voru sannreynd \u00ed g\u00f6gnum \u00fatgefenda og PubMed.`,
      },
    ],
    sectionsEN: [
      {
        heading: "What is MET?",
        body: `Muscle Energy Technique (MET) is an active stretching method where the athlete applies gentle tension against resistance for 5\u20136 seconds, then relaxes and moves deeper into the stretch. Unlike passive stretching, the athlete is an active participant \u2014 the muscle contracts before relaxing, triggering the Golgi tendon reflex and allowing greater elongation.

MET is not new; physiotherapists have used it for decades. Recent research shows it is particularly effective as part of warm-up and cool-down routines for athletes to prevent muscle and soft-tissue injuries.`,
      },
      {
        heading: "Why is MET better than passive stretching?",
        body: `Passive stretching (hold still for 30 sec) temporarily increases range of motion, but research shows the muscle forgets it quickly. MET works differently because it uses isometric contraction to send neural signals to the central nervous system \u2014 that it is safe to lengthen now. This produces more lasting elongation and active range of motion.

Systematic reviews support these effects. Muscle energy techniques reliably increase range of motion and reduce pain across a range of populations (Thomas et al., 2019), and for the hamstrings specifically MET produces greater flexibility gains than passive stretching (Kang et al., 2023). The magnitude varies between studies and individuals, so MET is best seen as a dependable way to build and maintain range of motion rather than a guaranteed injury-reduction protocol.`,
      },
      {
        heading: "How do players use MET in MicroPulse?",
        body: `When a player indicates soreness in a specific muscle group during check-in, MicroPulse sends the appropriate MET exercise to their Today page. For example: if a player writes \u00abstiff behind the thigh\u00bb they receive a Hamstring MET protocol \u2014 3 \u00d7 5 sec tension against resistance, then deepen the stretch.

Coaches also see which areas are most flagged on the coach dashboard and can respond with an adjusted warm-up for the whole group.`,
      },
      {
        heading: "MET in a nutshell",
        body: "1) Get into the stretch position. 2) Push against resistance for 5 sec (~20\u201330% max effort). 3) Relax and go deeper. 4) Repeat 3 times per side. This takes 60 seconds per muscle group and produces far greater elongation than the same time spent in passive stretching.",
      },
      {
        heading: "References",
        body: `Kang, Y.-H., Ha, W.-B., Geum, J.-H., Woo, H., Han, Y.-H., Park, S.-H., & Lee, J.-H. (2023). Effect of muscle energy technique on hamstring flexibility: A systematic review and meta-analysis. Healthcare, 11(8), 1089. https://doi.org/10.3390/healthcare11081089

Thomas, E., Cavallaro, A. R., Mani, D., Bianco, A., & Palma, A. (2019). The efficacy of muscle energy techniques in symptomatic and asymptomatic subjects: A systematic review. Chiropractic & Manual Therapies, 27, 35. https://doi.org/10.1186/s12998-019-0258-7

Note: References are formatted in APA 7th edition style; details verified against publisher and PubMed records.`,
      },
    ],
  },

  {
    slug: "acwr-load-management",
    date: "2026-04-04",
    readMin: 6,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "ACWR og \u00e1lagsstj\u00f3rnun: Hvernig \u00e1 a\u00f0 st\u00fdra \u00fej\u00e1lfunar\u00e1lagi til a\u00f0 koma \u00ed veg fyrir mei\u00f0sli",
    titleEN: "ACWR and Load Management: How to Manage Training Load to Prevent Injuries",
    summaryIS:
      "Acute:Chronic Workload Ratio (ACWR) er eitt mikilv\u00e6gasta t\u00f3li\u00f0 \u00ed n\u00fat\u00edma \u00ed\u00fer\u00f3ttum til a\u00f0 meta mei\u00f0slah\u00e6ttu. H\u00e9r er hvernig \u00fej\u00e1lfarar geta n\u00fdtt s\u00e9r ACWR \u00e1 \u00e1hrifa\u00edr\u00edkan h\u00e1tt.",
    summaryEN:
      "The Acute:Chronic Workload Ratio (ACWR) is one of the most important tools in modern sport for assessing injury risk. Here is how coaches can use it effectively.",
    sectionsIS: [
      {
        heading: "Hva\u00f0 er ACWR?",
        body: `ACWR er hlutfall milli n\u00fdlegs \u00e1lags (acute, s\u00ed\u00f0ustu 7 dagar) og langt\u00edma\u00e1lags (chronic, s\u00ed\u00f0ustu 28 dagar). Ef hlutfalli\u00f0 er 1.0 \u00fe\u00fd\u00f0ir \u00fea\u00f0 a\u00f0 leikma\u00f0ur er a\u00f0 \u00fej\u00e1lfast \u00e1 sama stigi og hann hefur veri\u00f0 undanfarnar vikur.

Tim Gabbett og samstarfsf\u00f3lk vins\u00e6ldu bili\u00f0 0.8\u20131.3 sem \u201evenjulegt" \u00e1lagsbreytinga-bil. En ACWR er ekki sta\u00f0fest mei\u00f0sla-sp\u00e1 \u2014 n\u00fdrri ranns\u00f3knir (Impellizzeri o.fl. 2020) s\u00fdna a\u00f0 \u00fea\u00f0 er t\u00f6lfr\u00e6\u00f0ilega galla\u00f0 og sp\u00e1ir ekki \u00e1rei\u00f0anlega fyrir um mei\u00f0sli. R\u00e9ttari lesning: ACWR m\u00e6lir ST\u00c6R\u00d0 \u00e1lagsst\u00f6kks. \u00dea\u00f0 sem raunverulega skiptir m\u00e1li fyrir mei\u00f0sli er hvort st\u00f6kki\u00f0 \u00fdtir \u00ed\u00fer\u00f3ttamanninum inn \u00e1 \u00f3\u00feekkt \u00e1lag sem l\u00edkaminn er ekki undirb\u00fainn fyrir (Gabbett & Hulin 2016 \u2014 \u201e\u00fea\u00f0 er ekki \u00e1lagi\u00f0 sj\u00e1lft heldur hvernig \u00fe\u00fa kemst \u00feanga\u00f0").`,
      },
      {
        heading: "Hvers vegna load spikes eru h\u00e6ttulegir",
        body: `Algengasta mei\u00f0slaors\u00f6kin \u00ed h\u00f3p\u00ed\u00fer\u00f3ttum er skyndileg aukning \u00e1 \u00fej\u00e1lfunar\u00e1lagi \u2014 svokalla\u00f0ir load spikes. D\u00e6mi: leikma\u00f0ur kemur af mei\u00f0slum e\u00f0a fr\u00edi og fer beint \u00ed fullrar \u00e6fingar. ACWR hans fer fr\u00e1 0.5 upp \u00ed 1.8 \u00e1 einni viku.

\u00deetta \u00e1 ekki bara vi\u00f0 um GPS-\u00e1lag heldur l\u00edka RPE (perceived exertion). MicroPulse reiknar ACWR \u00fat fr\u00e1 b\u00e6\u00f0i GPS acute/chronic load og RPE-g\u00f6gnum til a\u00f0 gefa heildarbynd.`,
      },
      {
        heading: "Hvernig nota \u00fej\u00e1lfarar ACWR \u00ed MicroPulse?",
        body: `\u00c1 coach dashboard s\u00e9st ACWR fyrir hvern leikmann me\u00f0 litak\u00f3\u00f0um: bl\u00e1r (< 0.8, l\u00edti\u00f0 \u00e1lag), gr\u00e6nn (0.8\u20131.3, kj\u00f6rsv\u00e6\u00f0i), gulur (1.3\u20131.5, h\u00e6kka\u00f0), rau\u00f0ur (> 1.5, h\u00e1tt). \u00dej\u00e1lfarar geta s\u00e9\u00f0 trend yfir vikur og brugist vi\u00f0 \u00e1\u00f0ur en \u00e1lag ver\u00f0ur of miki\u00f0.

Kerfi\u00f0 flaggar l\u00edka sj\u00e1lfvirkt leikmenn sem eru \u00ed danger zone og leggur til reduced load e\u00f0a batadag. \u00deetta er s\u00e9rstaklega gagnlegt \u00e1 \u00fe\u00e9ttum leikt\u00edmabilum \u00fear sem bati milli leikja er stutt.`,
      },
      {
        heading: "R\u00e1\u00f0leggingar",
        body: "Aldrei auka viku\u00e1lag um meira en 10% fr\u00e1 viku til viku. Halda ACWR \u00e1 bilinu 0.8\u20131.3 eins og h\u00e6gt er. Nota chronic load sem fitness shield \u2014 leikmenn sem eru vel \u00fej\u00e1lfa\u00f0ir (h\u00e6rra chronic load) \u00feola meira acute \u00e1lag. Fylgjast s\u00e9rstaklega me\u00f0 leikm\u00f6nnum sem koma af mei\u00f0slum e\u00f0a fr\u00edum \u2014 \u00feeir hafa l\u00e6gra chronic load og eru vi\u00f0kv\u00e6mari.",
      },
      {
        heading: "Heimildir",
        body: `Gabbett, T. J. (2016). The training\u2013injury prevention paradox: Should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273\u2013280. https://doi.org/10.1136/bjsports-2015-095788

Hulin, B. T., Gabbett, T. J., Lawson, D. W., Caputi, P., & Sampson, J. A. (2016). The acute:chronic workload ratio predicts injury: High chronic workload may decrease injury risk in elite rugby league players. British Journal of Sports Medicine, 50(4), 231\u2013236. https://doi.org/10.1136/bjsports-2015-094817

Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J. (2020). Acute:chronic workload ratio: Conceptual issues and fundamental pitfalls. International Journal of Sports Physiology and Performance, 15(6), 907\u2013913. https://doi.org/10.1123/ijspp.2019-0864

Athugasemd: Heimildir eru settar fram \u00ed APA 7. \u00fatg\u00e1fu st\u00edl; atri\u00f0i voru sannreynd \u00ed g\u00f6gnum \u00fatgefenda og PubMed.`,
      },
    ],
    sectionsEN: [
      {
        heading: "What is ACWR?",
        body: `ACWR is the ratio between recent workload (acute, last 7 days) and long-term workload (chronic, last 28 days). A ratio of 1.0 means the player is training at the same level they have been over recent weeks.

Tim Gabbett and colleagues popularised the 0.8\u20131.3 band as a "familiar" load-change range. But ACWR is not a validated injury predictor \u2014 later work (Impellizzeri et al. 2020) shows it is statistically flawed and does not reliably forecast injury. The honest reading: ACWR measures the SIZE of a load spike. What actually matters for injury is whether that spike pushes the athlete into unfamiliar load their body isn't prepared for (Gabbett & Hulin 2016 \u2014 "it's not the workload itself, but how you get there").`,
      },
      {
        heading: "Why spikes are dangerous",
        body: `The most common injury cause in team sports is a sudden increase in training load \u2014 so-called load spikes. Example: a player returns from injury or break and goes straight into full training. Their ACWR goes from 0.5 to 1.8 in one week.

This applies not only to GPS load but also RPE (perceived exertion). MicroPulse calculates ACWR from both GPS acute/chronic load and RPE data to provide a complete picture.`,
      },
      {
        heading: "How coaches use ACWR in MicroPulse",
        body: `On the coach dashboard, ACWR for each player is shown with color codes: blue (< 0.8, low load), green (0.8\u20131.3, optimal zone), yellow (1.3\u20131.5, elevated), red (> 1.5, high). Coaches can see trends over weeks and respond before load becomes excessive.

The system also automatically flags players in the danger zone and suggests reduced load or recovery days. This is especially useful during congested fixture periods where recovery time between matches is short.`,
      },
      {
        heading: "Key recommendations",
        body: "Never increase weekly load by more than 10% week-to-week. Keep ACWR between 0.8\u20131.3 as much as possible. Use chronic load as a fitness shield \u2014 well-trained players (higher chronic load) tolerate more acute load. Pay special attention to players returning from injury or breaks \u2014 they have lower chronic load and are more vulnerable.",
      },
      {
        heading: "References",
        body: `Gabbett, T. J. (2016). The training–injury prevention paradox: Should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280. https://doi.org/10.1136/bjsports-2015-095788

Hulin, B. T., Gabbett, T. J., Lawson, D. W., Caputi, P., & Sampson, J. A. (2016). The acute:chronic workload ratio predicts injury: High chronic workload may decrease injury risk in elite rugby league players. British Journal of Sports Medicine, 50(4), 231–236. https://doi.org/10.1136/bjsports-2015-094817

Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J. (2020). Acute:chronic workload ratio: Conceptual issues and fundamental pitfalls. International Journal of Sports Physiology and Performance, 15(6), 907–913. https://doi.org/10.1123/ijspp.2019-0864

Note: References are formatted in APA 7th edition style; details verified against publisher and PubMed records.`,
      },
    ],
  },

  {
    slug: "ssg-design-thjalfun",
    date: "2026-04-02",
    readMin: 5,
    category: "thjalfunarfraedi",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "Small-Sided Games: Hvernig leikmannfj\u00f6ldi og vellirst\u00e6r\u00f0 breyta \u00e1laginu",
    titleEN: "Small-Sided Games: How Player Count and Pitch Size Change the Training Stimulus",
    summaryIS:
      "Small-sided games (SSG) eru kjarninn \u00ed n\u00fat\u00edma f\u00f3tbolta\u00fej\u00e1lfun. En hvernig breytir 3v3 \u00e1 litlum velli samanbori\u00f0 vi\u00f0 5v5 \u00e1 st\u00f3rum? H\u00e9r er ranns\u00f3knin \u00e1 bak vi\u00f0 drill-h\u00f6nnunina.",
    summaryEN:
      "Small-sided games (SSG) are the backbone of modern football training. But how does 3v3 on a small pitch compare to 5v5 on a large one? Here is the science behind drill design.",
    sectionsIS: [
      {
        heading: "Af hverju SSG?",
        body: `Small-sided games eru leikjatengd \u00fej\u00e1lfun \u00fear sem leikmenn \u00fej\u00e1lfast \u00ed minni h\u00f3pum \u00e1 minna sv\u00e6\u00f0i. Ranns\u00f3knir s\u00fdna a\u00f0 SSG \u00fej\u00e1lfa b\u00e6\u00f0i l\u00edkamlega (aerobic/anaerobic) og t\u00e6knilega \u00fe\u00e6tti samtimis \u2014 eitthva\u00f0 sem hef\u00f0bundin \u00fej\u00e1lfun n\u00e6r ekki.

Kosturinn er a\u00f0 leikma\u00f0urinn f\u00e6r miklu fleiri snertingar \u00e1 boltann, fleiri 1v1 a\u00f0st\u00e6\u00f0ur, og h\u00e6rri hjartsl\u00e1ttart\u00ed\u00f0ni en \u00ed 11v11 leik \u00e1 sama t\u00edma.`,
      },
      {
        heading: "Leikmannafjoldi og \u00e1hrif",
        body: `F\u00e6rri leikmenn = h\u00e6rra \u00e1lag \u00e1 hvern. 2v2 og 3v3 er n\u00e1l\u00e6gt 90% af HRmax, \u00e1 me\u00f0an 5v5 og 6v6 liggur n\u00e6r 80\u201385% HRmax. En \u00feetta er ekki jafn einfalt og \u00fea\u00f0 hlj\u00f3mar \u2014 flatarm\u00e1l \u00e1 leikmann skiptir miklu m\u00e1li.

Ef \u00fe\u00fa ert me\u00f0 3v3 \u00e1 mj\u00f6g litlum velli (< 50 m\u00b2 per leikmann) ver\u00f0ur leikurinn boltahald og stutt sprettir. Ef v\u00f6llurinn er st\u00f3r (> 150 m\u00b2 per leikmann) ver\u00f0a meiri langar hlaup og aerobic \u00e1lag.`,
      },
      {
        heading: "Flatarm\u00e1l per leikmann \u2014 gullna reglan",
        body: `Systematic review fr\u00e1 Sarmento et al. (2018) s\u00fdndi a\u00f0 gullna sv\u00e6\u00f0i\u00f0 fyrir h\u00e1marks \u00e1lag er 75\u2013150 m\u00b2 per leikmann. Undir 75 m\u00b2 minnkar hlaup\u00e1lag (of \u00fe\u00e9tt), yfir 200 m\u00b2 minnkar intensity vegna \u00feess a\u00f0 a\u00f0ger\u00f0ir ver\u00f0a of dreifar.

MicroPulse drill-v\u00e9lsmi\u00f0ja reiknar \u00feetta sj\u00e1lfvirkt: \u00fe\u00fa sl\u00e6r inn leikmannafjolda og vellirst\u00e6r\u00f0 og kerfi\u00f0 gefur estimated %HRmax, hra\u00f0apr\u00f3f\u00edl og \u00e1lagsflokk.`,
      },
      {
        heading: "Hagn\u00fdt r\u00e1\u00f0",
        body: "Viltu h\u00e6rra aerobic \u00e1lag? Auktu vellirst\u00e6r\u00f0ina og minnka\u00f0u leikmannafjolda (3v3 \u00e1 40\u00d730m). Viltu fleiri snertingar og t\u00e6knilegt \u00e1lag? Minnka\u00f0u vellinn og auk leikmannafjolda (5v5 \u00e1 30\u00d720m). Viltu herma eftir leik? 6v6 \u00e1 50\u00d735m er n\u00e1l\u00e6gt raunveruleiknum \u00ed \u00e1lagsformi. Nota\u00f0u MicroPulse SSG reikni\u00e9lina \u00e1 drill flipanum til a\u00f0 sj\u00e1 \u00e1hrif \u00fessara breyta \u00e1\u00f0ur en \u00fe\u00fa hannar \u00e6finguna.",
      },
      {
        heading: "Heimildir",
        body: `Sarmento, H., Clemente, F. M., Harper, L. D., Costa, I. T. da, Owen, A., & Figueiredo, A. J. (2018). Small-sided games in soccer \u2013 a systematic review. International Journal of Performance Analysis in Sport, 18(5), 693\u2013749. https://doi.org/10.1080/24748668.2018.1517288

Athugasemd: Heimildir eru settar fram \u00ed APA 7. \u00fatg\u00e1fu st\u00edl; atri\u00f0i voru sannreynd \u00ed g\u00f6gnum \u00fatgefenda.`,
      },
    ],
    sectionsEN: [
      {
        heading: "Why SSG?",
        body: `Small-sided games are game-based training where players train in smaller groups on reduced pitch sizes. Research shows SSG train both physical (aerobic/anaerobic) and technical aspects simultaneously \u2014 something traditional training cannot match.

The advantage is that each player gets far more touches on the ball, more 1v1 situations, and higher heart rates than in 11v11 play over the same time period.`,
      },
      {
        heading: "Player count and its effects",
        body: `Fewer players = higher load per player. 2v2 and 3v3 reaches close to 90% HRmax, while 5v5 and 6v6 sits around 80\u201385% HRmax. But it is not as simple as it sounds \u2014 area per player matters significantly.

If you run 3v3 on a very small pitch (< 50 m\u00b2 per player), the game becomes ball retention with short sprints. If the pitch is large (> 150 m\u00b2 per player), there are more long runs and aerobic load.`,
      },
      {
        heading: "Area per player \u2014 the golden rule",
        body: `A systematic review by Sarmento et al. (2018) showed the sweet spot for maximum load is 75\u2013150 m\u00b2 per player. Below 75 m\u00b2, running load decreases (too congested). Above 200 m\u00b2, intensity drops because actions become too dispersed.

The MicroPulse drill engine calculates this automatically: you enter player count and pitch size and the system gives you estimated %HRmax, speed profile, and load category.`,
      },
      {
        heading: "Practical tips",
        body: "Want higher aerobic load? Increase pitch size and reduce player count (3v3 on 40\u00d730m). Want more touches and technical load? Shrink the pitch and increase player count (5v5 on 30\u00d720m). Want to simulate match conditions? 6v6 on 50\u00d735m approximates real-match load profile. Use the MicroPulse SSG calculator on the drill tab to preview the effects of these variables before designing your session.",
      },
      {
        heading: "References",
        body: `Sarmento, H., Clemente, F. M., Harper, L. D., Costa, I. T. da, Owen, A., & Figueiredo, A. J. (2018). Small-sided games in soccer – a systematic review. International Journal of Performance Analysis in Sport, 18(5), 693–749. https://doi.org/10.1080/24748668.2018.1517288

Note: References are formatted in APA 7th edition style; details verified against publisher records.`,
      },
    ],
  },

  // ── 4. Indoor sports (basketball) ───────────────────────────────────────
  {
    slug: "innanhuss-ithrottir-micropulse",
    date: "2026-04-07",
    readMin: 5,
    category: "alagsstjornun",
    author: "MicroPulse",
    audience: "both",
    titleIS: "MicroPulse fyrir körfubolta: Hvað geta körfuboltalið nýtt í kerfinu?",
    titleEN: "MicroPulse for Basketball: What Can Basketball Teams Use?",
    summaryIS:
      "MicroPulse er ekki bara fyrir fótbolta. Körfuboltalið geta nýtt nánast alla eiginleika kerfisins með sértækum mælikvörðum sem henta innanhússíþróttum.",
    summaryEN:
      "MicroPulse is not just for football. Basketball teams can use nearly all system features with sport-specific metrics designed for indoor environments.",
    sectionsIS: [
      {
        heading: "Innanhúss vs utanhúss: Hvað breytist?",
        body: `Stærsti munurinn er GPS-mælikvarðarnir. Utanhúss (fótbolti) notar hraðasvið, sprettvegalengd og efnaskiptaafl (metabolic power). Innanhúss er GPS-merkið of veikt fyrir þessa mælikvarða, svo við notum í staðinn Player Load, IMA (Inertial Movement Analysis) og stefnubreytingar (COD, Changes of Direction).

Player Load er hröðunarbyggður mælikvarði sem virkar vel innanhúss. IMA-mælikvarðar greina hröðun, hraðaminnkun og stefnubreytingar sem eru lykilþættir í körfubolta. Þetta gefur þjálfurum heildarmynd af álagi á hvern leikmann, jafnvel þótt GPS-merki sé ekki til staðar.`,
      },
      {
        heading: "Körfubolti í MicroPulse",
        body: `Körfuboltalið sjá: Player Load, PL/mín, IMA COD, IMA Accels/Decels, hámarkshraða, heildarvegalengd og stökkfjölda. ACWR er reiknað út frá Player Load í stað heildarvegalengdar.

Algeng meiðslasvæði í körfubolta eru hné (verkur framan á hné), kálfi/hásin, mjóbak og mjöðm. Fix modules-kerfið sendir viðeigandi MET-æfingar þegar leikmaður merkir við þessi svæði.

SSG-reiknivélin á ekki við í körfubolta, en allir aðrir eiginleikar virka: check-in, RPE, FULL/REDUCED/RECOVERY, VALD kraftplata, VBT/GymAware og Adaptive Training Engine.`,
      },
      {
        heading: "Hvað er eins og hvað er ólíkt?",
        body: `Eins: Daglegt check-in, RPE, ACWR (út frá Player Load), FULL/REDUCED/RECOVERY, fix modules, VALD CMJ, VBT, Adaptive Training Engine og leikvikulotur (MD-/+).

Ólíkt: Fótbolti notar hraðasvið, sprettvegalengd og efnaskiptaálag (metabolic load score) sem eiga ekki við innanhúss. Körfubolti notar PL/mín, IMA-mælikvarða og stökkfjölda. SSG-reiknivélin er aðeins fyrir fótbolta.

Catapult innanhússtenging virkar fyrir körfubolta. Kinexon-tenging er í þróun.`,
      },
      {
        heading: "Heimildir",
        body: `Grunnheimildir fyrir hröðunarmælikvarðana sem greinin lýsir (Player Load og IMA):

Boyd, L. J., Ball, K., & Aughey, R. J. (2011). The reliability of MinimaxX accelerometers for measuring physical activity in Australian football. International Journal of Sports Physiology and Performance, 6(3), 311–321. https://doi.org/10.1123/ijspp.6.3.311

Barrett, S., Midgley, A. W., & Lovell, R. J. (2014). PlayerLoad™: Reliability, convergent validity, and influence of unit position during treadmill running. International Journal of Sports Physiology and Performance, 9(6), 945–952. https://doi.org/10.1123/ijspp.2013-0418

Athugasemd: Heimildir eru settar fram í APA 7. útgáfu stíl; atriði voru sannreynd í gögnum útgefenda og PubMed.`,
      },
    ],
    sectionsEN: [
      {
        heading: "Indoor vs outdoor: What changes?",
        body: `The biggest difference is GPS metrics. Outdoor (football) uses velocity bands, sprint distance and metabolic power. Indoor GPS signal is too weak for these metrics, so we use Player Load, IMA (Inertial Movement Analysis) and COD (Changes of Direction) instead.

Player Load is an acceleration-based metric that works well indoors. IMA metrics detect acceleration, deceleration and direction changes that are key in basketball. This gives coaches a complete picture of load per player, even without GPS signal.`,
      },
      {
        heading: "Basketball in MicroPulse",
        body: `Basketball teams see: Player Load, PL/min, IMA COD, IMA Accels/Decels, Max Velocity, Total Distance and Jump Count. ACWR is calculated from Player Load instead of total distance.

Common basketball injury areas are knee (anterior knee pain), calf/Achilles, lower back and hip. The fix modules system sends appropriate MET exercises when a player indicates soreness in these areas.

The SSG calculator does not apply to basketball, but all other features work: check-in, RPE, FULL/REDUCED/RECOVERY, VALD force plate, VBT/GymAware and Adaptive Training Engine.`,
      },
      {
        heading: "What is the same and what is different?",
        body: `Same: Daily check-in, RPE, ACWR (from Player Load), FULL/REDUCED/RECOVERY, fix modules, VALD CMJ, VBT, Adaptive Training Engine, match-week periodization (MD-/+).

Different: Football uses velocity bands, sprint distance and metabolic load score which do not apply indoors. Basketball uses PL/min, IMA metrics and jump count. The SSG drill calculator is football-only.

Catapult indoor integration works for basketball. Kinexon integration is in development.`,
      },
      {
        heading: "References",
        body: `Foundational references for the acceleration-based metrics this article describes (Player Load and IMA):

Boyd, L. J., Ball, K., & Aughey, R. J. (2011). The reliability of MinimaxX accelerometers for measuring physical activity in Australian football. International Journal of Sports Physiology and Performance, 6(3), 311–321. https://doi.org/10.1123/ijspp.6.3.311

Barrett, S., Midgley, A. W., & Lovell, R. J. (2014). PlayerLoad™: Reliability, convergent validity, and influence of unit position during treadmill running. International Journal of Sports Physiology and Performance, 9(6), 945–952. https://doi.org/10.1123/ijspp.2013-0418

Note: References are formatted in APA 7th edition style; details verified against publisher and PubMed records.`,
      },
    ],
  },
  {
    slug: "team-match-insight-hlaup-xg-urslit",
    date: "2026-08-05",
    readMin: 11,
    category: "thjalfunarfraedi",
    author: "MicroPulse",
    audience: "coaches",
    titleIS: "Team Match Insight: að tengja hlaupatölur, xG og úrslit",
    titleEN: "Team Match Insight: connecting running data, xG and results",
    summaryIS:
      "Ný greiningarsíða í MicroPulse les GPS- og IMA-hreyfingu á móti úrslitum leikja og Wyscout-tölfræði (xG). Hér er hvað hún gerir, hvað gögn Breiðabliks sýna — og hvers vegna hún segir aldrei að hlaup valdi sigri.",
    summaryEN:
      "A new analysis screen in MicroPulse reads GPS and IMA movement against match results and Wyscout stats (xG). Here is what it does, what Breiðablik's own data shows — and why it never claims running causes winning.",
    sectionsIS: [
      {
        heading: "Af hverju Team Match Insight?",
        body: `Þjálfarateymi Breiðabliks spurði einfaldrar en djúprar spurningar: er munur á hlaupatölum í sigrum og töpum? Og ef svo er — tengist hann einhverju sem skiptir máli í leiknum sjálfum, eins og færum og marklíkindum (xG)?

Vandinn er að svarið liggur ekki í einum leik. Einn leikur er hávaði: liðið getur hlaupið mikið og tapað, hlaupið lítið og unnið. Team Match Insight safnar saman öllum leikjum tímabilsins, les GPS- og IMA-hreyfingu hvers leiks á móti úrslitum og Wyscout-tölfræði, og dregur fram mynstrin sem sjást fyrst þegar nógu margir leikir eru komnir saman. Þetta er lýsandi lag (descriptive) — það hjálpar þér að skilja hvernig liðið spilar, án þess að snerta daglegu ákvörðunina um hver er grænn, gulur eða rauður.`,
      },
      {
        heading: "Hvað síðan gerir",
        body: `Team Match Insight sameinar tvo gagnaheima sem venjulega búa hvor í sínu kerfi: líkamlegt álag (GPS/IMA úr Catapult) og leikframmistöðu (úrslit + Wyscout-tölfræði). Hún birtir fjögur lög:

Fyrri hálfleikur vs venjan. Hlaupatölur síðasta leiks bornar saman við eðlilegt viðmið liðsins — sást óvenjulegt fall eða toppur í fyrri hálfleik?

Sigrar vs töp. Hreyfimælikvarðar flokkaðir eftir úrslitum (W/D/L) með áhrifastærð (Cohen's d) fyrir hvern mælikvarða, svo þú sérð hvaða þættir eru raunverulega ólíkir en ekki bara örlítið frábrugðnir.

Fylgni við úrslit. Hver hreyfimælikvarði á móti úrslitastigi (sigur = 1, jafntefli = 0,5, tap = 0), raðað eftir styrk.

xG × hreyfing. Marklíkindi liðsins (xG með og xG á móti) á móti hreyfingu leiksins — þetta lag opnaðist þegar við bættum við niðurhalaðri Wyscout-tölfræði per leik, án nokkurs API.`,
      },
      {
        heading: "Hvað gögn Breiðabliks sýna",
        body: `Yfir 20 leiki þessa tímabils (11 sigrar, 5 jafntefli, 4 töp) er munurinn á sigrum og töpum skýr — og hann liggur í vörninni.

Í sigrum gaf Breiðablik frá sér að meðaltali 1,69 í xG; í töpum 2,84. Á sama tíma lækkaði sóknar-xG liðsins ekki í töpunum — það var í raun ögn hærra (2,15 í töpum á móti 1,79 í sigrum). Með öðrum orðum: liðið skapaði nóg í leikjunum sem það tapaði; það sem breyttist var hvað það gaf frá sér. Þetta er varnarleg saga, og það er nákvæmlega sú tegund innsæis sem hvorki markatafla né hlaupatölur einar og sér gefa þér.

En úrtakið er lítið — aðeins fjögur töp á tímabilinu — svo þetta er vísbending, ekki niðurstaða. Síðan merkir alltaf við þegar tölur byggja á fáum leikjum.

Síðan minnir líka á að úrslit og frammistaða eru ekki það sama. Breiðablik tapaði 4:3 fyrir Fram þrátt fyrir að búa til meira í xG (3,01 á móti 2,77), og vann KR 6:3 þótt liðið væri undir í xG (2,83 á móti 3,59). Einn leikur getur logið; mynstur margra leikja gerir það síður.`,
      },
      {
        heading: "Fylgnigreining: hvað mælist með úrslitum?",
        body: `Við keyrðum Pearson-fylgni hvers mælikvarða á móti úrslitastigi (sigur = 1, jafntefli = 0,5, tap = 0) yfir leiki tímabilsins. Hér eru sterkustu tengslin.

Leiktölfræði (20 leikir):
• Mörk á móti — r = −0,60 (p < 0,01)
• xG á móti — r = −0,47 (p < 0,05)
• Skot á móti — r = −0,39
• xG-munur (fyrir − á móti) — r = +0,28
• xG (fyrir), skot, boltahald, sendingar — r ≈ 0

GPS / IMA (19 leikir með gögnum):
• IMA hraðaminnkun á mínútu — r = −0,55 (p < 0,05)
• IMA hröðun á mínútu — r = −0,42
• Player Load á mínútu — r = −0,23
• Heildarvegalengd á mínútu — r = −0,18
• Háhraðahlaup, sprettir og hámarkshraði — r ≈ 0

Tvennt sker sig úr. Í fyrsta lagi vörnin: mörk á móti og xG á móti eru sterkustu tengslin við úrslit — liðið tapar þegar það gefur frá sér, ekki þegar það skapar lítið. Í öðru lagi hemlun: meiri IMA hraðaminnkun (og hröðun) á mínútu tengist verri úrslitum — líklega vegna þess að lið sem er undir bremsar og eltir meira, sem er afleiðing þess að tapa fremur en orsök.

Það sem er athyglisvert er hvað mælist EKKI: háhraðahlaup, sprettir, sóknar-xG og boltahald hafa nánast enga fylgni við úrslit. Að hlaupa hraðar eða eiga boltann meira segir ekkert um hvort leikurinn vannst.

Fyrirvari: úrtakið er lítið — aðeins þrjú til fjögur töp með gögnum — svo þetta eru vísbendingar en ekki niðurstöður, og fylgni er ekki orsök. Enginn þessara mælikvarða veldur úrslitum; þeir mælast bara saman.`,
      },
      {
        heading: "Hreyfing á móti úrslitum",
        body: `Þegar hreyfimælikvarðar eru lesnir á móti úrslitum koma fram tengsl sem eru rökrétt en verða að skoðast varlega vegna lítils úrtaks. Í gögnum Breiðabliks hallast heildarvegalengd á mínútu og háhraðahlaup á mínútu í átt að betri úrslitum, meðan sumir stefnubreytingaþættir hallast hina áttina. Kerfið reiknar Pearson-fylgni beint úr gögnunum og raðar mælikvörðunum eftir styrk, en það merkir alltaf við þegar úrtakið er of lítið til að treysta tölunni.

Mikilvægt: fylgni við season-xG (uppsafnað per leikmann) er veik — í kringum 0,3 — sem er einmitt það sem búast má við. Að hlaupa meira gerir þig ekki að betri markaskapara; þessir tveir hlutir mælast bara stundum saman. Team Match Insight sýnir þessa veiku fylgni heiðarlega frekar en að fela hana.`,
      },
      {
        heading: "Fylgni er ekki orsök",
        body: `Þetta er kjarninn í því hvernig síðan er hönnuð. Team Match Insight segir aldrei „hlauptu meira og þið vinnið". Hún sýnir samband (association), aldrei orsök og aldrei spá. Ástæðurnar eru þrjár.

Í fyrsta lagi getur þriðji þáttur skýrt bæði: lið sem er undir í leik hleypur oft meira á eftir boltanum, svo mikið hlaup getur verið afleiðing þess að tapa fremur en orsök þess að vinna. Í öðru lagi er úrtakið lítið — um tuttugu leikir — svo einstakir leikir toga fast í tölurnar. Í þriðja lagi er xG sjálft líkan með óvissu, ekki sannleikur.

Þess vegna birtir síðan áhrifastærðir og fylgnitölur með skýrri viðvörun um lítið úrtak, og heldur öllu í lýsandi laginu. Hún hjálpar þjálfara að spyrja betri spurninga — „af hverju gáfum við frá okkur svona mikið í þessum töpum?" — ekki að fá sjálfvirkt svar.`,
      },
      {
        heading: "Hvernig þetta passar við explainability-first",
        body: `Team Match Insight fylgir sömu reglu og allt annað í MicroPulse: eitt kerfi, einn dómur, sýnilegur alls staðar. Þessi síða er samhengislag — hún snertir aldrei readiness-litinn, daglegu ákvörðunina né þjálfunartillöguna. Grænn, gulur og rauður koma áfram úr persónulega viðmiðinu (hvernig dagurinn í dag ber saman við venjuna hjá hverjum leikmanni), ekki úr því hvort liðið vann síðasta leik.

Gögnin bera líka sitt eigið uppruna-merki: hreyfing kemur úr Catapult GPS/IMA, úrslit úr leikjaskránni og xG úr Wyscout-tölfræði sem er hlaðin niður per leik. Þú sérð hvaðan hver tala kemur og hversu fersk hún er. Það er allur tilgangurinn — að þjálfari geti lesið dóminn á sekúndum, séð ástæðuna á eftir, og grafið niður í tölurnar og heimildirnar þegar hann vill.`,
      },
      {
        heading: "Heimildir",
        body: `Impellizzeri, F. M., Marcora, S. M., & Coutts, A. J. (2019). Internal and external training load: 15 years on. International Journal of Sports Physiology and Performance, 14(2), 270–273. https://doi.org/10.1123/ijspp.2018-0935

Bradley, P. S., & Ade, J. D. (2018). Are current physical match performance metrics in elite soccer fit for purpose or is the adoption of an integrated approach needed? International Journal of Sports Physiology and Performance, 13(5), 656–664. https://doi.org/10.1123/ijspp.2017-0433

Gabbett, T. J. (2016). The training—injury prevention paradox: should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280. https://doi.org/10.1136/bjsports-2015-095788

Rathke, A. (2017). An examination of expected goals and shot efficiency in soccer. Journal of Human Sport and Exercise, 12(2proc), S514–S529. https://doi.org/10.14198/jhse.2017.12.Proc2.05

Athugasemd: Tölur um Breiðablik eru reiknaðar úr Wyscout-liðstölfræði per leik (20 leikir á þessu tímabili, 2026) og innri GPS/IMA-gögnum kerfisins. Heimildir eru í APA 7. útgáfu stíl og voru sannreyndar í gögnum útgefenda.`,
      },
    ],
    sectionsEN: [
      {
        heading: "Why Team Match Insight?",
        body: `Breiðablik's coaching staff asked a simple but deep question: is there a difference in running data between wins and losses? And if so, does it connect to anything that matters in the game itself, like chances created and expected goals (xG)?

The catch is that the answer is not in any single match. One match is noise: a team can run a lot and lose, or run little and win. Team Match Insight gathers every match of the season, reads each match's GPS and IMA movement against the result and Wyscout stats, and surfaces the patterns that only appear once enough matches stack up. This is a descriptive layer — it helps you understand how the team plays, without ever touching the daily decision of who is green, amber or red.`,
      },
      {
        heading: "What the screen does",
        body: `Team Match Insight joins two data worlds that normally live in separate systems: physical load (GPS/IMA from Catapult) and match performance (results + Wyscout stats). It shows four layers:

First half vs the norm. Last match's running data compared to the team's normal baseline — was there an unusual drop or spike in the first half?

Wins vs losses. Movement metrics grouped by result (W/D/L) with an effect size (Cohen's d) per metric, so you see which factors are genuinely different rather than only slightly apart.

Correlation with results. Each movement metric against a result score (win = 1, draw = 0.5, loss = 0), ranked by strength.

xG × movement. The team's expected goals (xG for and xG against) against the match's movement — this layer opened up once we added downloaded per-match Wyscout stats, with no API.`,
      },
      {
        heading: "What Breiðablik's data shows",
        body: `Over this season's 20 matches (11 wins, 5 draws, 4 losses) the difference between wins and losses is clear — and it sits in defence.

In wins Breiðablik conceded 1.69 xG on average; in losses, 2.84. At the same time the team's own attacking xG did not drop in the losses — it was in fact slightly higher (2.15 in losses vs 1.79 in wins). In other words: the team created enough in the games it lost; what changed was what it gave up. This is a defensive story, and it is exactly the kind of insight neither the scoreline nor running data alone will give you.

But the sample is small — only four losses this season — so this is a signal, not a verdict. The screen always flags when a number rests on few matches.

The screen also reminds you that results and performance are not the same thing. Breiðablik lost 4:3 to Fram despite creating more in xG (3.01 vs 2.77), and beat KR 6:3 while being out-created on xG (2.83 vs 3.59). One match can lie; a pattern across many matches is far less likely to.`,
      },
      {
        heading: "Correlation analysis: what tracks with results?",
        body: `We ran a Pearson correlation of each metric against a result score (win = 1, draw = 0.5, loss = 0) across this season's matches. Here are the strongest relationships.

Match stats (20 matches):
• Goals conceded — r = −0.60 (p < 0.01)
• xG against — r = −0.47 (p < 0.05)
• Shots against — r = −0.39
• xG difference (for − against) — r = +0.28
• xG (for), shots, possession, passes — r ≈ 0

GPS / IMA (19 matches with data):
• IMA deceleration per minute — r = −0.55 (p < 0.05)
• IMA acceleration per minute — r = −0.42
• Player Load per minute — r = −0.23
• Total distance per minute — r = −0.18
• High-speed running, sprints and top speed — r ≈ 0

Two things stand out. First, defence: goals against and xG against are the strongest relationships with results — the team loses when it gives up chances, not when it creates few. Second, braking: more IMA deceleration (and acceleration) per minute tracks with worse results — most likely because a team that is behind brakes and chases more, which is a consequence of losing rather than a cause.

What is striking is what does NOT track: high-speed running, sprints, attacking xG and possession have almost no correlation with results. Running faster or holding the ball more says nothing about whether the match was won.

Caveat: the sample is small — only three to four losses with data — so these are signals, not verdicts, and correlation is not causation. None of these metrics causes results; they merely coincide.`,
      },
      {
        heading: "Movement against results",
        body: `When movement metrics are read against results, relationships appear that make sense but must be read carefully because of the small sample. In Breiðablik's data, total distance per minute and high-speed running per minute lean toward better results, while some change-of-direction components lean the other way. The system computes Pearson correlations directly from the data and ranks the metrics by strength, but it always flags when the sample is too small to trust the number.

Importantly: the correlation with season xG (accumulated per player) is weak — around 0.3 — which is exactly what you would expect. Running more does not make you a better chance-creator; the two things simply coincide sometimes. Team Match Insight shows that weak correlation honestly rather than hiding it.`,
      },
      {
        heading: "Correlation is not causation",
        body: `This is the heart of how the screen is designed. Team Match Insight never says "run more and you will win." It shows association, never causation and never prediction. There are three reasons.

First, a third factor can explain both: a team that is behind in a game often runs more chasing the ball, so high running can be a consequence of losing rather than a cause of winning. Second, the sample is small — around twenty matches — so individual games pull hard on the numbers. Third, xG itself is a model with uncertainty, not truth.

That is why the screen shows effect sizes and correlations with a clear small-sample caveat, and keeps everything in the descriptive layer. It helps a coach ask better questions — "why did we give up so much in those losses?" — not receive an automatic answer.`,
      },
      {
        heading: "How this fits explainability-first",
        body: `Team Match Insight follows the same rule as everything else in MicroPulse: one system, one verdict, visible everywhere. This screen is a context layer — it never touches the readiness colour, the daily decision, or the training recommendation. Green, amber and red still come from the personal norm (how today compares to each player's usual), not from whether the team won its last match.

The data also carries its own provenance: movement from Catapult GPS/IMA, results from the fixture list, and xG from Wyscout stats downloaded per match. You can see where every number comes from and how fresh it is. That is the whole point — a coach reads the verdict in seconds, sees the reason underneath, and drills into the numbers and the research whenever they want.`,
      },
      {
        heading: "References",
        body: `Impellizzeri, F. M., Marcora, S. M., & Coutts, A. J. (2019). Internal and external training load: 15 years on. International Journal of Sports Physiology and Performance, 14(2), 270–273. https://doi.org/10.1123/ijspp.2018-0935

Bradley, P. S., & Ade, J. D. (2018). Are current physical match performance metrics in elite soccer fit for purpose or is the adoption of an integrated approach needed? International Journal of Sports Physiology and Performance, 13(5), 656–664. https://doi.org/10.1123/ijspp.2017-0433

Gabbett, T. J. (2016). The training—injury prevention paradox: should athletes be training smarter and harder? British Journal of Sports Medicine, 50(5), 273–280. https://doi.org/10.1136/bjsports-2015-095788

Rathke, A. (2017). An examination of expected goals and shot efficiency in soccer. Journal of Human Sport and Exercise, 12(2proc), S514–S529. https://doi.org/10.14198/jhse.2017.12.Proc2.05

Note: Breiðablik figures are computed from per-match Wyscout team stats (this season's 20 matches, 2026) and the system's internal GPS/IMA data. References are formatted in APA 7th edition style and were verified against publisher records.`,
      },
    ],
  },
];

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
