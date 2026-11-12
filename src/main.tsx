// Better Trading 2 - runs on the Path of Exile trade site (pathofexile.com/trade and /trade2).

import {render} from 'preact';
import {setupEnhancers} from './enhancers';
import setupCollapsiblePseudo from './features/collapsible-pseudo';
import setupDefaultRarity from './features/default-rarity';
import setupSidebarScroll from './features/sidebar-scroll';
import fitTradePage from './features/fit-trade-page';
import setupFuzzySearch from './features/fuzzy-search';
import setupModFilter from './features/mod-filter';
import setupTierPicker from './features/tier-picker';
import {local} from './lib/ext';
import {applyHighlightColor} from './lib/highlight-color';
import {setupHistory} from './lib/history';
import {setupPageTitle} from './lib/page-title';
import {watchLocation} from './lib/trade-location';
import {App} from './ui/App';

const start = () => {
  // Only on the real trade app, and never twice on the same page.
  if (!document.getElementById('trade') || document.getElementById('better-trading-root')) return;

  document.body.classList.add('bt-body');
  if (local.get('side-panel-collapsed') === 'true') document.body.classList.add('bt-is-collapsed');

  const root = document.createElement('div');
  root.id = 'better-trading-root';
  document.body.appendChild(root);
  render(<App />, root);

  applyHighlightColor();
  // Clear the setting left behind by the removed font size option.
  try { window.localStorage.removeItem('bt-font-size'); } catch {}
  fitTradePage();
  setupFuzzySearch();
  setupModFilter();
  setupTierPicker();
  setupCollapsiblePseudo();
  setupDefaultRarity();
  setupSidebarScroll();
  setupEnhancers();
  setupPageTitle();

  watchLocation();
  setupHistory();
};

start();
