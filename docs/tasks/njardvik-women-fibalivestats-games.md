# Njarðvík (konur) — FIBA LiveStats leikir (KKÍ, org `KKI`)

Staðfestir Njarðvíkur-kvennaleikir í FIBA LiveStats. Hver leikur hefur 5 view-síður
(`bs` box score · `lds` leaders · `pbp` play-by-play · `sc` shot chart · `st` stats) og JSON-fóðrið
(`/data/{id}/data.json`) sem MicroPulse les.

Host: `https://fibalivestats.dcd.shared.geniussports.com`

## 2025-26 — Úrvalsdeild kvenna, úrslitaserían vs Haukar (4 leikir, samliggjandi IDs)

Njarðvík vann seríuna 3–1.

**2846519** — Haukar 80 – Njarðvík 92 (útisigur NJA)
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846519/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846519/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846519/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846519/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846519/st.html

**2846520** — Njarðvík 75 – Haukar 70
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846520/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846520/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846520/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846520/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846520/st.html

**2846521** — Haukar 77 – Njarðvík 69 (eina tapið)
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846521/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846521/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846521/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846521/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846521/st.html

**2846522** — Njarðvík 95 – Haukar 70 (17. maí 2026, IceMar-höllin)
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846522/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846522/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846522/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846522/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846522/st.html

## 2021-22 — Subway deild kvenna (deildarleikir, annar ID-hópur)

**1891641** — Njarðvík 79 – Grindavík 85
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891641/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891641/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891641/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891641/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891641/st.html

**1891646** — Valur 76 – Njarðvík 66
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891646/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891646/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891646/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891646/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891646/st.html

**1891650** — Njarðvík 82 – Breiðablik 55 (23. mars 2022, Ljónagryfjan)
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891650/bs.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891650/lds.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891650/pbp.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891650/sc.html
- https://fibalivestats.dcd.shared.geniussports.com/u/KKI/1891650/st.html

## Fyrir ingestion (Code)

JSON-fóðrið á sama host: `.../data/{id}/data.json`  (t.d.
`https://fibalivestats.dcd.shared.geniussports.com/data/2846522/data.json`). Þetta er slóðin sem parserinn
les — box score + play-by-play með skot-hnitum. `bs/lds/pbp/sc/st.html` eru bara human-view síður.

**Athugið um ID-hópa:** leikir í sömu seríu/umferð fá samliggjandi IDs (úrslitaserían = 2846519–522), en
mismunandi tímabil/umferðir eru í allt öðrum tölusviðum (2021-22 = 1891xxx). Það er ekkert opinbert
KKÍ-leikjaskrá-JSON sem brúar fixtures → FIBA-id, svo enumeration er handvirk (líma inn URL per leik).
