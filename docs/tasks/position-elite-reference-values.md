# Elite positional reference values (for the ELITE_REFERENCE column)

Companion data for `position-fitness-requirements-*`. These are **elite men's match DEMANDS by
position** — the aspiration/reference column. Squad/league-relative stays the pass/fail; these are
what "elite in this position" looks like. All cited. Values vary by league/season/tracking system, so
store them `provisional: true` and let the S&C tune.

**Useful anchor:** Bradley 2009 defines high-intensity running as **> 19.8 km/h — the exact HSR
threshold MicroPulse already uses**. So a Breiðablik player's own HSR metres are directly comparable to
these elite positional numbers (no rescaling).

## High-intensity running (> 19.8 km/h), metres per match — Bradley et al. 2009 (EPL)

| JuGroup (MicroPulse) | Position in study | Elite HI-running (m) |
|---|---|---|
| AM (wide) | Wide midfielders | **3,138** (highest) |
| CM | Central midfielders | 2,825 |
| FB | Full-backs | 2,605 |
| CF | Attackers | 2,341 |
| CB | Central defenders | 1,834 (lowest) |

Maps to the `peak_demands` / high-speed-running side. Order of positional demand is the key signal.

## Total distance & high-speed/sprint distance — Di Salvo et al. 2007 (La Liga)

- **Total distance** (aerobic/volume demand → `aerobic_endurance` context): central midfielders
  **12,027 m** (highest), wide midfielders 11,990 m, central defenders **10,627 m** (lowest).
- **High-speed running (19.1–23.0 km/h):** wide midfielders **738 m** vs central defenders **397 m**.
- **Sprinting (> 23.0 km/h → `speed`/MSS demand):** wide midfielders **446 m** vs central defenders
  **215 m**; external defenders, external midfielders and forwards did **not** differ significantly
  (all high). So the sprint/top-speed requirement is high for FB, wide-AM and CF; low for CB and CM.

## MSS / MAS / ASR by position — keep tunable

Exact elite MAS/MSS/ASR by position are not cleanly established across elite studies. The clearest
positional split (Öztürk et al., amateur football, JERP) confirms the **shape**: wide/attacking
positions carry the larger **Anaerobic Speed Reserve** (bigger MSS above MAS), central midfielders the
higher **MAS** (aerobic), central defenders the lower HSR/sprint demand. Use this to set the *relative*
ordering of the MSS (`speed`) and MAS (`aerobic_endurance`) reference bars per position, and leave the
absolute km/h numbers as coach-tunable placeholders — don't present a single elite MAS-by-position
figure as authoritative.

## Suggested ELITE_REFERENCE shape (per JuGroup)

Populate only the qualities each position actually demands (from `roleModel` weights):

- **AM (wide) / FB:** high `speed` (sprint) + high HI-running (`peak_demands`); FB also high
  `aerobic_endurance` (all-round). Elite HI-run 2.6–3.1 km.
- **CM:** highest `aerobic_endurance` / volume (12.0 km total); moderate `speed`. Elite HI-run 2.8 km.
- **CF:** high `speed` (sprint 446 m tier); moderate volume. Elite HI-run 2.3 km.
- **CB:** lowest `speed`/HSR demand; `acceleration` + aerial/robustness matter more. Elite HI-run 1.8 km.

Card copy: label these "elite men's match demands (reference)", cite Di Salvo 2007 / Bradley 2009, and
keep the squad/league bar as the pass/fail — the elite bar is the gap-to-aspiration only.

## Sources

- Di Salvo et al. 2007, *Performance Characteristics According to Playing Position in Elite Soccer*, Int J Sports Med 28:222–227.
- Bradley et al. 2009, *High-intensity running in English FA Premier League soccer matches*, J Sports Sci.
- Öztürk et al., *Comparison of Maximal Sprint Speed, Maximal Aerobic Speed, Anaerobic Speed Reserve and VO2max by position* (amateur football), JERP.
- Bush et al. 2015, *Evolution of match performance parameters for various playing positions in the EPL*.
