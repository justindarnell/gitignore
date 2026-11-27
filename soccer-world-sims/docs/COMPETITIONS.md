# Competition rules and simplifications

All rules live in `src/data/england/config.ts`.

## Leagues

| Division | Clubs | Games | Promotion | Play-offs | Relegation |
|---|---:|---:|---|---|---|
| Premier League | 20 | 38 | — | — | bottom 3 |
| Championship | 24 | 46 | top 2 | **3rd–8th (new for 2026/27)** | bottom 3 |
| League One | 24 | 46 | top 2 | 3rd–6th | bottom 4 |
| League Two | 24 | 46 | top 3 | 4th–7th | bottom 2 |
| National League | 24 | 46 | champions | 2nd–7th | none (bottom of the playable pyramid) |

* Win 3 points, draw 1. Tiebreakers in order: points, goal difference, goals scored, head-to-head
  points, head-to-head goal difference, head-to-head away goals, wins, then a seeded drawing of lots.
  This approximates the Premier League and EFL handbooks. The real leagues would hold a play-off match
  for a tie affecting the title, promotion or relegation, which is not simulated.
* Points deductions (administration, PSR breaches) are not simulated.

## Play-offs

| League | Format |
|---|---|
| Championship | Eliminators 5v8 and 6v7 (one leg, higher seed at home) → two-legged semi-finals (3rd v lowest remaining seed, 4th v the other; higher seed hosts the second leg) → final at a neutral venue |
| League One | 3v6 and 4v5, two legs → final |
| League Two | 4v7 and 5v6, two legs → final |
| National League | Eliminators 4v7 and 5v6 (one leg) → semi-finals hosted by 2nd and 3rd against the lowest/other remaining seed (one leg) → final |

Level aggregates go to extra time in the second leg, then penalties. Away goals do not count.

## FA Cup

| Round | Entrants |
|---|---|
| Fourth Qualifying Round | 24 National League clubs + 40 **non-playable qualifiers** (24 "Step 2", 16 "Step 3") |
| First Round | 32 winners + 48 League One and Two clubs |
| Second Round | 40 |
| Third Round | 20 winners + 44 Premier League and Championship clubs |
| Fourth, Fifth, Quarter-final | 32, 16, 8 |
| Semi-finals, Final | neutral venue |

* Draws are open and random; the first club drawn is at home.
* Replays were abolished from the First Round in 2024/25. Every round here uses extra time and
  penalties. **Simplification:** the real 4th qualifying round may still allow replays.
* Qualifiers are generic clubs from below the National League, named "Step 2 Qualifier 7" and so on,
  rated around 35 (Step 2) and 30 (Step 3) with small random variation. They are marked **Q** in the
  UI, are not clubs in the world, and are re-created each season. Earlier qualifying rounds are not
  simulated.

## EFL Cup

| Round | Entrants |
|---|---|
| First Round (regional North/South) | the 72 EFL clubs except the two best-placed clubs relegated from the Premier League |
| Second Round (regional) | 35 winners + those 2 byes + 13 Premier League clubs |
| Third Round | 25 winners + the previous season's **top 7** Premier League clubs |
| Fourth, Quarter-final | 16, 8 |
| Semi-finals | two legs |
| Final | neutral venue, extra time and penalties |

* No extra time before the final: drawn ties and level semi-final aggregates go straight to penalties.
* **Simplification:** in reality the clubs playing in Europe enter in Round Three. European
  competitions are not simulated, so the previous season's top seven are used as a stand-in. In season
  one this uses the real 2025/26 final table.
* Regions are approximate (`regions` in the config). An odd-sized section moves one club across.

## Squad rotation in cups

Higher-division clubs field rotated teams against lower-division opponents in early rounds. This is
modelled as a temporary rating penalty, scaled by round (`rotation` per round), by the club's own tier
(largest for Premier League clubs), and by the size of the gap between the two divisions.

## Calendar

The season runs from early August to late May. Week 0 is the first Saturday on or after 1 August.
Cup rounds have fixed weekends or midweeks, and leagues skip cup weekends for the divisions involved.
Play-offs follow the end of the regular season: National League in early May, EFL semi-finals in
mid-May, finals in late May, and the FA Cup final in mid-May.

## Administration and points deductions (0.7, optional)

With the *Financial crises (administration)* setting above 0%, clubs can enter administration at the start of a season
(TECHNICAL.md). The deduction is configuration per league and season:

| Competition | 2026/27 start | 1992/93 start |
|---|---|---|
| Premier League | 9 points | none until 2003/04; 9 from 2004/05 |
| Football League / EFL | 12 points | none until 2003/04; 10 from 2004/05; 12 from 2015/16 |
| Conference / National League | 10 points | none until 2007/08; 10 from 2008/09 |

Sources: Wikipedia, "Administration (British football)": the 10- and 9-point rules were ratified in 2004 for 2004/05; Conference
clubs were "subject to the automatic 10-point deduction" from the 2008/09 cases; the page documents 12-point EFL deductions
from 2018/19 (Bolton, Bury, Wigan, Derby). The configuration applies 12 points from 2015/16, the season the EFL is understood
to have raised the penalty; that date is not confirmed by the downloaded page.

