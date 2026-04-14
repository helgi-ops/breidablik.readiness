# MicroPulse — Support-ferli (v1)

Síðast uppfært: 2026-04-14
Ábyrgur: Helgi Gudfinnsson (helgi@metabolic.is)

Þetta er innri handbók fyrir stuðningsferli MicroPulse. Þegar viðskiptavinur sendir póst á `support@metabolic.is`, þá gildir þetta flæði.

---

## 1. Uppsetning netfangsins

**Markmið:** Öll stuðnings-póstur lendi hjá einni manneskju sem lofar svörun innan eins virks dags, og við getum skalað ferlið þegar magnið vex.

### Skref

1. Í Google Workspace admin → búa til alias `support@metabolic.is` sem beinir á `helgi@metabolic.is` (eða á shared mailbox ef fleiri koma inn seinna).
2. Í Gmail → Stillingar → Filtrar → Búa til filter:
   - Skilyrði: `To: support@metabolic.is`
   - Aðgerð: Merkja með label `Support`, halda í Inbox, merkja Important, skip notification snooze.
3. Setja upp vacation/auto-reply (sjá texta að neðan) sem virkar ef svarið tekur meira en 4 klst.

### Auto-reply texti (EN + IS)

```
Hi!

Thanks for reaching out to MicroPulse support. We've received your message
and will respond within one business day (Mon–Fri, 09:00–17:00 GMT).

For urgent issues during a training session, call or text Helgi directly
at +354 XXX-XXXX.

— MicroPulse team

---

Halló!

Takk fyrir að senda á MicroPulse support. Við höfum fengið skilaboðin þín
og svörum innan eins virks dags (mán–fös, 09:00–17:00 GMT).

Fyrir brýn mál á æfingu, hringdu eða sendu SMS á Helga: +354 XXX-XXXX.

— MicroPulse teymið
```

> **TODO:** Uppfæra símanúmerið í auto-reply þegar endanlegt stuðningsnúmer er ákveðið.

---

## 2. SLA (service level agreement)

| Alvarleiki | Skilgreining | Fyrsta svar | Úrlausn (target) |
|---|---|---|---|
| **P0 — Kerfi niðri** | Appið virkar ekki fyrir neinn notanda, eða gagnatap | Strax (á 1 klst) | 4 klst |
| **P1 — Fúnksjón brotin** | Stór feature virkar ekki (t.d. readiness, drill library) | 2 virkar klst | 1 virkur dagur |
| **P2 — Smá bug eða spurning** | Ekki blokker, vandamál eða spurning | 1 virkur dagur | 3 virkir dagar |
| **P3 — Feature request** | Ósk um nýja fúnksjón | 2 virkir dagar | N/A (sett í backlog) |

Ef SLA er ekki hægt að halda, láttu viðskiptavininn vita áður en fresturinn rennur út.

---

## 3. Triage-ferli

Þegar nýr póstur kemur inn á `support@metabolic.is`:

1. **Lesa og flokka** — P0/P1/P2/P3 skv. töflunni að ofan.
2. **Kvittering** — Svara innan SLA með staðfestingu á móttöku og mat á hvenær úrlausn er væntanleg.
3. **Skrá í tracker** — Bæta við Linear (eða Notion/Asana þegar það kemur) sem issue með labels `support` og alvarleika.
4. **Leysa eða eskalera:**
   - P0: Hringja í Helga strax (dag eða nótt).
   - P1: Slack-skilaboð í #micropulse-alerts; byrja úrlausn innan 2 klst.
   - P2/P3: Unnið í næstu sprettum skv. forgangsröðun.
5. **Loka** — Senda staðfestingu á viðskiptavininn þegar málið er leyst, með lýsingu á hvað var gert. Spyrja hvort allt sé í lagi áður en þú lokar.

---

## 4. Eftirfylgni

- **Vikulega** — Fara yfir öll `support`-label issue í Linear, mæla svartíma og flokka þema (UI bug, gagnavandamál, fúnksjón óljós o.s.frv.).
- **Mánaðarlega** — Skrifa stutta samantekt: hve margir tikket, top-3 vandamál, SLA-fylgni. Deila með teyminu.

---

## 5. Escalation contacts

| Role | Nafn | Netfang | Sími |
|---|---|---|---|
| Primary on-call | Helgi Gudfinnsson | helgi@metabolic.is | +354 XXX-XXXX |
| Backup | — | — | — |
| DB/Supabase | Helgi (sama) | — | — |

> **TODO:** Bæta við backup-persónu þegar teymið vex.

---

## 6. Tengt

- Bilunar-email template: `docs/bilunar-email-template.md`
- 60-mín onboarding: `business-docs/60min-onboarding-guide.docx`
- /help route í appinu: `/help`
