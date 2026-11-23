// The trade site's own data lists (stats, items, filters), read with the page's address so
// they come from the same place the site's search form uses. Firefox needs content.fetch
// for that.

import type {TradeSiteVersion} from './trade-location';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pageFetch: typeof fetch = (input, init) => ((globalThis as any).content?.fetch ?? fetch)(input, init);

export const apiBase = (version: TradeSiteVersion) => `https://www.pathofexile.com/api/${version === '2' ? 'trade2' : 'trade'}/data`;