**Simplifications:** deductions apply in the season a club enters administration (in reality a late-season administration
of a relegated club carried the deduction into the next season, and later rules suspended it after late March); extra
sanctions for failing to exit administration through a CVA (e.g. Leeds −15, Luton −20 in 2008/09), expulsions and
liquidations are not modelled; no other financial-rule deductions (e.g. profit and sustainability breaches).

## Historical start: 1992/93

A world can start from **1992/93**, the first Premier League season (`src/data/england/config1992.ts`,
country id `ENG1992`). The era's rules are configuration, with no engine special cases. Generic config
options added for it: `rating` on non-playable qualifiers, `awayGoals` on two-legged cup rounds and (0.7)
**dated rule changes** (`changes`, `src/engine/rules.ts`).

### Starting rules (1992/93)

| Division | Clubs | Games | Promotion | Play-offs | Relegation |
|---|---:|---:|---|---|---|
| Premier League | 22 | 42 | — | — | bottom 3 |
| First Division | 24 | 46 | top 2 | 3rd–6th (two-legged semis, neutral final) | bottom 3 |
| Second Division | 24 | 46 | top 2 | 3rd–6th | bottom 4 |
| Third Division | 22 | 42 | top 3 | 4th–7th | bottom 1, to the Conference |
| Football Conference | 22 | 42 | champions | — | none (bottom of the playable pyramid) |

* **FA Cup**: the Second and Third Division and Conference clubs enter the First Round with non-playable
  non-league qualifiers (marked Q, rated 47, the fitted level of the Conference's feeder leagues): 4 while the top two
  divisions have 46 clubs, 10 from 1995/96 (80 First Round clubs, as in reality). The Premier League and First
  Division enter in the Third Round (64 clubs).
* **League Cup (Coca-Cola Cup)**: two-legged First Round of 56 clubs (Second and Third Division plus the First
  Division clubs with the lowest previous standing: ten in 1992/93, eight once the Third Division has 24 clubs)
  and Second Round (plus the other First Division clubs and the Premier League: 64 clubs); single-leg Third and
  Fourth Rounds and quarter-finals; two-legged semi-finals; neutral final. **Away goals** decide level two-legged
  ties, before and after extra time (away goals in extra time count). The Conference does not enter.
* Cup squad-rotation values are the same as in the 2026/27 configuration.

### Dated rule changes (0.7)

Each change applies from the season that starts in that year. The counts for 1994/95 and 2002/03 were checked
against engsoccerdata's tables.

| From | Change |
|---|---|
| 1994/95 | Transition to a 20-club Premier League: 4 relegated from the Premier League; First Division 2 up (champions + play-off 2nd–5th) and 4 down; Second Division 2 up (champions + play-off 2nd–5th) and 5 down; Third Division 3 up (2 automatic + play-off 3rd–6th) and grows to 24 |
| 1995/96 | Premier League of 20 (3 down); First Division 3 up/3 down; Second Division 3 up/4 down; Third Division of 24 (3 automatic + play-off 4th–7th); FA Cup First Round of 80 |
| 2002/03 | Two up, two down between the Third Division and the Conference (Conference champions + play-off winners, 2nd–5th) |
| 2004/05 | Renamed Championship, League One, League Two; the Conference becomes the Conference National |
| 2015/16 | The Conference National becomes the National League |
| 2017/18 | Six-team National League play-off (2nd–7th) |
| 2026/27 | Six-team Championship play-off (3rd–8th), as in the 2026/27 start |

The standings page shows each season's rules and the list of changes, and every change appears in the news
(filter "Rule changes"). Past tables use the rules of their own season (for example, four relegation places
in the 1994/95 Premier League).

**Differences from reality (documented simplifications):**
* Promotion from the Conference depended on ground criteria: no club went up in 1993/94–1995/96 (Kidderminster,
  Macclesfield and Stevenage were refused). The engine always promotes the Conference champions.
* The Conference grew from 22 to 24 clubs in 2006/07 and, from 2004/05, sat above a new sixth tier (Conference
  North/South). The sixth tier is not playable, so the Conference stays at 22 clubs with no relegation, and a 1992
  world reaching 2026 has 114 clubs rather than the 2026 start's 116.
* FA Cup **replays** existed in 1992/93 (abolished from the First Round in 2024/25). Here drawn ties go to extra
  time and penalties. The engine does not model the qualifying rounds.
* League Cup format changes after 1992/93 (single-leg early rounds, the end of away goals) are not applied.
* The League Cup Round One/Two split is approximated by previous standing.
* Tiebreakers are kept as in 2026/27 (goal difference first). The early-1990s Football League order has
  not been verified.
* Worlds saved before 0.7 keep the frozen 1992/93 rules they were created with (country id `ENG1992-0.6`:
  92 clubs, no Conference, no rule changes).
