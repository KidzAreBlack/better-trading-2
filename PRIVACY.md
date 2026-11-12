# Privacy policy — Better Trading 2

_Last updated: 12 November 2026_

Better Trading 2 is an unofficial community browser extension for the Path of Exile trade site.
It does not collect, sell or share any personal data.

## What it stores, and where

Everything stays in your own browser, on your own computer:

- **Bookmarks** (folder names, search titles and trade-site search links), **search history** and a
  short-lived cache of poe.ninja prices, kept in the browser's extension storage (`storage.local`).
- **Pinned items** exist only in memory while the trade page is open; they are not saved.
- **Settings** (the on/off options, highlight colour, panel state), kept in the trade site's local
  storage under keys starting with `bt-`.

None of this is sent to the developer or to anyone else. It is removed when you uninstall the
extension (extension storage) or clear the site's data in your browser (settings).

Backup files and share strings are only created when you click **Save file** or **Export/Share**,
and they go only where you put them.

## Network requests

- **poe.ninja** (`https://poe.ninja`): to show equivalent prices, the extension downloads public
  currency price lists. The request contains only the league name and price category, nothing about you.
- **pathofexile.com**: the extension runs on the trade site's pages and reads them to add its tools.
  When you use **Load all** or **Next 100**, it presses the site's own buttons and runs searches
  just as you would. It sends nothing elsewhere.
- **web.poecdn.com**: currency icons shown next to prices are loaded from Grinding Gear Games'
  image server, the same images the trade site itself uses.

There is no analytics, tracking, advertising or remote code.

## Permissions

- `storage`: keeps your bookmarks, history and the price cache.
- Access to `www.pathofexile.com/trade*`: shows the sidebar and search tools on the trade site.
- Access to `poe.ninja`: downloads public price data for equivalent prices.

## Contact

Questions or issues: https://github.com/KidzAreBlack/better-trading-2/issues
