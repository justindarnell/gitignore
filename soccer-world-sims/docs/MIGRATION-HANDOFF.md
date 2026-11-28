# Handoff: move Soccer World Sims to its own repository (soccersim org)

For the session that has both repositories. Read this first, then `docs/HANDOFF.md` (project state after 0.7.0).

## Source

* Repository `justindarnell/gitignore` (a fork of GitHub's gitignore templates; `master` holds only those templates).
* The project lives in the folder **`soccer-world-sims/`** on branch **`claude/hopeful-fermat-hbku3z`**. That branch has
  the complete history: 13 project commits on top of `master` (0.5 rebuild → 0.6 → 0.7.0, last commit `7904f6a`, plus
  this note). The older branches `claude/new-session-wgdofk` and `claude/hopeful-archimedes-28xqvy` are earlier
  snapshots of the same line and are not needed.
* Nothing outside `soccer-world-sims/` belongs to the project. Do not copy the `.gitignore` templates, `Global/`,
  `.github/` or `LICENSE` of the gitignore fork.

## Goal

The target repository in the `soccersim` org contains the project **at its root** (`package.json`, `src/`, `dist/`,
`docs/` … at the top level), with the project's commit history kept.

## Recommended method: subtree split (keeps the 13 commits, verified)

```sh
# in a clone of justindarnell/gitignore
git fetch origin claude/hopeful-fermat-hbku3z
git subtree split --prefix=soccer-world-sims -b sws-export origin/claude/hopeful-fermat-hbku3z
# -> a branch whose root is the project folder: 13 commits (+ this note's commit), first one "Soccer World Sims rebuild"

# in a clone of the new soccersim repository
git fetch /path/to/gitignore-clone sws-export
git checkout -b import-sws FETCH_HEAD          # if the new repo is empty, this can become its main branch
# If the new repo already has commits (e.g. a README or LICENSE created on GitHub):
#   git checkout <default-branch> && git merge --allow-unrelated-histories FETCH_HEAD
#   resolve README/LICENSE/.gitignore conflicts by keeping the project's files (see below)
```

Tested in the source repo: the split produced 13 commits with `.gitignore, CHANGELOG.md, README.md, assets, calibration,
data, dist, docs, package-lock.json, package.json, src, test, tools, tsconfig.json` at the root.

Fallback if subtree is unavailable or history is not wanted: copy the folder's contents
(`git archive HEAD:soccer-world-sims | tar -x -C <new-repo>`) and commit once, saying in the message where it came from.

Push to a working branch in the new repository and open a pull request there if the user wants one; do not push to its
default branch without the user's say-so.

## Files to check after the move

* **`.gitignore`** (project's own; keep it): ignores `node_modules/`, `data/history/raw/`, `calibration/tmp/`, `*.log`
  and generated crest images. If the new repo was created with a GitHub `.gitignore` template, merge, keeping these lines.
* **`LICENSE`**: the project has none of its own. README says "The code in this folder is yours to license as you
  choose" and lists third-party terms (crests, engsoccerdata, openfootball, Wikipedia CC BY-SA). Ask the user which
  license the new repo should have; do not reuse the gitignore fork's CC0 license by accident.
* **README.md / docs**: written for a subfolder. Wording such as "the code in this folder", "this repository is public"
  (crest licensing) and `cd soccer-world-sims` in `docs/HANDOFF.md`'s baseline commands should be updated for a
  root-level project. Relative links between docs (`docs/*.md`) keep working unchanged.
* **Crests**: never committed (licensing). Keep it that way if the new repo is public; check its visibility.
* **`dist/`** is committed on purpose (playable offline build from a clone). Keep it.
* Nothing in the code depends on the folder name or on the gitignore repository (paths are relative to the project
  root via `import.meta.url`). Old branch or commit hashes appear only in `docs/HANDOFF.md`; update them after the
  split, because subtree split rewrites hashes.

## Verify in the new repository

```sh
npm install
npm test                       # expected: 71 engine tests pass
npm run typecheck
npm run build                  # dist/app.js about 300 KB
node tools/browser-test.mjs    # expected: 65/65 browser checks (uses the preinstalled Playwright Chromium)
```

`npm run history:fetch` (only needed for calibration and rating tools) downloads engsoccerdata and openfootball from
GitHub and season pages from **en.wikipedia.org**. In a Claude cloud session: Node's fetch only goes through the proxy
with `NODE_USE_ENV_PROXY=1`, and the environment must allow `en.wikipedia.org`. The user has a personal environment named
"gitignore" that allows it; a session for the new repo needs an environment with the same host (propose one named after
the new repository if the work needs the data).

## Afterwards (ask the user)

* Whether to archive or delete the `claude/*` branches in `justindarnell/gitignore` once the new repository is verified.
* Update `docs/HANDOFF.md` in the new repo: new repo name, branch, commit hashes after the split, and the baseline
  commands without `cd soccer-world-sims`.
