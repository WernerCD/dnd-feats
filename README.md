# Feats & Origins

Browse D&D 5e feats, species (races) and backgrounds for the **2014** and **2024** rules, and check which feats your character qualifies for.

**Live:** https://wernercd.github.io/dnd-feats/ · part of the [D&D Toolbox](https://wernercd.github.io/dnd/) · [Changes](https://wernercd.github.io/dnd-feats/changes.html)

## Features
- Pick the rules edition (2014 or 2024) and a tab: **Feats**, **Species** or **Backgrounds**. Search names, summaries and rules text.
- Filters: feat category (Origin, General, Fighting Style, Epic Boon, Dragonmark, Dark Gift, Racial), kind of prerequisite, the ability score an entry can raise, a searchable **Sources** picker (shared `sources.js`: core rules first and ticked by default, other books grouped below; Core books / Select all / Clear all / SRD only) and repeatable feats.
- Full SRD text for the SRD's feats, species and backgrounds. Everything else in the official books is listed with its facts (book, page, category, prerequisite, ability increase, size and speed, skills, tools, granted feat) and an original one-line summary.
- **Characters** (shared with the other D&D Toolbox tools through `character.js`): each feat card shows whether the active character **Qualifies**, is **Not yet** there, or needs a **Check** (campaign, background feature, tool proficiency and other things the character record doesn't hold). Checked: level, class level, ability scores, spellcasting, Fighting Style, armor and weapon training from class, feats already taken, species and background.
- Mark feats **Taken** or **Planned**, and set the character's **species** and **background**. Stored in the shared `dnd.characters` record under `links['dnd-feats']` as `{ taken: [ids], planned: [ids], species: id, background: id }`, and carried by the character's share link. A summary `{v: 1, ed, feats: [{n, cat, status}], species, background}` is published with `DndChar.setSheet` for the hub's Character Sheet and Party pages.
- **Imported characters** (`ch.imp`, character.js v1.6): offers to use the feats, species and background imported from D&D Beyond, Foundry or Fight Club 5, matched by name per edition, listing anything it couldn't match; saves `impAt` in `links['dnd-feats']`.
- **At level** checks prerequisites as if the character were a later level (the extra levels go to its first class), for planning an ASI.
- The link keeps every setting, and **Copy link** copies it (with `?char=` when a character is active).

### Link format
| Parameter | Meaning |
|---|---|
| `ed=2014\|2024` | Rules edition |
| `tab=feats\|species\|backgrounds` | Tab (default `feats`) |
| `q=` | Search text |
| `cat=Origin\|General` | Feat categories, `\|`-separated |
| `pre=none\|level\|ability\|species\|cast\|feat\|class\|campaign` | Kind of prerequisite |
| `ab=str\|dex` | Ability scores an entry can raise |
| `books=srd`, `books=all` or `books=PHB\|XPHB` | Source books (5etools codes, `SRD51`, `SRD52`); left out when it's the default (core rules) |
| `rep=1` | Repeatable feats only |
| `show=ok\|taken\|planned\|mine` | With a character: qualifies / taken / planned / either |
| `at=8` | Check prerequisites at this character level |
| `sort=name\|cat\|src\|ok` | Sort order |
| `id=<entry id>` | Open one entry, for example `id=srd-2024_alert` or `id=xphb_great-weapon-master` |
| `char=<character id>` | Make that shared character active (character.js) |

Example, the feats a character can take at its level 8 ASI: `https://wernercd.github.io/dnd-feats/?ed=2024&char=<id>&at=8&show=ok&cat=General`.

## Data and copyright
The repo and site are public, so only freely licensed text is reproduced.

| Data | Where it comes from | What is shown |
|---|---|---|
| SRD 5.1 feats, races and background (2014 rules) | [Open5e API v2](https://api.open5e.com/v2/) `feats`, `species`, `backgrounds`, `document__key__in=srd-2014` | Full text |
| SRD 5.2 feats, species and backgrounds (2024 rules) | Same endpoints, `srd-2024` | Full text |
| Feats, species and backgrounds from other official books | Facts compiled from the community [5etools-src](https://github.com/5etools-mirror-3/5etools-src) dataset | **Facts only**: name, book, page, category, prerequisite, ability increase, size, speed, skills, tools, granted feat. No rules text |
| One-line summaries | Written for this site (`data-src/summaries.json`) | Original text |

Nothing is taken from D&D Beyond. Partnered and third-party products and the free web supplements are left out of the index.

## Layout
| Path | What |
|---|---|
| `site/` | The static site (HTML/CSS/JS, no build step) |
| `site/data/feats.json` | Generated data, rebuilt by CI on every push |
| `site/search.json` | Names and `?id=` links for the hub's "Search every tool" box, generated with the data |
| `site/sw.js`, `site/offline.js`, `site/offline.json` | Shared offline support; `offline.json` lists the data file to save |
| `site/icons/`, `site/og.png`, `site/manifest.webmanifest` | App icons and link preview, copied from the hub's `shared/images/dnd-feats/` |
| `tools/build_data.py` | Builds the data from `source/` and `data-src/` (offline) |
| `tools/fetch_sources.py` | Refreshes `source/` from Open5e and `data-src/other-*.json` from 5etools (run by hand) |
| `tools/check_site.py` | Shared toolbox smoke check, run by CI before deploy |
| `tools/smoke_test.py` | Shared Playwright browser tests, run by CI before deploy |
| `tests/site_test.py` | This site's browser checks (tabs, sources, deep links, character marks, imports) |
| `source/` | Raw Open5e exports (SRD 5.1 and 5.2, CC-BY-4.0) |
| `data-src/other-*.json` | Facts-only index of the official books |
| `data-src/summaries.json` | Original one-line summaries, keyed by entry id |

## Run locally
```bash
python tools/fetch_sources.py   # only to refresh the inputs
python tools/build_data.py
python -m http.server 8765 --directory site
```
Checks (CI runs the same before every deploy): `python tools/check_site.py` and the browser smoke tests `python tools/smoke_test.py` (shared suite plus this site's `tests/site_test.py`; needs `pip install playwright` and `python -m playwright install chromium`). Every push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Credits and license
- Code: MIT, see [LICENSE](LICENSE).
- This work includes material from the System Reference Document 5.1 and System Reference Document 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. Both SRDs are licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). The SRD data was retrieved via the [Open5e](https://open5e.com) API.
- The index of other books lists facts only. Those books and their text are © Wizards of the Coast.
- Unofficial fan content. Not affiliated with or endorsed by Wizards of the Coast.
