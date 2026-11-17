import {findTradeByLocation} from './bookmarks';
import {recommendTitle} from './search-panel';
import {currentLocation} from './trade-location';
import {on} from './util';

// Puts the bookmark's name (or the searched item) in the browser tab title,
// keeping the site's own "(3) " new-results counter in front.

const COUNTER_PREFIX = /^\((\d+)\) /;

let baseTitle = '';
let title: string | null = null;
let counter: number | null = null;

// The browser trims the tab title and squeezes runs of spaces when it's read back, so the
// title is written that way too. Otherwise "Behemoth " (trailing space) gives a title that
// never reads back the same, and setting it over and over froze the page.
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

const apply = () => {
  if (title === null) return;

  const next = tidy((counter !== null ? `(${counter}) ` : '') + title);
  if (document.title !== next) document.title = next;
};

const recalculate = async () => {
  const location = currentLocation();
  const bookmark = await findTradeByLocation(location);
  const tradeTitle = tidy(bookmark ? bookmark.title : location.type === 'search' ? recommendTitle() : '');

  title = `${location.isLive ? '⚡ ' : ''}${tradeTitle ? `${tradeTitle} - ` : ''}${baseTitle}`;
  apply();
};

export const setupPageTitle = (): void => {
  const titleElement = document.querySelector('title');
  if (!titleElement) return;

  baseTitle = document.title.replace(COUNTER_PREFIX, '');

  new MutationObserver(() => {
    const match = COUNTER_PREFIX.exec(document.title);
    counter = match ? parseInt(match[1], 10) : null;
    apply();
  }).observe(titleElement, {childList: true});

  on('bookmarks-change', recalculate);
  on('location-change', recalculate);
  void recalculate();
};
