# Store submission notes

Text to paste into the Chrome Web Store and Firefox Add-ons (AMO) forms. Keep the listing consistent
with the README: always say this is an **unofficial community rewrite**.

## Short description (both stores; also in manifest.json)

Unofficial community rewrite of Better Trading: sidebar, bookmarks and search tools for the Path of Exile trade site.

## Long description

Better Trading 2 is an unofficial community rewrite of Better Trading, the sidebar for the Path of Exile
trade site (pathofexile.com/trade and /trade2). It is not made by, affiliated with or endorsed by
Exile Center (the authors of Better Trading) or Grinding Gear Games.

BOOKMARKS
• Folders of saved searches: drag to reorder, archive, delete, and share a folder as a text string.
• Bookmarks open in the trade mode you're using (In Person or Instant Buyout).
• Lowest price and listing count shown under each bookmark from your last visit, with ▼ / ▲ when the price moved.
• Automatic backup to your Downloads folder whenever your bookmarks or Quick filter presets change, plus backup and restore files.
• Backups and share strings from the original Better Trading import as-is.

ADD BUILD
• Paste a Path of Building code or a pobb.in link and get a folder with a search for every item the
  build wears: gear, flasks and jewels.
• Pick the loadout (Leveling, Endgame…); uniques are searched by name, other items by their mods at a
  percentage of the build's values.
• Re-import a build later to update its searches.

QUICK FILTER PRESETS
• Your own one-click buttons above Stat Filters.
• Any filter from the site: Yes / No filters get ✗ and ✓ (for example Corrupted), others − and +
  (for example Item Level 68+).
• Save a set of stats under your own name and add or remove them all at once.
• Edit mode to edit, remove and drag presets into any order.

LIVE SEARCH ALERTS
• Keeps the trade site's own sound, or pick Chime, Ding, Beep or your own sound file (only one plays).
• A different sound for each bookmark, and a volume slider.
• Optional desktop notification while the trade tab is in the background.

RESULTS
• Bulk: sellers with more than one listing, their total price, and Find / Buy for each listing.
• Equivalent prices from poe.ninja (PoE 1) and an optional price summary (lowest, median, highest).
• Highlights the mods you searched for, and groups identical listings.
• + / − beside each mod adds it to an And or Not stat group in your search.
• Filter loaded results by mod tier, name or regex (map regexes work), with Load all and Next 100.

SEARCH TOOLS
• Tier picker on stat filters: choose a mod tier and its minimum is filled in (PoE 1).
• Fuzzy key (~) added when you start typing in the search boxes.
• Collapsible stat filter groups, rarity defaulting to Any Non-Unique, and an optional search bar that
  stays on screen while you scroll.
• History of your searches, and pinned items for comparing results.

PANEL
• Choose which tabs show, open the hidden panel by hovering its icon, and turn each feature on or off.

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
- `downloads`: keeps an automatic backup of the user's bookmarks as one file on their own computer
  (Downloads/Better Trading 2/chrome_backup.txt, overwritten when bookmarks or presets change), so a browser reset
  doesn't lose them. It can be turned off in Settings. Nothing is uploaded.
- `notifications`: when the user turns on the live search alert setting (off by default), shows a
  desktop notification when a live search on the trade site finds new items.
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
> output in `dist/firefox` is identical to the submitted package. JS is bundled and minified with esbuild
> (`build.mjs`). No remote code, and no innerHTML assignments: the build turns the bundled Preact
> library's innerHTML writes (only for dangerouslySetInnerHTML, never used here) into textContent.
> `assets/data/poe1-tiers.json` is static data generated from RePoE (`scripts/build-tier-data.py`).
> `page.js` runs in the trade page itself (content script with world MAIN) only to change the site's own
> search form (adding stat filters and filters the user picks) and to mute the site's own live-search
> sound when the user chose a different one; it talks to the content script with DOM CustomEvents.
> Permissions: `downloads` writes the automatic bookmark backup to Downloads/Better Trading 2/firefox_backup.txt;
> `notifications` shows an optional live-search notification (off by default).
> Network use: poe.ninja public price API and pobb.in shared builds (only when the user pastes a pobb.in
> link into "Add build") from the background script; the trade site's own data lists from
> www.pathofexile.com; images from web.poecdn.com. No personal data is collected or sent.
> To test: open https://www.pathofexile.com/trade/search/Standard; the Better Trading 2 sidebar appears beside the trade page.

## Before each new version

1. Raise `version` in `package.json` (each store upload needs a new version number).
2. `npm run package`.
3. Upload both zips, and the source zip to AMO.
