// Keeps the search form (search box, Search / Clear / Show Filters, and the filters when
// they're open) at the top of the window while you scroll the results. With the filters
// open it scrolls on its own if it's taller than 70% of the window. The pinning itself
// is in content.css.

import {isEnabled} from '../lib/settings';
import {on} from '../lib/util';

export default function setupStickySearch() {
  const update = () => document.body.classList.toggle('bt-sticky-search', isEnabled('sticky-search'));
  update();
  on('settings-change', update);
}
