# Roadmap

## Near term (0.5.x)

* Address the reported calibration weaknesses (promoted-club variety, lower-league mobility, champion
  points, era giants over 100 years). 0.7 adopted relative ownership (CALIBRATION.md), which helped mobility and
  champion points but not promoted-club variety.
* A data-table view for every graph, plus CSV export of history tables.
* More historical start seasons (any year with complete data in tiers 1–4; the dated-rules mechanism from 0.7
  makes each one a config plus a database).
* FA Cup replays as a config option for historical eras.
* Optional historical season replays (watch a season's table evolve matchday by matchday).
* Additional languages and number formats.

## Medium term

* **Scotland** and other European pyramids. Add a `CountryConfig` plus a club database per country;
  the engine is already country-agnostic.
* **Multiple countries in one world**, with cross-country rating calibration through European results.
* **UEFA Champions League, Europa League and Conference League**: domestic qualification rules,
  league-phase formats and coefficients. This replaces the EFL Cup "top 7" stand-in.
* **Additional English divisions** (National League North/South) with real relegation from the
  National League.
* Financial-rule (profit and sustainability) deductions; time-varying administration rates.

## Long term

* International football.
* Expanded world records and cross-country comparisons.
* Community data packs (validated club databases with documented sources).
* Licensing-cleared crest packs, or an original badge generator for public releases.

Out of scope by design: individual players, transfers, contracts, detailed finances, tactics,
user-controlled clubs, multiplayer, online services.
