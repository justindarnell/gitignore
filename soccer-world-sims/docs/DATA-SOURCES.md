# Data sources, club database and licensing

## 2026/27 division membership (verified 27 Nov 2026)

The previous database's memberships were **not** taken on trust. Evidence used:

| Division | Evidence |
|---|---|
| Premier League | openfootball `2026-27/1-premierleague.txt` (real fixtures and results); [Premier League: season start](https://www.premierleague.com/en/news/4673099/the-202627-premier-league-season-officially-starts); [Liverpool FC: promoted teams Coventry, Hull, Ipswich](https://www.liverpoolfc.com/news/promoted-teams-depth-look-coventry-city-hull-city-and-ipswich-town) (relegated: Wolves, Burnley, West Ham) |
| Championship | openfootball `2026-27/2-championship.txt` (24 clubs); [WBA: 2026/27 Championship line-up](https://www.wba.co.uk/news/202627-sky-bet-championship-line-confirmed) |
| League One | [ESPN: EFL promotions and relegations](https://www.espn.com/soccer/story/_/id/48548480/championship-league-one-league-two-promotions-relegations-efl-going-going-down); [Opta League One 2026/27 predictions](https://theanalyst.com/articles/league-one-predictions-opta-supercomputer-2026-27): Leicester, Oxford and Sheffield Wednesday down; Bromley, MK Dons, Cambridge and Notts County up; Northampton, Rotherham, Port Vale and Exeter relegated |
| League Two | [Barrow relegated](https://www.hellorayo.co.uk/hits-radio/cumbria/news/barrow-relegated-to-the-national-league), [Harrogate relegated](https://thestrayferret.co.uk/harrogate-town-relegated-to-national-league/); York City (National League champions) and Rochdale (play-off winners) promoted |
| National League | [Scunthorpe United: 2026/27 line-up confirmed](https://scunthorpe-united.co.uk/news/2026/may/enterprise-national-league-line-up-confirmed-for-the-2026-27-season), [The FA: 2026/27 allocations](https://www.thefa.com/news/2026/may/14/nls-club-allocations-2026-27): AFC Fylde and Kidderminster up from the North, Worthing and Hornchurch up from the South |

All 116 clubs also match the FootyLogos "2026-27" competition packs supplied with the project.

**Rule change found:** the Championship play-offs expanded from four to six clubs (3rd–8th) from
2026/27 ([Sky Sports](https://www.skysports.com/football/news/12040/13515549/championship-play-offs-efl-confirms-expansion-from-four-to-six-teams-from-2026-27-season-onwards)).
Reports describe one-leg eliminators (5th v 8th, 6th v 7th at the higher seed), then two-legged
semi-finals with 3rd facing the lowest remaining seed. Some reports called the final format "still to
be agreed", so it is implemented in config and easy to change. League One and League Two keep
four-team play-offs.

## Historical datasets

| Source | Use | Licence notes |
|---|---|---|
| [engsoccerdata](https://github.com/jalapic/engsoccerdata) (J. Curley et al.): England league results 1888/89–2024/25 (missing 2022/23), FA Cup and League Cup to 2018/19 | Calibration benchmarks, club pedigree, rating fit | Distributed with an R package under its own licence (GPL). Raw files are **not** committed; `npm run history:fetch` downloads them. Only derived aggregate statistics and tables are included. Check the terms before redistributing them. |
| [openfootball/england](https://github.com/openfootball/england): 2022/23 and 2025/26 season files, 2024/25 and 2025/26 National League, 2026/27 fixtures | Fills engsoccerdata's gaps; 2025/26 results for ratings | Public domain (CC0) |

`data/history/derived/season-tables.csv` contains final tables rebuilt from results: 3 points per win in
every era, points deductions **not** applied. `benchmarks.json` holds every calibration target with
its date range. The 2025/26 League One, League Two and National League files in openfootball were
only complete to mid-season, so they are used for ratings and membership but not for season benchmarks.

## Club ratings: what is researched and what is estimated

| Field | Status | Method |
|---|---|---|
| attack, defence | **Researched** | Weighted Poisson model of 2022/23–2025/26 league goals across all five tiers (season weights 0.15/0.3/0.55/1.0), opposition-adjusted, ridge-shrunk toward the club's division mean. Tier levels are identified by clubs moving between divisions. A club that dominated a weaker division is therefore **not** rated like an established top-flight side (Coventry, Ipswich and Hull rate well below the Premier League elite and below relegated West Ham). The style split (attack minus defence) is shrunk by 30% because goal data separate it noisily. |
| midfield | **Derived** | Mean of attack and defence. Goal data cannot identify midfield separately; it is kept as an attribute that evolves independently from season two on. |
| overall | **Derived** | Mean of attack, midfield and defence, computed by the engine. |
| reputation | **Researched** | Recency-weighted (8-year half-life) pyramid level over 1996/97–2025/26, plus a pedigree bonus from all-time top-flight seasons and titles (capped at +6). |
| stability | **Mixed** | Researched: volatility of pyramid rank and number of division changes, 2012–2024. Subjective, documented adjustments for: Sheffield Wednesday (−22, 2025/26 ownership crisis and deduction), Leicester (−8), Reading (−8), Derby (−4), Oldham (−3), Wrexham (+6), Birmingham (+5). |
| formEstimate | **Researched** | Opposition-adjusted points residual over each club's last 12 league games of 2025/26, mapped to 0–100 (50 = as expected) and capped. Applied as at most ±1.5 rating points that decay in-season. |
| Hornchurch, Kidderminster, Worthing | **Estimates** | No usable National League data in the fit window. Set slightly below the National League mean (documented in `build-db.mjs`). |

Each club's `provenance` field in `src/data/england/clubs.json` records these details.
Ratings use results only. Transfer spending, wages and injuries are not modelled. Clubs that changed
division for 2026/27 receive the engine's normal promotion or relegation summer adjustment at world
creation, so season one is treated like every later season.

## Historical start database: 1992/93

`src/data/england/clubs-1992.json` is built with **the same pipeline and method** as the 2026/27
database, using only data available before the season:

```sh
node tools/ratings/fit.mjs --start 1992 && node tools/ratings/build-db.mjs --start 1992
```

* **Membership** (verified): the 92 clubs of engsoccerdata's 1992/93 season (`tools/ratings/master1992.mjs`),
  plus (0.7) the 22 clubs of the **1992/93 Football Conference** from its English Wikipedia season page (names only).
  These are the 1991/92 members minus Colchester (promoted), Cheltenham and Barrow (relegated), with Redbridge
  Forest's place taken by Dagenham & Redbridge after the merger, plus Bromsgrove Rovers, Stalybridge Celtic and
  Woking (promoted from the Southern League, Northern Premier League and Isthmian League). Engine tests assert these.
  The Premier League's 22 founder members; Colchester United promoted from the Conference; Aldershot
  (folded March 1992) and Maidstone United (folded August 1992) absent; 1991/92 promotions and relegations
  (e.g. Blackburn via the play-offs; Luton, Notts County, West Ham relegated). Engine tests assert these.
  Clubs also in the 2026 database keep their 2026 ids; seven historical clubs get their own (Wimbledon FC,
  Chester City, Bury, Darlington, Hereford United, Scarborough, Torquay United). Halifax Town uses the
  FC Halifax Town id, as the 2026 database does.
* **Ratings**: the same weighted Poisson fit over **1988/89–1991/92** (season weights 0.15/0.3/0.55/1.0,
  ridge toward the division mean, style shrink 30%). For the fifth tier (0.7) the fit also uses the Football
  Conference's full **results matrices** for those four seasons (tier 5) and the top divisions of its feeder
  leagues (tier 6). The Northern Premier League pages have results matrices too. The Isthmian and Southern League
  pages have final tables only, so each club enters once per season with its goals for and against per game against
  a virtual league-average opponent, without home advantage (in a double round robin these carry most of what the
  individual results would). Clubs keep one strength across seasons, so promotions and relegations between these
  leagues and the Fourth Division link the levels. The fitted Fourth Division–Conference gap is somewhat larger than
  the gaps between Football League divisions; Conference clubs rate 50–62 overall (Fourth Division about 55–66).
  The parsed matrices reproduce the pages' own goal totals to within 10 goals per season. Dagenham & Redbridge's
  pre-1992 record is Redbridge Forest's. Matrix games carry no dates, so Conference clubs start with neutral form. The fitted divisional gaps are about half of today's,
  so 1992 divisions are much closer in strength than 2026 ones.
* **Reputation**: weighted pyramid level **1962–1991** plus pedigree from all seasons up to 1991/92. The 1988/89–1991/92
  Conference positions count as tier 5 (0.7); other non-league seasons count as below the playable pyramid.
  **Stability**: rank volatility **1978–1990** (no subjective adjustments). **Form**: last 12 league games
  of 1991/92.
* **Ownership seeds** (documented takeovers before the season): Blackburn (Jack Walker, 1991), Newcastle
  (Sir John Hall, 1991–92), Derby (Lionel Pickering, 1991), Wolves (Sir Jack Hayward, 1990). Everyone
  else is neutral.
* The bundle strips `provenance` (the UI does not show it); the JSON file keeps it for every club.

### Real outcomes 1992/93–2024/25 (0.7)

`tools/history/real1992.mjs` measures what actually happened to the 114 clubs of 1992/93 from the derived season
tables (tiers 1–4; any other season counts as tier 5 or below) and writes `data/history/derived/real-1992.json`: 11
aggregate outcomes (different champions, most titles, retention, different and ever-present top-flight clubs,
champion points and points spread per 38 games, top-four concentration, founders relegated, lower-league risers,
Conference clubs reaching the League) and per-club top-flight seasons and mean tier, for 1992–2008, 2009–2024 and the
whole period. The same code (`tools/calibrate/real92.mjs`) measures simulated worlds.

### Source: English Wikipedia (1992/93 fifth tier)

`npm run history:fetch` also downloads the 1988/89–1992/93 Football Conference pages and the 1988/89–1991/92
Isthmian, Southern and Northern Premier League pages from English Wikipedia (text under CC BY-SA 4.0; attribution:
the Wikipedia contributors of each page). Only results, club names and tables are used; the raw pages are not
committed (`data/history/raw/`). Parser: `tools/history/wikitable.mjs`. In a sandbox whose proxy is only honoured
when asked, run the fetch with `NODE_USE_ENV_PROXY=1`.

## Club crests

* Source: FootyLogos.com 2026-27 competition packs (SVG), supplied by the project owner.
  FootyLogos asks for credit ("Crests via FootyLogos.com"), shown in the app footer. Club marks belong
  to their respective owners.
* Converted to 96×96 WebP (lists) and 192×192 WebP (profile headers) by `tools/assets/convert-crests.mjs`
  with headless Chromium. 5.6 MB of SVG became 568 KB of 96 px WebP.
* **Licensing:** permission to use crests in a private prototype does not grant permission to
  redistribute them. This repository is public, so the generated images are git-ignored and must be
  built locally. A public release needs explicit permission from the rights holders, or should ship
  with the built-in initials badges only.
