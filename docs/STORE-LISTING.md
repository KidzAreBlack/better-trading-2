# Store submission notes

Text to paste into the Chrome Web Store and Firefox Add-ons (AMO) forms. Keep the listing consistent
with the README: always say this is an **unofficial community rewrite**.

## Short description (both stores; also in manifest.json)

Unofficial community rewrite of Better Trading: sidebar, bookmarks and search tools for the Path of Exile trade site.

## Long description

Better Trading 2 is an unofficial community rewrite of Better Trading, the sidebar for the Path of Exile
trade site (pathofexile.com/trade and /trade2). It is not made by, affiliated with or endorsed by
Exile Center (the authors of Better Trading) or Grinding Gear Games.

Features:
• Bookmarks: folders of saved searches with drag-to-reorder, archive, delete, share strings and backup
  files. Backups from the original Better Trading import as-is.
• Add build: paste a Path of Building code or pobb.in link to get a folder with a trade search for every
  item the build wears.
• History of the searches you run, and pinned items for comparing results.
• Equivalent prices from poe.ninja (PoE 1), highlighting of the mods you searched for, a socket warning
  and grouping of identical listings.
• + / − beside each result mod: add it to an And or Not stat group in your search with one click.
• Optional tools in Settings: fuzzy search, a tier picker for stat filters (PoE 1), result filtering by
  mod tier or name with Load all / Next 100, a default "Any Non-Unique" rarity, and opening the hidden
  panel when hovering its icon, and collapsible stat filter groups.

Everything is stored in your own browser. No tracking, analytics or ads.
Source code: https://github.com/KidzAreBlack/better-trading-2

## Category

- Chrome Web Store: **Tools** (or Fun → Games, if preferred)
- AMO: **Games & Entertainment**

## Links

- Homepage / source: https://github.com/KidzAreBlack/better-trading-2
- Support: https://github.com/KidzAreBlack/better-trading-2/issues
- Privacy policy: https://github.com/KidzAreBlack/better-trading-2/blob/main/PRIVACY.md

## Chrome Web Store: privacy practices tab

**Single purpose:** adds a sidebar with bookmarks, search history and search tools to the
Path of Exile trade website.

**Permission justifications**

- `storage`: saves the user's bookmark folders, search history, and a short-lived cache of
  currency prices, locally in the browser.
- Host permission `https://poe.ninja/*`: downloads public currency prices from poe.ninja to show
  "equivalent prices" on trade results. Only the league name is sent.
- Host permission `https://pobb.in/*`: when the user pastes a pobb.in link into "Add build", downloads
  that shared Path of Building build so its items can be turned into trade searches.
- Content script on `*://www.pathofexile.com/trade*`: shows the sidebar and search tools on the
  trade site, the only site the extension works on.

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage:** tick none of the data types. Then confirm the three statements: the extension does not
sell data, does not use it for unrelated purposes, and does not use it for creditworthiness.

## Chrome Web Store: graphics checklist

- Store icon 128×128: **switch to the new icon first.** The extension currently uses the original
  Better Trading icon; the Chrome Web Store may reject a listing that reuses another extension's icon.
  Copy `store/new-icon/icon16.png` … `icon128.png` over `assets/`, then run `npm run package`.
  (Source: `store/new-icon/icon.svg`.)
- Small promo tile 440×280: `store/promo-small-440x280.png`.
- At least one screenshot, 1280×800 or 640×400: take one of the sidebar on the trade site.

## AMO: submission

1. Upload `release/better-trading-2-firefox-<version>.zip`.
2. When asked whether the code is minified or generated: answer **Yes** and upload
   `release/better-trading-2-source-<version>.zip`.
3. Licence: choose **Other** / custom and point to the LICENSE file (The Unlicense + MIT).
4. Privacy policy: optional, because no data is collected. You can paste PRIVACY.md anyway.

**Notes to reviewer (paste as-is):**

> Build: Node.js 18+ (developed with 22). In the source zip run `npm ci` then `npm run build`; the
> output in `dist/firefox` matches the submitted package. JS is bundled and minified with esbuild
> (`build.mjs`). No remote code. The only `innerHTML` assignment flagged by the linter is inside the
> bundled Preact library (dangerouslySetInnerHTML support), which this extension never uses.
> `assets/data/poe1-tiers.json` is static data generated from RePoE (`scripts/build-tier-data.py`).
> Network use: poe.ninja public price API and pobb.in shared builds (only when the user pastes a pobb.in
> link into "Add build") from the background script; images from web.poecdn.com.
> To test: open https://www.pathofexile.com/trade/search/Standard; the Better Trading 2 sidebar appears beside the trade page.

## Before each new version

1. Raise `version` in `package.json` (each store upload needs a new version number).
2. `npm run package`.
3. Upload both zips, and the source zip to AMO.
