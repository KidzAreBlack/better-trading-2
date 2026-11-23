# Better Trading 2

**An unofficial community rewrite of [Better Trading](https://github.com/exile-center/better-trading)**
for the Path of Exile trade site (`pathofexile.com/trade` and `/trade2`).

It works in Firefox and in Chrome-family browsers (Chrome, Edge, Brave, Opera, Vivaldi, Thorium…) from a
single codebase. It keeps the original's look and adds a few search tools on top.

> Better Trading 2 is not made by, affiliated with or endorsed by Exile Center (the authors of
> Better Trading) or Grinding Gear Games.

## Features

- **Bookmarks**: folders of saved searches, drag to reorder, archive, delete, export/share strings and a
  backup file. Backup files and share strings from the original Better Trading import as-is. Bookmarks don't
  save the trade mode: they (and History links) open in whichever mode you're using, In Person or Instant Buyout.
- **Price on bookmarks**: when you open a bookmarked search, its lowest price and how many listings it
  matched are remembered and shown under the bookmark (e.g. "12 c ▼ · 523 listings · 2 hours ago"), with
  ▼ / ▲ when the lowest price went down or up since the visit before. Mixed currencies are compared with
  poe.ninja rates (PoE 1). A setting, on by default.
- **Automatic backup**: a few seconds after your bookmarks change, they're saved to
  `Downloads/Better Trading 2/backup.txt` (one file, overwritten each time). Restore it with Backup tools >
  Restore from file. Can be turned off in Settings.
- **Add build**: paste a Path of Building code or a pobb.in link and get a bookmark folder with a trade search
  for every item the build wears (gear, flasks and jewels). If the build has several loadouts (Leveling,
  Endgame…), pick which one to use: its gear and the jewels in its own passive tree are searched. Uniques are searched by name plus the mods of the version the build uses (no values, so any roll
  matches); other items by their mods, with minimums at a percentage of the build's values (80% by default).
  Implicits and enchantments are added too, but unticked, so you can switch them on (a cluster jewel's stay ticked). Example items are handled too:
  rare names are never searched for, an invented base falls back to the slot's item type, and a unique that
  doesn't exist is searched by its mods. Searches are built locally, so importing never uses up the trade
  site's search limit. A build folder's menu has **Re-import build**: it makes the searches again (same
  code, loadout and percentage, or paste a newer code), keeping the folder's title if you renamed it.
- **Bulk**: sellers with more than one listing in the current search. Each seller is a card
  (click its heading to fold it) with each listing's price, what all their listings cost together, **Find**
  (jump to the listing) and **Buy** (presses the listing's own Travel to Hideout / Direct Whisper button).
  Sort by most listings, or by lowest or highest total price (mixed currencies compared with poe.ninja rates).
- **Live search alerts**: the trade site already plays a sound for new live search items (picked in the
  site's own Settings), and that stays the default. Pick another sound instead (Chime, Ding, Beep, or your own
  mp3 / wav / ogg files up to 1 MB each, with a volume slider) and the site's sound is muted, so only one plays.
  Each bookmark can have its own sound (or none) in its Edit window, and a line above the live results shows
  which sound that search uses. Optionally, a desktop notification while the trade tab is in the background
  (click it to go back to the tab).
- **History** of the searches you run, shown as plain text, and **pinned items** for comparing results.
- **Tabs**: choose which tabs the panel shows in Settings. Bookmarks, Bulk, History and Settings show by default;
  Pinned items is off until you turn it on.
- **Price summary** above the results: lowest, median and highest price of the loaded listings (filtered-out ones
  left out), compared in Chaos / Divines with poe.ninja rates (PoE 1). A setting, off by default.
- **Result extras**: equivalent prices from poe.ninja (PoE 1), **highlight searched mods** (a setting, with a
  colour picker), grouping of identical listings, and **+ / −** beside each mod
  (on hover): **+** adds the mod to an **And** stat group in your search, **−** to a **Not** group (each group is
  made the first time, then reused). Click Search when ready. Turned on or off in Settings ("Plus / Minus buttons on result mods").
- **Settings tab** (each one can be turned on or off):
  - **Add fuzzy key to search**: adds `~` when you start typing in an empty main search box or stat filter box (or type over
    all of its text). Delete it and it stays deleted.
  - **Quick filter presets**: a bar above Stat Filters with your own one-click filters. Click the **+** at the top
    and pick any filter from the site's lists. A Yes / No filter (for example Miscellaneous > Corrupted) gets a
    red ✗ (No) and a green ✓ (Yes); other filters keep the option or min / max you chose, with a green **+**
    that sets it and a red **−** that clears it. Or choose **Stats** to save a set of stats under your own name
    (type to find each stat, optional min / max): **+** puts them in the Stat Filters, **−** takes them out.
    The pencil at the top turns on edit mode: each preset's two buttons become edit (pencil) and remove (×), in the
    same places, and presets can be dragged to rearrange them;
    (remove); click Done when finished.
  - **Tier search**: a **T** button on each stat filter that lists the mod's tiers for the selected Item
    Category and fills in the min value (PoE 1). With Item Category set to Any, it uses the item named in the
    main search box (a base type such as "Hubris Circlet", or a word like "ring").
    - **Advanced filtering**: a box that hides loaded results by mod tier or name (`p1`, `t2+`,
      `wizard`, `spell damage p2`), or by **regex** like the game's stash search, so map regexes (e.g. from
      poe.re) work: `"y: \+([89]\d|\d{3})%" "!ele.*refl"`. Regex checks the whole item: name, properties
      (Item Quantity, Pack Size…) and mods. With **Load all** (the site shows up to 100 per search) and
      **Next 100** (continues from the last price).
  - **Stat filters are collapsible**: click a group's heading (Pseudo, Explicit, Implicit, Fractured…) in the
    "+ Add Stat Filter" list to hide or show its stats.
  - **Item rarity starts on Any Non-Unique**.
  - **Keep the search bar on screen while scrolling** (off by default): the search form stays at the top while
    you scroll the results, filters included when they're open (then it scrolls on its own if it's tall).
  - **Show panel when hovering the icon**.
- The trade page is resized to sit beside the sidebar instead of under it.

## Install

### From the stores

Store links will be added here once the listings are approved:

- **Firefox**: Firefox Add-ons (addons.mozilla.org). Needs Firefox 140 or newer (Firefox for Android 142+).
- **Chrome and Chromium-based browsers**: Chrome Web Store. Edge, Brave, Opera, Vivaldi and Thorium can
  install from the Chrome Web Store too.

### Manually (from a release zip or your own build)

**Chrome family**

1. Unzip `better-trading-2-chrome-<version>.zip`, or build it yourself (see below) and use `dist/chrome`.
2. Open `chrome://extensions` (in Edge: `edge://extensions`; in Thorium: `thorium://extensions`).
3. Turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.

**Firefox**

- *For testing*: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick
  `manifest.json` inside the unzipped `better-trading-2-firefox-<version>.zip` (or `dist/firefox`).
  Temporary add-ons are removed when Firefox restarts.
- *Permanently*: regular Firefox only installs add-ons signed by Mozilla, so install from Firefox Add-ons.
  To sign your own copy, upload the Firefox zip to addons.mozilla.org as an unlisted add-on.

On first install, both browsers ask for access to `pathofexile.com` (where the sidebar runs),
`poe.ninja` (prices) and `pobb.in` (Add build links). In Firefox you can revoke these in `about:addons`; prices then stop showing.

### Moving bookmarks from the original Better Trading

Extensions cannot read each other's data. In the original: Bookmarks > Backup tools > **Save file**.
Then in Better Trading 2: Bookmarks > Backup tools > **Restore from file**.

Search links that use an old short id no longer work on the trade site: the site now stores the whole
search inside the link. Open such a search again and use the bookmark's **Save active trade** to update it.

## Build from source

Needs Node.js 18 or newer (developed with Node 22). The build is reproducible: the same source and
`package-lock.json` give the same files.

```
npm ci              # install the exact dependency versions from package-lock.json
npm run build       # writes dist/chrome and dist/firefox (minified)
npm run package     # build, then write the store zips to release/
npm test            # loads the built extension into a mock trade page
npm run typecheck   # TypeScript check
npm run watch       # rebuild on every change (readable, not minified)
```

`npm run package` writes three files to `release/`:

| File | Use |
| --- | --- |
| `better-trading-2-chrome-<version>.zip` | Chrome Web Store upload (Manifest V3, service worker) |
| `better-trading-2-firefox-<version>.zip` | Firefox Add-ons upload (Manifest V3, background script) |
| `better-trading-2-source-<version>.zip` | Source code to give Mozilla reviewers |

Each extension zip has `manifest.json` and `LICENSE` at its root. Both manifests are generated by
`build.mjs` from one definition. The only differences are the background entry (Chrome uses
`service_worker`, Firefox uses `scripts`) and Firefox's `browser_specific_settings`, which hold the add-on
id and the `data_collection_permissions` declaration (`none`: the extension collects no personal data).

### For Mozilla reviewers

The JavaScript is bundled and minified with esbuild. To reproduce `dist/firefox` exactly:

1. Unzip the source archive and run `npm ci`, then `npm run build`.
2. Compare `dist/firefox` with the submitted zip.

All code is bundled locally, with no remotely loaded code. `assets/data/poe1-tiers.json` is a data file
committed to the source. It can be regenerated from [RePoE](https://github.com/repoe-fork/repoe-fork.github.io)
data with `python3 scripts/build-tier-data.py <RePoE data folder> assets/data/poe1-tiers.json`.

## Project layout

- `src/main.tsx`: the entry point. `src/ui` holds the sidebar, `src/lib` storage, bookmarks, history and
  settings, `src/features` the search tools, `src/enhancers` the result extras, and `src/content.css`
  all styles.
- `src/background.ts`: fetches poe.ninja prices and pobb.in builds for the page (content scripts cannot
  call other sites directly), writes the automatic backup file, and shows live search notifications.
  `src/lib/pob-import.ts` turns a Path of Building build into searches.
- `src/page-world.ts`: runs inside the page itself, to add stat filters to the site's search form.
- `build.mjs`: the build and both manifests. `scripts/package.mjs`: the release zips.
- `tests/`: integration tests run with jsdom.

## License and attribution

Better Trading 2 is based on [Better Trading](https://github.com/exile-center/better-trading) by
**Exile Center**. Thank you to its authors for the original extension and design.

- New code written for Better Trading 2 is released into the public domain under **The Unlicense**.
- Icons, images, CSS, wording, design structure and code adapted from Better Trading stay under the
  original **MIT License** of Exile Center, and that notice must be kept.
- Path of Exile artwork (the currency and ascendancy folder icons) and game data belong to
  Grinding Gear Games and are not covered by either license.
- Bundled components keep their own licenses: Preact (MIT) and Font Awesome Free 5 icons (CC BY 4.0).

The full texts are in [`LICENSE`](LICENSE), which is also included in every packaged extension.

Privacy: the extension collects no personal data; see [`PRIVACY.md`](PRIVACY.md).
Store submission text and reviewer notes: [`docs/STORE-LISTING.md`](docs/STORE-LISTING.md).
Path of Exile is a trademark of Grinding Gear Games.
