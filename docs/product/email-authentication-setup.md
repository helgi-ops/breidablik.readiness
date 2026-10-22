# Email-uppsetning (SPF / DKIM / DMARC) — svo póstar lendi í innhólfi

Til að tölvupóstar (kynningar OG kerfis-póstar) skili sér en lendi ekki í ruslpósti. Gmail/Yahoo
krefjast nú SPF + DKIM + DMARC fyrir sendendur. Staðan hér að neðan var athuguð 31. ágúst.

## Tvær sendi-leiðir (báðar þurfa vottun)
1. **Kerfis-póstar** (readiness-digest, föstudags-skýrsla, áminningar) — sendir af appinu gegnum
   **Resend** (`RESEND_API_KEY`, from = `REMINDER_EMAIL_FROM`). Þessi póstur er nú þegar að fara út
   sjálfvirkt, svo þetta er brýnt.
2. **Persónulegir kynningar-póstar** (Helgi → klúbbar) — best frá **`helgi@metabolic.is`** gegnum
   Google Workspace.

## Núverandi staða (athugað 31. ágúst)
- `micropulse.is`: SPF = aðeins Cloudflare (móttaka). **Ekkert DKIM, ekkert DMARC.**
- `metabolic.is`: SPF = Google (`include:_spf.google.com`). **Ekkert DKIM (á Google-selector), ekkert DMARC.**

Hvorugt er fullvottað fyrir sendingu → ruslpóst-áhætta.

---

## A) Kerfis-póstar gegnum Resend  (brýnast)
Resend krefst þess að sendi-lénið sé **staðfest (verified) inni í Resend**. Þá gefur Resend þér nákvæmar
DNS-færslur (SPF-include + DKIM) sem þú límir inn.

1. Farðu í **Resend → Domains → Add domain** og settu inn lénið sem `REMINDER_EMAIL_FROM` notar
   (líklega `micropulse.is` eða undirlén eins og `send.micropulse.is`).
2. Resend sýnir 2–3 DNS-færslur (MX/TXT fyrir SPF á sendi-undirléni + tvær DKIM CNAME/TXT). **Límdu þær
   nákvæmlega inn í DNS (Cloudflare).** Ekki búa þær til sjálfur — notaðu það sem Resend gefur.
3. Ýttu á **Verify** í Resend. Þegar grænt → kerfis-póstar eru SPF+DKIM-vottaðir.

> Athugið: Cloudflare Email Routing (núverandi MX á micropulse.is) sér BARA um móttöku — það sendir
> ekki. Resend er sendingin. Notaðu helst sendi-undirlén (`send.micropulse.is`) svo móttöku-SPF og
> sendi-SPF stangist ekki á; Resend leiðir þig í gegnum það.

## B) Kynningar-póstar frá metabolic.is (Google Workspace)
1. **Virkja DKIM:** Google Admin → **Apps → Google Workspace → Gmail → Authenticate email** → veldu
   `metabolic.is` → **Generate new record** → afritaðu TXT-færsluna sem birtist (selector oftast
   `google._domainkey`) → límdu í DNS → farðu til baka í Google Admin og ýttu **Start authentication**.
2. **SPF:** er þegar í lagi (`v=spf1 mx include:_spf.google.com ~all`).

## C) DMARC — bæði lén (ein færsla hvort)
Bættu þessari TXT-færslu við (host/name = `_dmarc`):

```
Nafn:  _dmarc.metabolic.is       Tegund: TXT
Gildi: v=DMARC1; p=none; rua=mailto:helgi@metabolic.is; fo=1
```
```
Nafn:  _dmarc.micropulse.is      Tegund: TXT
Gildi: v=DMARC1; p=none; rua=mailto:support@micropulse.is; fo=1
```

Byrjaðu á `p=none` (aðeins vöktun + skýrslur). Eftir 2–4 vikur, þegar SPF+DKIM standast örugglega,
hertu í `p=quarantine` og síðar `p=reject`.

## Röð + staðfesting
1. A (Resend verify) — brýnast, kerfis-póstar fara nú þegar út.
2. B (Google DKIM) — fyrir kynningar-póstana.
3. C (DMARC á bæði lén) — eftir að SPF+DKIM eru komin.
4. **Prófa:** sendu prufu-póst á [mail-tester.com](https://www.mail-tester.com) og stefndu á 10/10, eða
   skoðaðu SPF/DKIM/DMARC á [MXToolbox](https://mxtoolbox.com/SuperTool.aspx). Athugaðu líka DMARC-
   skýrslurnar sem berast í `rua`-netfangið eftir nokkra daga.

## Í millitíðinni
Þar til A+B+C eru komin: sendu kynningar-póstana frá **`helgi@metabolic.is`** (rótgróið Google-lén,
SPF í lagi) með `support@micropulse.is` sem svar-/tengiliðanetfang — það er öruggara en að senda beint
frá micropulse.is.

Ref: `sendTransactionalEmail.ts` (Resend), DNS-athugun 31. ágúst (SPF/DKIM/DMARC staða beggja léna).
