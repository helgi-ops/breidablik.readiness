# Fusion — vasa-miði fyrir KSÍ vinnustofuna (heiðarleg mörk)

Til að vita nákvæmlega hvað ég má fullyrða og hvar mörkin liggja. Fyrir þennan hóp byggir nákvæmni
trúverðugleika — ekki stór loforð.

## VIRKAR NÚNA (má sýna / fullyrða — á Vector Pro gögnum, t.d. Breiðablik)
- **Role-demand fit** — passar líkamlega vélin (engine/driver) við kröfur hlutverksins? Validað á 23
  raun-leikmönnum. Physical × hlutverk.
- **Peak-period hreyfi-undirskrift** — hvað er ákafasta mínútan *gerð úr*: sóknar-sprettir fram á við vs
  endurheimtar-hlaup til baka vs fjölstefnu (úr Catapult IMU-stefnu). Byggt + tengt.
- **Player signature** — erkitýpa úr líkamlegu × output.
- **Form vs State** — heldur taktísk framleiðsla (OBV) þegar readiness dettur?

## ER NÁLGUN, EKKI FULL SAMTVINNUN ENN (vertu heiðarlegur)
- Peak-period er **hreyfi-undirskrift úr IMU**, *nálgun* á taktíkinni — **ekki** raunveruleg taktísk
  atburða-tímalína enn. Segðu „hreyfi-undirskrift sem nálgast taktíska samhengið", EKKI „taktísk
  breytu-flokkun".
- Dýpsta útgáfan þarf **Vector Pro (IMU)**. Vector Core lið hafa hana ekki (fá líkamlega álagslagið).

## ER Í VINNSLU — STÓRA SKREFIÐ (metnaðurinn, ekki fullyrðing)
- **Full atburða-samtvinnun:** tímastimplaðir taktískir atburðir á **sömu tímalínu** og líkamlegi
  hámarks-glugginn. **Vélin er þegar byggð og prófuð** (feed-agnostísk); það sem vantar er eitt
  tímastimplað atburða-export (StatsBomb / InStat / Wyscout) + lítill ingester.
- **Heiðarlegt loft:** on-ball aðgerðir (sending, burður, móttaka, pressa, stöðvun) eru útleiðanlegar úr
  atburðum; off-ball/venslaðar (overlap, covering) þurfa tracking/360 → merktar „derived" eða slepptar.
  Enginn endurgerir hand-kóðun greinenda úr atburðum einum — ekki lofa því.

## HEIÐARLEGA LÍNAN (til að segja upphátt)
> „Það sem virkar í dag er að tengja líkamlegu vélina við hlutverkið og sjá hvað ákafasti glugginn er
> gerður úr hreyfi-lega. Þar sem ég er að fara næst er að setja taktísku atburðina á sömu tímalínu og
> líkamlega glugginn — vélin er tilbúin, ég er að tengja atburða-feedið."

## EF SAMTALIÐ FER DJÚPT
- „Hvernig?" → Catapult custom-glugga (klukku-staðsetning) + tímastimplað atburða-feed → sama sekúndu-
  klukka → samtvinnun. Vélin er til; ég er að ingest-a atburðina.
- „Hvað með Core-lið?" → þau fá líkamlega álagslagið; hreyfi-/atburða-dýptin þarf IMU (Vector Pro).
- „Er þetta ekki bara það sama og [X]?" → nei — flestir halda physical og tactical aðskildu; punkturinn
  er skörunin á sömu tímalínu.
