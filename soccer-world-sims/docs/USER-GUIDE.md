# User guide

## Starting

Open `dist/index.html`. The first time, a new world starts at the beginning of 2026/27 with empty
tables and a random seed. After that, the game reopens your autosaved world.

## Simulating

The bar below the navigation controls time:

| Button | Advances |
|---|---|
| Next matchday | the next calendar date with matches (league, cup or play-off) |
| Month | to the next calendar month |
| Rest of season | to the end of the current season, including play-offs and cup finals |
| One year | to the same point in the calendar one season later |
| N Seasons | N complete seasons (type a number, up to 500) |
| 100 seasons | a century |

When a season is complete, the Overview shows a season review. The next advance applies club
development (squad changes, reputation, events) and starts the new season.

Long runs happen in the background with a progress bar:
* **Pause** stops at the next safe point. You can **Resume** or **Stop here**; progress so far is kept.
* **Cancel** throws the run away, and the world returns to exactly where it was.

The same seed and settings always produce the same history, however you split the simulation.

## Pages

* **Overview**: top-flight table, fixtures, division leaders, cups, news and form guide.
* **Standings**: every division with zones (champions, automatic promotion, play-offs, relegation),
  form and tiebreakers. Use the season selector to view past tables.
* **Fixtures**: by division and matchday (‹ › to move), cup and play-off ties, or everything around today.
* **Cups**: FA Cup and EFL Cup round by round (ties, aggregates, extra time, penalties), recent winners,
  and the play-off brackets. Clubs marked **Q** are non-playable FA Cup qualifiers.
* **Clubs**: searchable, sortable directory of all 116 clubs.
* **Club profile**: attributes, season statistics, honours, achievements, promotions and relegations,
  biggest wins, heaviest defeats and the club timeline. Two interactive graphs:
  * *Overall rating, reputation and stability* by season.
  * *Combined pyramid position* (1 = top of the Premier League, 116 = bottom of the National League),
    by season or by matchday.
  The attributes card also shows **ownership ambition** (−100 asset-stripping … +100 wealthy takeover),
  seeded from documented ownership situations in 2025/26 (e.g. Newcastle, Wrexham, Sheffield Wednesday)
  and neutral for every other club.
  Move the mouse across a graph (or focus it and use the arrow keys) for a crosshair and details.
  Range buttons zoom to the last 10, 25 or 50 seasons.
* **History**: rolls of honour for every competition, trophy totals, historical tables, promotions and
  relegations, records (streaks, biggest wins, notable achievements) and Rise & fall rankings (most
  improved and declined by rating, reputation, pyramid position or stability, for all time, the last
  5 or 10 seasons, or a custom period).
  The profile also lists the club's **rivalries** (derby records) and its **golden age**.
* **Standings** includes a **title-race chart** (points by matchday for the top six; past seasons need
  Standard storage).
* **Season review** (`#/season/<year>`, linked from the overview at season end and from History →
  Season reviews): the automatically detected *story of the season* (final-day title races, collapses,
  great escapes, long runs, records, giant-killings), the honours and the title-race chart.
* **History → Eras & dynasties**: labelled eras ("The Newcastle Era, 2041–2049"), dynasties (5+ titles),
  a decades bump chart of the top clubs' pyramid positions and each top club's golden age.
  **History → Rivalries**: every configured derby with its record. **Head-to-head** (`#/h2h/<a>/<b>`):
  any two clubs, with totals and the individual meetings that are stored.
* **News**: the world news feed, filterable by type (including Stories, Derbies and Ownership).
* **Settings**: see below.
* **Saves**: save slots, autosave, export/import, and starting a new world (optionally from a seed).

## Sandbox

* **What-if** (club profile): edit a club's attack, midfield, defence, reputation, stability or ownership
  ambition, or inject an event: wealthy takeover, sell-off, institutional crisis or investment windfall.
  Every change is recorded as a **user intervention**, marked ✎ in the club timeline, in the news
  (filter "Interventions") and on the Saves page.
* **Fork** (Saves page): *Fork this world* saves an independent copy with the same seed and history; *Fork
  and switch* saves the original and continues in the fork. Change settings or intervene in one of them.
* **Compare** (menu): pick a saved world as timeline B for champions side by side, final tables, a club's
  path in both timelines and where they first diverged. *Fork current world & compare* does both in one
  click; *Simulate B to …* brings a timeline that is behind up to date.
* **Start season** (Saves → New world): the present day (2026/27, 116 clubs) or **1992/93**, the first
  Premier League season: 92 clubs rated from 1988–92 results and that era's rules (22-club Premier League,
  First/Second/Third Division, League Cup with away goals). See COMPETITIONS.md for what differs from
  reality.

## Settings

All sliders default to **100%**, the calibrated, historically realistic model. Presets:

* **Dynamic**: more upsets, bigger swings and more events.
* **Chaotic**: anything can happen; not realistic.
* **Stable**: established clubs hold their status longer.

Changes apply from the next match onward and are logged. Recorded history is never changed.
**Random event frequency** at 0% disables events.
**Ownership dynamics** scales takeovers, sell-offs and how far owners can push a club above (or run it
below) what its standing supports. Clubs whose reputation is already elite are shielded. 100% is the
calibrated model (adopted in 0.7, see CALIBRATION.md, "0.7: relative ownership"); 0% means owners never
matter. Saves from earlier versions keep the model they were created with.

**Historical storage** controls how much detail is kept: Essential, Standard (default) or Full.
See TECHNICAL.md for sizes.

## Saving

Your world is autosaved in the browser after every simulation (you can turn this off). Use **Save as
new slot** for named saves. **Export file** downloads a compressed backup that you can **Import** in
any browser. Exporting is also the reliable option if your browser blocks storage for files opened
from disk.

## Crests

If you see two-letter badges instead of crests, the crest images have not been generated. See
README.md → *Play*.
