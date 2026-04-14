# Bilunar-email template (outage communication)

Síðast uppfært: 2026-04-14
Ábyrgur: Helgi Gudfinnsson

Notaðu þessar templates þegar MicroPulse er niðri eða með alvarlegan galla. Markmiðið er að halda viðskiptavinum upplýstum — ekki falin rof, ekki óútskýrð töf.

---

## Hvenær á að senda?

| Atburður | Senda til | Hvenær |
|---|---|---|
| **P0 — Kerfi niðri** (app svarar ekki, login bilar, allir notendur fyrir áhrifum) | Öllum club-admin á þeim plönum sem eru fyrir áhrifum | **Strax og staðfest** — senda "Incident started" innan 15 mín |
| **Stór feature brotin** (readiness, drill library, session planning) | Admin allra klúbba | Innan 30 mín frá staðfestingu |
| **Planned maintenance** | Öllum admin | 48 klst fyrirfram, svo aftur 24 klst fyrir |
| **Data incident** (gagnatap, öryggisbrot) | Admin + lögfræðingur ef við á | Strax og staðfest |

---

## Template 1: Incident started (P0)

**Subject (EN):** MicroPulse is currently experiencing an outage
**Subject (IS):** MicroPulse er niðri — við erum að skoða

```
Hi [name],

We're writing to let you know that MicroPulse is currently unavailable.

  • Started:   [UTC time]
  • Impact:    [describe — e.g., all coach and player logins, or specific feature]
  • Affected:  [who — all users, or specific clubs/tiers]
  • Status:    Investigating

Our team is actively working on the issue. We'll send another update within
60 minutes, or sooner if we have news.

You can check live status at [status.metabolic.is or similar] — or just reply
to this email if you have questions.

We're sorry for the disruption and appreciate your patience.

— MicroPulse team
```

```
Halló [nafn],

Við viljum láta þig vita að MicroPulse er sem stendur ekki aðgengilegt.

  • Byrjaði:   [UTC-tími]
  • Áhrif:     [lýsing — t.d. allir þjálfara- og leikmannalogins, eða tiltekin fúnksjón]
  • Fyrir áhrifum: [hverjir — allir notendur, eða tilteknir klúbbar/tier]
  • Staða:     Í athugun

Teymið okkar vinnur að lausn. Við sendum næstu uppfærslu innan 60 mínútna,
eða fyrr ef eitthvað breytist.

Þú getur séð stöðuna í rauntíma á [status.metabolic.is eða sambærilegt] —
eða svarað þessum pósti með spurningum.

Við biðjumst afsökunar á rofinu og þökkum þolinmæðina.

— MicroPulse teymið
```

---

## Template 2: Incident update (meðan enn er rof)

**Subject:** [UPDATE] MicroPulse outage — [stutt lýsing]

```
Hi [name],

Update on the MicroPulse outage that started at [time]:

  • Status:     [Identified / Mitigating / Monitoring]
  • What we know:
       — [bullet on root cause if identified]
       — [bullet on what's working, what's still down]
  • What we're doing:
       — [concrete action]
  • Next update: [time, max 60 min away]

— MicroPulse team
```

---

## Template 3: Resolved

**Subject:** [RESOLVED] MicroPulse is back online

```
Hi [name],

MicroPulse is back online as of [time]. Downtime was [X] minutes.

  • Root cause:     [one-line summary — e.g., database connection pool exhausted]
  • User impact:    [what users saw — e.g., 500 errors on /coach/*, no data loss]
  • What we did:    [one-line fix — e.g., restarted the connection pool, scaled up]
  • Preventing it:  [one-line on follow-up — e.g., adding alerting for pool saturation]

A full post-mortem will follow within 72 hours for any P0 incident.

Please let us know if you're still seeing issues on your end.

Thanks again for your patience.

— MicroPulse team
```

---

## Template 4: Planned maintenance

**Subject:** Scheduled MicroPulse maintenance — [date, local time]

```
Hi [name],

We'll be doing scheduled maintenance on MicroPulse on [date] from [start]
to [end] [timezone].

  • Expected downtime:   [X] minutes
  • What we're doing:    [short description — e.g., upgrading Postgres to v16]
  • User impact:         [none / brief login interruption / read-only mode]

No action is required from you. We chose this window to minimise disruption
based on historical usage (low activity).

If the timing is a problem for a session you've planned, reply to this email
and we'll see if we can move it.

— MicroPulse team
```

---

## Hvernig á að velja viðtakendur?

Þar til við höfum alvöru subscriber-lista fyrir status page:

- Query í Supabase: `select email from profiles where role in ('coach', 'admin') and team_id in (...)` fyrir þá sem eru fyrir áhrifum.
- Bcc (aldrei cc) þegar sendur er massi.
- Nota Gmail "Mail Merge" eða sambærilegt til að geta persónustillt [name].

---

## Post-mortem (P0 incident)

Innan 72 klst frá úrlausn P0 incident, skrifaðu post-mortem sem inniheldur:

1. **Tímalína** — Hvað gerðist, hvenær, hverjir voru á vakt.
2. **Root cause** — Hvað orsakaði rofið.
3. **Detection** — Hvernig uppgötvuðum við? Hversu lengi var á milli þess sem rofið hófst og við vissum?
4. **Resolution** — Hvað gerðum við til að laga?
5. **Impact** — Hver voru áhrifin á notendur og viðskipti?
6. **Action items** — Hvað gerum við til að fyrirbyggja endurtekningu? Hver og hvenær.
7. **Birt með öllum admin-notendum** ef viðskipti voru fyrir áhrifum.

---

## Tengt

- Support-ferli: `docs/support-ferli.md`
- /help route í appinu: `/help`
