// Loads the built extension into a mock of the trade page and checks the main features.
// Run with: npm run build && npm test
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateSync, gunzipSync, gzipSync} from 'node:zlib';
import {JSDOM} from 'jsdom';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const statRow = (type, text) =>
  `<div class="filter"><div class="filter-title filter-title-clickable"><span class="mutate-type mutate-type-${type}">${type}</span> ${text}</div><span class="sep"></span><input type="number" placeholder="min" class="form-control minmax"><span class="sep"></span><input type="number" placeholder="max" class="form-control minmax"></div>`;

const row = fixture('result-row.html');
const secondRow = row.replace(/data-id="[^"]+"/, 'data-id="second"');

const PAGE = `<!doctype html><html><head><title>Trade - Path of Exile</title></head><body class="trade">
<div class="container-fluid full"><div id="trade">
  <div class="search-panel"><div class="search-bar"><div class="search-left"><input class="multiselect__input" placeholder="Search Items..." value=""></div>${fixture('controls.html')}
    <div class="search-advanced-items">
      <div class="search-advanced-pane blue"><div class="filter-group"><div class="filter-group-body"><div class="filter filter-property"><input class="multiselect__input" value="Staff"></div><div class="filter filter-property"><div class="multiselect filter-select"><input class="multiselect__input" placeholder="Any" value="Any"><ul class="multiselect__content"><li class="multiselect__element"><span class="multiselect__option"><div><span>Any</span></div></span></li><li class="multiselect__element"><span class="multiselect__option"><div><span>Rare</span></div></span></li><li class="multiselect__element"><span class="multiselect__option"><div><span>Any Non-Unique</span></div></span></li></ul></div></div></div></div></div>
      <div class="search-advanced-pane brown"><div class="filter-group"><div class="filter-group-body">${statRow('explicit', '#% increased Spell Damage')}${statRow('pseudo', '+# total maximum Life')}</div></div></div>
    </div></div></div>
  <div class="results"><div class="resultset">${row}${secondRow}<div class="row controls"><button class="btn load-more-btn"><span>Load More</span></button></div></div></div>
</div></div></body></html>`;

const load = async ({path = '/trade/search/Standard/abc123', settings = [], rarityValue = '', script = '', local = {}, onFetch = null, onMessage = null, nodeStreams = false, stored = {}} = {}) => {
  const store = JSON.parse(JSON.stringify(stored));
  const dom = new JSDOM(PAGE.replace('</body>', `${script}</body>`), {url: `https://www.pathofexile.com${path}`, runScripts: 'outside-only', pretendToBeVisual: true});
  const {window} = dom;
  window.chrome = {
    runtime: {getURL: (p) => `chrome-extension://test/${p}`, sendMessage: async (message) => (onMessage ? onMessage(message) : null)},
    storage: {
      local: {
        get: async (keys) => Object.fromEntries((keys || Object.keys(store)).filter((k) => k in store).map((k) => [k, store[k]])),
        set: async (items) => void Object.assign(store, JSON.parse(JSON.stringify(items))),
        remove: async (keys) => void [].concat(keys).forEach((k) => delete store[k]),
      },
    },
  };
  window.document.hasFocus = () => true;
  // The extension loads its tier table from its own files.
  window.fetch = async (url, init) => {
    const handled = onFetch && (await onFetch(String(url), init));
    if (handled) return handled;
    const path = String(url).replace('chrome-extension://test/', '');
    const body = readFileSync(new URL(`../dist/chrome/${path}`, import.meta.url), 'utf8');

    return {json: async () => JSON.parse(body)};
  };
  window.TextEncoder = TextEncoder; // jsdom lacks these; browsers have them
  window.TextDecoder = TextDecoder;
  if (nodeStreams) Object.assign(window, {Blob, Response, CompressionStream, DecompressionStream}); // jsdom lacks streams
  Object.entries(local).forEach(([key, value]) => window.localStorage.setItem(key, value));
  settings.forEach((key) => window.localStorage.setItem(`bt-setting-${key}`, 'on'));
  // Stand-in for the site's own dropdown: clicking an option selects it.
  const rarity = window.document.querySelector('.search-advanced-pane.blue .filter-property:nth-of-type(2) input');
  rarity.closest('.multiselect').querySelectorAll('.multiselect__option').forEach((option) => {
    option.addEventListener('click', () => (rarity.value = option.textContent.trim()));
  });
  if (rarityValue) rarity.value = rarityValue;
  window.eval(readFileSync(new URL('../dist/chrome/content.js', import.meta.url), 'utf8'));
  await sleep(150);

  return {window, document: window.document, store};
};

const click = (element) => element.dispatchEvent(new element.ownerDocument.defaultView.MouseEvent('click', {bubbles: true}));
const type = (input, value) => {
  // Like a real keystroke: "beforeinput" sees the old value, then the value changes.
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('beforeinput', {bubbles: true}));
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', {bubbles: true}));
};
const tab = (document, label) => [...document.querySelectorAll('.bt-root-page-menu-item')].find((t) => t.textContent.trim() === label);
const button = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

test('sidebar renders beside the page and starts on Bookmarks', async () => {
  const {document} = await load();

  assert.ok(document.getElementById('better-trading-container'));
  assert.ok(document.body.classList.contains('bt-body'));
  assert.ok(document.querySelector('.container-fluid').classList.contains('bt-page'));
  assert.deepEqual([...document.querySelectorAll('.bt-root-page-menu-item')].map((t) => t.textContent.trim()), ['Bookmarks', 'Bulk', 'History', 'Settings']);
  assert.equal(document.querySelector('.bt-root-page-menu-item.is-active').textContent.trim(), 'Bookmarks');
  assert.match(document.title, /Staff - Trade - Path of Exile/);
});

test('settings are off by default and turn features on', async () => {
  const {document, window} = await load();
  const search = document.querySelector('.search-left input');

  type(search, 'bel');
  assert.equal(search.value, 'bel');
  assert.equal(document.querySelector('.bt-tier-button'), null);
  assert.equal(document.querySelector('.bt-mod-filter'), null);

  click(tab(document, 'Settings'));
  await sleep(50);
  const box = (label) => [...document.querySelectorAll('.bt-form-checkbox')].find((b) => b.textContent.trim() === label);
  const isChecked = (label) => box(label).querySelector('.bt-form-checkbox-indicator').classList.contains('is-active');
  const titles = () => [...document.querySelectorAll('.bt-settings-section-title')];
  assert.deepEqual(titles().map((h) => h.textContent.replace(/^[\u25B8\u25BE]/, '')), ['Search form', 'Results', 'Live search', 'Panel', 'Tabs']);
  // Each section folds when its title is clicked, and stays folded (remembered).
  click(titles()[2]);
  await sleep(50);
  assert.equal(document.querySelectorAll('.bt-settings-section')[2].querySelector('.bt-form-checkbox'), null);
  assert.equal(window.localStorage.getItem('bt-settings-folded'), 'Live search');
  click(titles()[2]);
  await sleep(50);
  assert.equal(window.localStorage.getItem('bt-settings-folded'), null);
  assert.deepEqual([...document.querySelectorAll('.bt-settings .bt-form-checkbox')].map((b) => b.textContent.trim()), [
    'Fuzzy search', 'Tier search', 'Stat filters are collapsible', 'Item rarity starts on Any Non-Unique',
    'Keep the search bar on screen while scrolling',
    'Highlight searched mods', 'Plus / Minus buttons on result mods', 'Equivalent prices (from poe.ninja)',
    'Price summary above the results (lowest / median / highest)',
    'Group identical listings from the same seller',
    'Play a sound when a live search finds new items',
    'Desktop notification when a live search finds new items (while the tab is in the background)',
    'Show panel when hovering the icon', 'Show the lowest price and listing count on bookmarks', 'Back up bookmarks automatically (Downloads/Better Trading 2)',
    'Bookmarks', 'Pinned items', 'Bulk', 'History',
  ]);
  assert.equal(isChecked('Highlight searched mods'), true);
  assert.equal(isChecked('Item rarity starts on Any Non-Unique'), false);
  assert.equal(isChecked('Fuzzy search'), false);
  assert.equal(isChecked('Tier search'), false);

  // Advanced filtering only shows once Tier search is ticked.
  assert.equal(box('Advanced filtering'), undefined);

  click(box('Fuzzy search'));
  await sleep(50);
  click(box('Tier search'));
  await sleep(100);
  assert.equal(isChecked('Fuzzy search'), true);
  assert.ok(box('Advanced filtering'));
  assert.equal(isChecked('Advanced filtering'), false);

  type(search, '');
  type(search, 'bel');
  assert.equal(search.value, '~bel');
  // The "~" is only added when typing starts in an empty box: delete it and it stays gone.
  type(search, 'bel');
  assert.equal(search.value, 'bel');
  type(search, 'belt');
  assert.equal(search.value, 'belt');
  type(search, '');
  type(search, 'b');
  assert.equal(search.value, '~b', 'added again after emptying the box');
  // Typing over all of the text (selected) also starts again with "~".
  const Event = search.ownerDocument.defaultView.Event;
  search.value = 'old text';
  search.setSelectionRange(0, search.value.length);
  search.dispatchEvent(new Event('beforeinput', {bubbles: true}));
  search.value = 'r';
  search.dispatchEvent(new Event('input', {bubbles: true}));
  assert.equal(search.value, '~r', 'typing over selected text adds it');
  // Part of the text selected: not added.
  search.value = 'old text';
  search.setSelectionRange(0, 3);
  search.dispatchEvent(new Event('beforeinput', {bubbles: true}));
  search.value = 'r text';
  search.dispatchEvent(new Event('input', {bubbles: true}));
  assert.equal(search.value, 'r text');
  type(search, 'bel');
  assert.equal(document.querySelectorAll('.bt-tier-button').length, 1, 'only the explicit stat gets a tier button');

  // Without Advanced filtering: no filter box, and picking a tier only fills the min box.
  assert.equal(document.querySelector('.bt-mod-filter'), null);
  click(document.querySelector('.bt-tier-button'));
  click(document.querySelectorAll('#bt-tier-popup .bt-tier-popup-row')[0]);
  await sleep(100);
  assert.equal(document.querySelector('.search-advanced-pane.brown input.minmax').value, '175');
  assert.equal(document.querySelectorAll('.resultset .row.bt-mod-filter-hidden').length, 0, 'nothing is filtered');

  // With it: the filter box appears (on the Bookmarks tab).
  click(box('Advanced filtering'));
  await sleep(100);
  assert.equal(document.querySelector('.bt-mod-filter'), null, 'not on the Settings tab');
  click(tab(document, 'Bookmarks'));
  await sleep(50);
  assert.ok(document.querySelector('.bt-mod-filter'));
});

test('tier picker fills the min box for the selected item category', async () => {
  const {document} = await load({settings: ['tier-search']});

  click(document.querySelector('.bt-tier-button'));
  const popup = document.getElementById('bt-tier-popup');
  assert.match(popup.querySelector('.bt-tier-popup-section').textContent, /Prefix · Staff/);
  const first = popup.querySelector('.bt-tier-popup-row');
  assert.match(first.textContent, /T1Runicilvl 84175–200/);
  click(first);
  assert.equal(document.querySelector('.search-advanced-pane.brown input.minmax').value, '175');
});

test('with Item Category blank, the tier picker uses the item named in the search box', async () => {
  const {document} = await load({settings: ['tier-search']});
  document.querySelector('.search-advanced-pane.blue .filter-property input').value = 'Any'; // how the site shows no Item Category
  const searchBox = document.querySelector('.search-bar .search-left input');
  const open = () => {
    document.getElementById('bt-tier-popup')?.remove();
    document.querySelectorAll('.bt-tier-button.is-open').forEach((b) => b.classList.remove('is-open'));
    click(document.querySelector('.bt-tier-button'));
    return document.getElementById('bt-tier-popup');
  };

  // A base type in the search box (here inside a longer name) sets the item type.
  searchBox.value = "Some Unique Imperial Staff";
  let popup = open();
  assert.match(popup.textContent, /Item type from the search box: Imperial Staff \(Staff\)/);
  assert.match(popup.querySelector('.bt-tier-popup-section').textContent, /Prefix · Staff/);
  assert.match(popup.querySelector('.bt-tier-popup-row').textContent, /T1Runicilvl 84175–200/);

  // A jewel: only jewel tiers, not every item type's.
  searchBox.value = 'Crimson Jewel';
  popup = open();
  assert.match(popup.textContent, /Item type from the search box: Crimson Jewel \(Jewel\)/);

  // A plain word works too.
  searchBox.value = 'staff';
  popup = open();
  assert.match(popup.textContent, /Item type from the search box: Staff\./);
  assert.match(popup.querySelector('.bt-tier-popup-section').textContent, /Prefix · Staff/);

  // Nothing recognisable: every item type, with the usual hint to pick a category.
  searchBox.value = '';
  popup = open();
  assert.doesNotMatch(popup.textContent, /from the search box/);
  assert.match(popup.textContent, /Pick an Item Category/);
});

test('picking a tier also filters the loaded results, and the two stay in step', async () => {
  const {document} = await load({settings: ['tier-search', 'advanced-filtering']});
  const box = document.querySelector('.bt-mod-filter input');
  const min = document.querySelector('.search-advanced-pane.brown input.minmax');
  const hidden = () => document.querySelectorAll('.resultset .row.bt-mod-filter-hidden').length;
  const pick = async (index) => {
    click(document.querySelector('.bt-tier-button'));
    click(document.querySelectorAll('#bt-tier-popup .bt-tier-popup-row')[index]);
    await sleep(100);
  };

  // T1: the sample results only have this mod at P2, so both are hidden.
  await pick(0);
  assert.equal(min.value, '175');
  assert.equal(box.value, 'increased spell damage p1');
  assert.equal(hidden(), 2);

  // T2 replaces the T1 term and shows them again.
  await pick(1);
  assert.equal(min.value, '150');
  assert.equal(box.value, 'increased spell damage p2+');
  assert.equal(hidden(), 0);

  // Clearing the filter box clears the min the picker filled in.
  click(button(document.querySelector('.bt-mod-filter'), '\u00d7'));
  await sleep(100);
  assert.equal(box.value, '');
  assert.equal(min.value, '');

  // Changing the min by hand drops the term, and keeps what else was typed in the box.
  await pick(1);
  type(box, 'increased spell damage p2+, wizard');
  await sleep(50);
  type(min, '90');
  await sleep(100);
  assert.equal(box.value, 'wizard');
  assert.equal(min.value, '90');
});

test('a new search loads all results by itself when the filter box has text', async () => {
  const {document} = await load({settings: ['tier-search', 'advanced-filtering']});
  const resultset = document.querySelector('.resultset');
  const controls = resultset.querySelector('.row.controls');
  let loads = 0;
  let nextId = 0;
  const addRows = (count) => {
    for (let i = 0; i < count; i++) {
      const holder = document.createElement('div');
      holder.innerHTML = row.replace(/data-id="[^"]+"/, `data-id="new-${nextId++}"`);
      resultset.insertBefore(holder.firstChild, controls);
    }
  };
  const newSearch = () => {
    resultset.querySelectorAll('.row[data-id]').forEach((old) => old.remove());
    addRows(2);
  };
  controls.querySelector('button').addEventListener('click', () => {
    loads++;
    setTimeout(() => {
      addRows(2);
      if (loads === 2) controls.remove(); // the site removes the button once everything is loaded
    }, 50);
  });

  // Empty filter box: a new search loads nothing extra.
  newSearch();
  await sleep(2200);
  assert.equal(loads, 0);

  // With filter text: the next search keeps loading until the site has no more.
  type(document.querySelector('.bt-mod-filter input'), 'glyphic');
  await sleep(100);
  newSearch();
  await sleep(9000);
  assert.equal(loads, 2);
  assert.equal(resultset.querySelectorAll('.row[data-id]').length, 6);
  assert.match(document.querySelector('.bt-mod-filter-scan-status').textContent, /that is all of them/);
});

test('mods you are looking for are highlighted in the colour picked in Settings', async () => {
  const {document, window} = await load({settings: ['tier-search', 'advanced-filtering']});
  const style = window.document.documentElement.style;
  assert.equal(style.getPropertyValue('--bt-highlight-bg'), 'rgba(51, 170, 68, 0.35)', 'green by default');

  // The stat filter of the search ("#% increased Spell Damage") is highlighted on each result.
  const firstRow = document.querySelector('.resultset > .row[data-id]');
  assert.equal(firstRow.querySelectorAll('.item-mod.bt-highlight-stat-filters').length, 2);

  // So are the mods matching the tier search box.
  type(document.querySelector('.bt-mod-filter input'), 'steadiness');
  await sleep(100);
  const highlighted = firstRow.querySelectorAll('.item-mod.bt-mod-filter-highlight');
  assert.equal(highlighted.length, 1);
  assert.match(highlighted[0].textContent, /Accuracy Rating/);

  type(document.querySelector('.bt-mod-filter input'), '');
  await sleep(100);
  assert.equal(firstRow.querySelectorAll('.bt-mod-filter-highlight').length, 0);

  // Picking another colour applies at once and is remembered.
  click(tab(document, 'Settings'));
  await sleep(50);
  const picker = document.querySelector('.bt-settings-color');
  assert.equal(picker.value, '#33aa44');
  type(picker, '#ff0000');
  assert.equal(style.getPropertyValue('--bt-highlight-bg'), 'rgba(255, 0, 0, 0.35)');
  assert.equal(window.localStorage.getItem('bt-highlight-color'), '#ff0000');
});

test('searched mods stay highlighted with Tier search on and Advanced filtering off', async () => {
  const {document} = await load({settings: ['tier-search']});
  assert.ok(document.querySelector('.bt-tier-button'), 'the tier button sits inside the stat name');

  // Results of a new search arrive after the tier button is already in place.
  const resultset = document.querySelector('.resultset');
  resultset.querySelectorAll('.row[data-id]').forEach((old) => old.remove());
  const holder = document.createElement('div');
  holder.innerHTML = row.replace(/data-id="[^"]+"/, 'data-id="fresh"');
  resultset.prepend(holder.firstChild);
  await sleep(200);

  const fresh = document.querySelector('.row[data-id="fresh"]');
  assert.equal(fresh.querySelectorAll('.item-mod.bt-highlight-stat-filters').length, 2);
  assert.equal(document.querySelector('.bt-mod-filter'), null, 'no filter box without Advanced filtering');
});

test('the result filter only shows on the Bookmarks tab', async () => {
  const {document} = await load({settings: ['tier-search', 'advanced-filtering']});
  assert.ok(document.querySelector('.bt-mod-filter'));

  for (const label of ['Bulk', 'History', 'Settings']) {
    click(tab(document, label));
    await sleep(50);
    assert.equal(document.querySelector('.bt-mod-filter'), null, `hidden on ${label}`);
  }

  // Leaving the tab keeps what was typed and keeps filtering the results.
  click(tab(document, 'Bookmarks'));
  await sleep(50);
  type(document.querySelector('.bt-mod-filter input'), 'p1');
  await sleep(100);
  click(tab(document, 'History'));
  await sleep(100);
  assert.equal(document.querySelectorAll('.resultset .row.bt-mod-filter-hidden').length, 2);
  click(tab(document, 'Bookmarks'));
  await sleep(50);
  assert.equal(document.querySelector('.bt-mod-filter input').value, 'p1');
});

test('History records only searches you run, as plain text', async () => {
  const {document, store, window} = await load();
  const searchButton = document.querySelector('.controls .search-btn');

  // Loading the page records nothing.
  await sleep(300);
  assert.equal(store['trade-history'], undefined);

  // Pressing Search, then the site moving to the new search, records it straight away.
  click(searchButton);
  window.history.pushState({}, '', '/trade/search/Standard/new456');
  await sleep(250);
  const entry = store['trade-history'].value[0];
  assert.equal(entry.slug, 'new456');
  assert.equal(entry.title, 'Staff');
  assert.equal(entry.stats, undefined, 'no mods are stored');

  // Running the same search again keeps the address: it is recorded when the new results appear.
  click(tab(document, 'History'));
  await sleep(50);
  click(tab(document, 'Bookmarks'));
  const resultset = document.querySelector('.resultset');
  window.history.pushState({}, '', '/trade/search/Standard/abc123');
  await sleep(1200);
  click(searchButton);
  const rows = [...resultset.querySelectorAll('.row[data-id]')];
  rows.forEach((r) => r.remove());
  await sleep(150);
  rows.forEach((r) => resultset.prepend(r));
  await sleep(300);
  assert.equal(store['trade-history'].value[0].slug, 'abc123', 'repeat search recorded without waiting');
  store['trade-history'].value.shift();

  // Moving to another search without pressing Search (a bookmark or link) is not recorded.
  window.history.pushState({}, '', '/trade/search/Standard/opened789');
  await sleep(1200);
  assert.equal(store['trade-history'].value.length, 1, 'opening another search by link is not recorded');

  // The History tab shows the name and league, no mods and no link text.
  click(tab(document, 'History'));
  await sleep(100);
  const shown = document.querySelector('.bt-history-entry-link');
  assert.equal(shown.querySelector('.bt-history-entry-title').textContent, 'Staff');
  assert.equal(shown.querySelector('.bt-history-entry-stats'), null);
  assert.doesNotMatch(shown.textContent, /new456|search\//);
});

test('item rarity can start on Any Non-Unique', async () => {
  const rarityOf = (document) => document.querySelector('.search-advanced-pane.blue .filter-property:nth-of-type(2) input').value;

  // Off by default.
  const off = await load({path: '/trade/search/Standard'});
  assert.equal(rarityOf(off.document), 'Any');

  // On: a fresh trade page starts on Any Non-Unique, and so does the form after "Clear".
  const fresh = await load({path: '/trade/search/Standard', settings: ['default-non-unique']});
  assert.equal(rarityOf(fresh.document), 'Any Non-Unique');
  fresh.document.querySelector('.search-advanced-pane.blue .filter-property:nth-of-type(2) input').value = 'Any';
  click(fresh.document.querySelector('.controls .clear-btn'));
  await sleep(400);
  assert.equal(rarityOf(fresh.document), 'Any Non-Unique');

  // An opened search keeps its own rarity, and a rarity you chose is left alone.
  const opened = await load({settings: ['default-non-unique']});
  assert.equal(rarityOf(opened.document), 'Any');
  const chosen = await load({path: '/trade/search/Standard', settings: ['default-non-unique'], rarityValue: 'Rare'});
  assert.equal(rarityOf(chosen.document), 'Rare');
});

test('tier search filter hides results that do not match', async () => {
  const {document} = await load({settings: ['tier-search', 'advanced-filtering']});

  const input = document.querySelector('.bt-mod-filter input');
  type(input, 'p1');
  await sleep(100);
  assert.equal(document.querySelectorAll('.resultset .row.bt-mod-filter-hidden').length, 2);
  type(input, 'glyphic p2');
  await sleep(100);
  assert.equal(document.querySelectorAll('.resultset .row.bt-mod-filter-hidden').length, 0);
});

test('results get a Pin button, and identical listings are grouped', async () => {
  const {document} = await load({settings: ['tab-pinned-items']});
  const rows = [...document.querySelectorAll('.resultset > .row[data-id]')];

  assert.ok(rows.every((r) => r.hasAttribute('bt-enhanced')));
  assert.ok(rows.every((r) => r.querySelector('.bt-pin-button')));
  assert.equal(rows[1].getAttribute('bt-regroup-state'), 'hidden');
  assert.equal(rows[0].querySelector('.bt-group-button').textContent, '1 similar result');
  assert.ok(rows[0].querySelector('.item-mod.bt-highlight-stat-filters'), 'searched stat is highlighted');

  click(rows[0].querySelector('.bt-pin-button'));
  await sleep(50);
  assert.ok(rows[0].classList.contains('bt-pinned'));
  click(tab(document, 'Pinned'));
  await sleep(50);
  assert.equal(document.querySelectorAll('.bt-pinned-item-wrapper').length, 1);
  assert.match(document.querySelector('.bt-pinned-item-wrapper').textContent, /Rage Bane/);
  assert.ok(button(document, 'Scroll to the item result'));
});

test('bookmarks: create a folder, register the current trade, back up and restore', async () => {
  const {document, store, window} = await load();

  click(button(document, 'New folder'));
  await sleep(30);
  assert.equal(document.querySelector('.bt-modal-header-title').textContent.trim(), 'Bookmark folder');
  type(document.querySelector('.bt-modal-container input'), 'My build');
  await sleep(30);
  click(document.querySelector('.bt-icon-options.with-ascendancies .bt-icon-option'));
  await sleep(30);
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(100);

  assert.equal(store['bookmark-folders'].value[0].title, 'My build');
  assert.equal(store['bookmark-folders'].value[0].icon, 'slayer');
  const folderId = store['bookmark-folders'].value[0].id;

  click(button(document, 'Register current trade'));
  await sleep(30);
  assert.equal(document.querySelector('.bt-modal-container input').value, 'Staff');
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(100);

  const trades = store[`bookmark-trades--${folderId}`].value;
  assert.deepEqual(trades[0].location, {version: '1', type: 'search', slug: 'abc123'});
  const link = document.querySelector('.bt-folder-trade-link');
  assert.equal(link.getAttribute('href'), 'https://www.pathofexile.com/trade/search/Standard/abc123');
  assert.match(document.querySelector('.bt-flash-messages').textContent, /The trade "Staff" has been created\./);

  // Opening a page is not a search: History stays empty.
  assert.equal(store['trade-history'], undefined);

  // A backup file restores into a fresh browser.
  const backup = await new Promise((resolve) => {
    window.URL.createObjectURL = (blob) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);

      return 'blob:test';
    };
    window.URL.revokeObjectURL = () => {};
    click(button(document, 'Save file'));
  });
  assert.match(backup, /^3:[A-Za-z0-9+/=]+\n-{20}\n$/);

  const fresh = await load();
  const fileInput = fresh.document.querySelector('input[type=file]');
  Object.defineProperty(fileInput, 'files', {value: [{text: async () => backup}], configurable: true});
  fileInput.dispatchEvent(new fresh.window.Event('change', {bubbles: true}));
  await sleep(150);
  assert.equal(fresh.store['bookmark-folders'].value[0].title, 'My build');
  const restoredId = fresh.store['bookmark-folders'].value[0].id;
  assert.equal(fresh.store[`bookmark-trades--${restoredId}`].value[0].title, 'Staff');
});

test('a folder can be deleted, with its bookmarks, from its menu', async () => {
  const {document, store, window} = await load();
  const folder = {id: 'f1', title: 'My build', version: '1', icon: null, archivedAt: null};
  await window.chrome.storage.local.set({
    'bookmark-folders': {value: [folder], expiresAt: null},
    'bookmark-trades--f1': {value: [{id: 't1', title: 'A', completedAt: null, location: {version: '1', type: 'search', slug: 'a'}}, {id: 't2', title: 'B', completedAt: null, location: {version: '1', type: 'search', slug: 'b'}}], expiresAt: null},
  });
  click(tab(document, 'History'));
  await sleep(50);
  click(tab(document, 'Bookmarks'));
  await sleep(150);

  const menu = document.querySelector('.bt-folder-header .bt-contextual-menu');
  menu.dispatchEvent(new window.MouseEvent('click', {bubbles: true, clientX: 300, clientY: 100}));
  await sleep(50);
  const items = [...document.querySelectorAll('.bt-contextual-menu-item')].map((item) => item.textContent.trim());
  assert.deepEqual(items, ['Edit', 'Archive', 'Export/Share', 'Delete']);

  click([...document.querySelectorAll('.bt-contextual-menu-item')].find((item) => item.textContent.trim() === 'Delete'));
  await sleep(50);
  assert.match(document.querySelector('.bt-deletion-confirmation').textContent, /My build.*2 bookmarks/);
  click(button(document.querySelector('.bt-modal-container'), 'Delete'));
  await sleep(150);

  assert.deepEqual(store['bookmark-folders'].value, []);
  assert.equal(store['bookmark-trades--f1'], undefined);
  assert.equal(document.querySelectorAll('.bt-folder').length, 0);
});

test('folder strings exported by the original Better Trading still import', async () => {
  const {document, store, window} = await load();
  const samples = [
    'eyJpY24iOiJleGFsdCIsInRpdCI6InRlc3QgZm9sZGVyIiwidHJzIjpbeyJ0aXQiOiJ0ZXN0IHRyYWRlIiwibG9jIjoic2VhcmNoOm93V0pRRWtpbCJ9XX0=',
    '2:eyJpY24iOiJleGFsdCIsInRpdCI6InRlc3QgZm9sZGVyIPCfl4EiLCJ0cnMiOlt7InRpdCI6InRlc3QgdHJhZGUg8J+amiIsImxvYyI6InNlYXJjaDpvd1dKUUVraWwifV19',
    '3:eyJpY24iOiJhc2NlbmRhbnQiLCJ0aXQiOiJ0ZXN0IFBvRSAxIGZvbGRlciDwn5eBIiwidmVyIjoiMSIsInRycyI6W3sidGl0IjoidGVzdCBQb0UgMSB0cmFkZSDwn5qaIiwibG9jIjoiMTpzZWFyY2g6Zm9vYmFyIn1dfQ==',
  ];

  for (const sample of samples) {
    click(button(document, 'Import folder'));
    await sleep(30);
    type(document.querySelector('.bt-modal-container input'), sample);
    await sleep(30);
    document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    await sleep(100);
  }

  const folders = store['bookmark-folders'].value;
  assert.deepEqual(folders.map((f) => f.title), ['test folder', 'test folder \u{1F5C1}', 'test PoE 1 folder \u{1F5C1}']);
  assert.deepEqual(store[`bookmark-trades--${folders[0].id}`].value[0].location, {version: '1', type: 'search', slug: 'owWJQEkil'});
  assert.equal(store[`bookmark-trades--${folders[2].id}`].value[0].location.slug, 'foobar');
});

test('every group in the stat filter list can be collapsed, and the choice is remembered', async () => {
  const list = `<div class="filter-select-mutate"><ul>
    <li class="multiselect__element"><span class="multiselect__option multiselect__option--disabled">Pseudo</span></li>
    <li class="multiselect__element"><span class="multiselect__option"><span class="mutate-type mutate-type-pseudo">pseudo</span> +# total maximum Life</span></li>
    <li class="multiselect__element"><span class="multiselect__option multiselect__option--disabled">Explicit</span></li>
    <li class="multiselect__element"><span class="multiselect__option"><span class="mutate-type mutate-type-explicit">explicit</span> #% increased Spell Damage</span></li>
  </ul></div>`;
  const {document, window} = await load({script: list, local: {'bt-collapsed-stat-groups': '["pseudo"]'}, settings: ['collapsible-stat-groups']});
  const style = () => document.getElementById('bt-collapsed-stat-groups').textContent;
  // Hidden groups are remembered.
  assert.match(style(), /mutate-type-pseudo\) \{ display: none/);
  assert.doesNotMatch(style(), /mutate-type-explicit/);

  const explicitHeading = [...document.querySelectorAll('.multiselect__option--disabled')].find((h) => h.textContent === 'Explicit');
  click(explicitHeading);
  assert.match(style(), /mutate-type-explicit\) \{ display: none/);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('bt-collapsed-stat-groups')).sort(), ['explicit', 'pseudo']);

  click(explicitHeading);
  assert.doesNotMatch(style(), /mutate-type-explicit/);
});

test('the hover setting is labelled "Show panel when hovering the icon"', async () => {
  const {document} = await load();
  click([...document.querySelectorAll('.bt-root-page-menu-item')].find((tab) => tab.textContent.includes('Settings')));
  await sleep(50);
  assert.ok(document.body.textContent.includes('Show panel when hovering the icon'));
});

test('stat filter groups only collapse while "Stat filters are collapsible" is on (off by default)', async () => {
  const list = `<div class="filter-select-mutate"><ul>
    <li class="multiselect__element"><span class="multiselect__option multiselect__option--disabled">Explicit</span></li>
    <li class="multiselect__element"><span class="multiselect__option"><span class="mutate-type mutate-type-explicit">explicit</span> #% increased Spell Damage</span></li>
  </ul></div>`;
  const {document, window} = await load({script: list, local: {'bt-collapsed-stat-groups': '["explicit"]'}});
  const style = () => document.getElementById('bt-collapsed-stat-groups').textContent;
  // Off: nothing hidden, headings untouched, clicks ignored.
  assert.equal(style(), '');
  assert.ok(!document.body.classList.contains('bt-collapsible-stat-groups'));
  click(document.querySelector('.multiselect__option--disabled'));
  assert.equal(window.localStorage.getItem('bt-collapsed-stat-groups'), '["explicit"]');

  // Turning the setting on applies the remembered groups straight away.
  click([...document.querySelectorAll('.bt-root-page-menu-item')].find((tab) => tab.textContent.includes('Settings')));
  await sleep(50);
  const box = [...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((b) => b.textContent.includes('Stat filters are collapsible'));
  click(box.querySelector('input') || box);
  await sleep(50);
  assert.ok(document.body.classList.contains('bt-collapsible-stat-groups'));
  assert.match(style(), /mutate-type-explicit\) \{ display: none/);
});

// ---- Add build (Path of Building import) ------------------------------------------------

const POB_XML = `<PathOfBuilding>
<Build className="Ranger" ascendClassName="Deadeye" level="95"/>
<Tree activeSpec="1"><Spec><Sockets><Socket nodeId="1" itemId="3"/><Socket nodeId="2" itemId="0"/></Sockets></Spec></Tree>
<Items activeItemSet="1">
<Item id="1">Rarity: RARE
Doom Crown
Hubris Circlet
Item Level: 84
Implicits: 0
+90 to maximum Energy Shield
+42% to Fire Resistance
17% reduced Mana Cost of Skills
{crafted}+1 to Level of Socketed Gems
Some line the trade site does not know</Item>
<Item id="2">Rarity: UNIQUE
Kaom's Heart
Glorious Plate
Variant: Pre 3.0
Variant: Current
Selected Variant: 2
Implicits: 0
{variant:1}+(30-40)% to Fire Resistance
{variant:2}+(500-600) to maximum Life
{crafted}+42% to Fire Resistance</Item>
<Item id="3">Rarity: RARE
Dusk Delirium
Viridian Jewel
Implicits: 0
7% increased maximum Life</Item>
<Item id="5">Rarity: UNIQUE
My Example Ring
Gold Ring
Implicits: 0
+90 to maximum Energy Shield</Item>
<Item id="6">Rarity: RARE
Example Bow
Best Bow Base
Implicits: 0
+42% to Fire Resistance</Item>
<Item id="8">Rarity: MAGIC
Alchemist's Divine Life Flask of Staunching
Item Level: 82
Quality: 20
Implicits: 0
25% increased effect
23% reduced Duration
Grants Immunity to Bleeding for 4 seconds if used while Bleeding
Grants Immunity to Corrupted Blood for 4 seconds if used while affected by Corrupted Blood
Gain 2 Charges when you are Hit by an Enemy</Item>
<Item id="4">Rarity: RARE
Swap Bow
Spine Bow
Implicits: 0</Item>
<Item id="7">Rarity: RARE
Starter Cap
Hubris Circlet
Implicits: 0
+40 to maximum Energy Shield</Item>
<ItemSet id="2" title="Leveling"><Slot name="Helmet" itemId="7"/></ItemSet>
<ItemSet id="1" title="Endgame"><Slot name="Flask 1" itemId="8"/><Slot name="Ring 1" itemId="5"/><Slot name="Weapon 1" itemId="6"/><Slot name="Helmet" itemId="1"/><Slot name="Body Armour" itemId="2"/><Slot name="Weapon 1 Swap" itemId="4"/><Slot name="Gloves" itemId="0"/></ItemSet>
</Items>
</PathOfBuilding>`;
const POB_CODE = deflateSync(Buffer.from(POB_XML)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

const TRADE_DATA = {
  stats: {result: [
    {id: 'explicit', entries: [
      {id: 'explicit.stat_es', text: '+# to maximum Energy Shield'},
      {id: 'explicit.stat_es_local', text: '+# to maximum Energy Shield (Local)'},
      {id: 'explicit.stat_fire', text: '+#% to Fire Resistance'},
      {id: 'explicit.stat_mana_cost', text: '#% increased Mana Cost of Skills'},
      {id: 'explicit.stat_gems', text: '+# to Level of Socketed Gems'},
      {id: 'explicit.stat_life_pct', text: '#% increased maximum Life'},
      {id: 'explicit.stat_life', text: '+# to maximum Life'},
      {id: 'explicit.indexable_support_multistrike', text: 'Socketed Gems are Supported by Level # Multistrike Support'},
      {id: 'explicit.indexable_support_pierce', text: 'Socketed Gems are Supported by Level # Pierce'},
      {id: 'explicit.indexable_support_fork_a', text: 'Socketed Gems are Supported by Level # Fork'},
      {id: 'explicit.indexable_support_fork_b', text: 'Socketed Gems are Supported by Level # Fork Support'},
      {id: 'explicit.stat_effect', text: '#% increased effect'},
      {id: 'explicit.stat_charge_hit', text: 'Gain # Charge when you are Hit by an Enemy'},
      {id: 'explicit.stat_duration', text: '#% increased Duration'},
      {id: 'explicit.stat_bleed_immunity', text: 'Grants Immunity to Bleeding for # seconds if used while Bleeding\nGrants Immunity to Corrupted Blood for # seconds if used while affected by Corrupted Blood'},
    ]},
    {id: 'crafted', entries: [{id: 'crafted.stat_gems', text: '+# to Level of Socketed Gems'}]},
  ]},
  items: {result: [
    {id: 'armour', entries: [{type: 'Hubris Circlet'}, {type: 'Glorious Plate'}, {name: "Kaom's Heart", type: 'Glorious Plate'}, {type: 'Girded Tower Shield'}, {name: 'Svalinn', type: 'Girded Tower Shield'}]},
    {id: 'weapon', entries: [{type: 'Spine Bow'}]},
    {id: 'jewel', entries: [{type: 'Viridian Jewel'}, {type: 'Large Cluster Jewel'}]},
    {id: 'flask', entries: [{type: 'Divine Life Flask'}]},
  ]},
};
const tradeData = async (url) => {
  const match = /\/api\/trade\/data\/(stats|items)$/.exec(url);
  return match ? {ok: true, json: async () => TRADE_DATA[match[1]]} : null;
};
const decodeSlug = (slug) => JSON.parse(gunzipSync(Buffer.from(slug.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString());

const addBuild = async (document, window, input, setTitle = null) => {
  click(button(document, 'Add build'));
  await sleep(30);
  type(document.querySelector('.bt-modal-container input'), input);
  await sleep(500); // the build is read shortly after pasting
  if (setTitle) {
    const select = document.querySelector('.bt-build-import-set');
    select.value = [...select.options].find((option) => option.textContent === setTitle).value;
    select.dispatchEvent(new window.Event('change', {bubbles: true}));
    await sleep(30);
  }
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(300);
};

test('Add build turns a Path of Building code into a folder of trade searches', async () => {
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, POB_CODE);

  const folder = store['bookmark-folders'].value[0];
  // The build has two item sets; its own choice ("Endgame") is used unless another is picked.
  assert.equal(folder.title, 'Deadeye \u2013 Endgame');
  assert.equal(folder.icon, 'deadeye');
  const trades = store[`bookmark-trades--${folder.id}`].value;
  // Equipped items and tree jewels, in slot order; weapon swap and empty slots left out.
  assert.deepEqual(trades.map((t) => t.title), [
    'Weapon: Example Bow (Best Bow Base, any base)',
    'Helmet: Doom Crown (Hubris Circlet)',
    "Body Armour: Kaom's Heart",
    'Ring: My Example Ring (not a real unique, searched by mods)',
    'Flask: Divine Life Flask',
    'Jewel: Dusk Delirium (Viridian Jewel)',
  ]);

  // A magic flask: base found inside its name, and every mod kept, including the two-line
  // immunity suffix the trade site lists as a single stat.
  const flask = decodeSlug(trades[4].location.slug);
  assert.equal(flask.type, 'Divine Life Flask');
  assert.deepEqual(flask.stats[0].filters, [
    {id: 'explicit.stat_effect', value: {min: 20}},
    {id: 'explicit.stat_duration'},
    {id: 'explicit.stat_bleed_immunity', value: {min: 3}},
    {id: 'explicit.stat_charge_hit', value: {min: 2}}, // "Charges" written "Charge" on the trade site
  ]);

  // Example items: an invented base falls back to the slot's item type...
  const bow = decodeSlug(trades[0].location.slug);
  assert.equal(bow.type, undefined);
  assert.deepEqual(bow.filters.type_filters.filters, {rarity: {option: 'nonunique'}, category: {option: 'weapon'}});
  assert.deepEqual(bow.stats[0].filters, [{id: 'explicit.stat_fire', value: {min: 33}}]);
  // ...and a made-up unique is searched by its mods, without asking for that name.
  const ring = decodeSlug(trades[3].location.slug);
  assert.equal(ring.name, undefined);
  assert.deepEqual(ring.filters.type_filters.filters, {category: {option: 'accessory.ring'}});
  assert.deepEqual(ring.stats[0].filters, [{id: 'explicit.stat_es', value: {min: 72}}]);

  // A real base type is searched exactly (Hubris Circlet), not the whole helmet category.
  const helmet = decodeSlug(trades[1].location.slug);
  assert.equal(helmet.type, 'Hubris Circlet');
  assert.deepEqual(helmet.filters.type_filters.filters, {rarity: {option: 'nonunique'}});
  assert.deepEqual(helmet.stats[0].filters, [
    {id: 'explicit.stat_es_local', value: {min: 72}}, // armour uses the local stat; 80% of 90
    {id: 'explicit.stat_fire', value: {min: 33}},
    {id: 'explicit.stat_mana_cost'}, // "reduced" = negative "increased": no minimum
    {id: 'crafted.stat_gems', value: {min: 1}}, // small counts stay exact
  ]);
  // Uniques: by name, plus the mods of the version picked in Path of Building, with no values
  // (so any roll matches). Other versions' lines and crafted lines are left out; no trade mode.
  assert.deepEqual(decodeSlug(trades[2].location.slug), {
    name: "Kaom's Heart",
    type: 'Glorious Plate',
    stats: [{type: 'and', filters: [{id: 'explicit.stat_life'}]}],
  });
  assert.equal(decodeSlug(trades[5].location.slug).type, 'Viridian Jewel');
});

test('Add build reads pobb.in links through the background script, and explains bad input', async () => {
  const asked = [];
  const {document, window, store} = await load({
    onFetch: tradeData,
    nodeStreams: true,
    onMessage: (message) => (asked.push(message), message.query === 'pobb-in' ? POB_CODE : null),
  });
  await addBuild(document, window, 'https://pobb.in/rO_I0IZSTuv-');
  assert.deepEqual(JSON.parse(JSON.stringify(asked.filter((m) => m.query === 'pobb-in'))), [{query: 'pobb-in', id: 'rO_I0IZSTuv-'}]);
  assert.equal(store['bookmark-folders'].value.length, 1);

  await addBuild(document, window, 'hello');
  assert.match(document.querySelector('.bt-modal-container').textContent, /Path of Building code or a pobb\.in link/);
  assert.equal(store['bookmark-folders'].value.length, 1);
});

test('Add build lists the build\'s item sets and uses the one picked', async () => {
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  click(button(document, 'Add build'));
  await sleep(30);
  type(document.querySelector('.bt-modal-container input'), POB_CODE);
  await sleep(500);
  const select = document.querySelector('.bt-build-import-set');
  assert.deepEqual([...select.options].map((o) => o.textContent), ['Leveling', 'Endgame']);
  assert.equal(select.options[select.selectedIndex].textContent, 'Endgame'); // the build's active set
  click(button(document, 'Cancel') || document.querySelector('.bt-modal-close') || document.body);

  const fresh = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(fresh.document, fresh.window, POB_CODE, 'Leveling');
  const folder = fresh.store['bookmark-folders'].value[0];
  assert.equal(folder.title, 'Deadeye – Leveling');
  const trades = fresh.store[`bookmark-trades--${folder.id}`].value;
  // Leveling set: just its helmet, plus the jewels in the passive tree.
  assert.deepEqual(trades.map((t) => t.title), ['Helmet: Starter Cap (Hubris Circlet)', 'Jewel: Dusk Delirium (Viridian Jewel)']);
  assert.deepEqual(decodeSlug(trades[0].location.slug).stats[0].filters, [{id: 'explicit.stat_es_local', value: {min: 32}}]);
  void store;
});

// ---- Trade mode (In Person / Instant Buyout) is not tied to saved links ----------------------

const makeSlug = (query) => gzipSync(Buffer.from(JSON.stringify(query))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const LIFE_SEARCH = {stats: [{type: 'and', filters: [{id: 'explicit.stat_3299347043', value: {min: 70}}]}]};

test('bookmarks are saved without the trade mode and open in the mode you are using', async () => {
  // You are on an Instant Buyout search.
  const instantSlug = makeSlug({status: {option: 'securable'}, ...LIFE_SEARCH});
  const {document, window, store} = await load({
    path: `/trade/search/Standard/${instantSlug}`,
    nodeStreams: true,
    local: {'bt-bookmark-folders-expansion': 'f1'},
    seed: undefined,
  });
  await sleep(100);
  // The mode of the search you ran is remembered...
  assert.equal(window.localStorage.getItem('bt-trade-mode-1'), 'securable');

  // ...and an old bookmark saved as "In Person" opens as Instant Buyout.
  const oldSlug = makeSlug({status: {option: 'online'}, ...LIFE_SEARCH});
  await window.chrome.storage.local.set({
    'bookmark-folders': {value: [{id: 'f1', title: 'My build', version: '1', icon: null, archivedAt: null}], expiresAt: null},
    'bookmark-trades--f1': {value: [{id: 't1', title: 'Life helmet', completedAt: null, location: {version: '1', type: 'search', slug: oldSlug}}], expiresAt: null},
  });
  window.dispatchEvent(new window.Event('focus'));
  click(tab(document, 'History'));
  await sleep(50);
  click(tab(document, 'Bookmarks'));
  await sleep(300);
  const link = document.querySelector('.bt-folder-trade-link');
  assert.ok(link, 'bookmark link shown');
  const opened = decodeSlug(link.getAttribute('href').split('/').pop());
  assert.equal(opened.status.option, 'securable');
  assert.deepEqual(opened.stats, LIFE_SEARCH.stats);

  // Registering the current trade saves it with no mode at all.
  click(button(document, 'Register current trade'));
  await sleep(150);
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(150);
  const saved = store['bookmark-trades--f1'].value.find((t) => t.id !== 't1');
  assert.deepEqual(decodeSlug(saved.location.slug), LIFE_SEARCH);
  void store;
});

test('Plus and Minus on result mods add the mod to an And group and a Not group', async () => {
  const {window, document} = await load();
  // Stand-in for the site's search form state, which the page script edits.
  window.app = {state: {stats: [{type: 'and', filters: []}]}};
  window.eval(readFileSync(new URL('../dist/chrome/page.js', import.meta.url), 'utf8'));

  const field = document.querySelector('.resultset > div.row [data-field="stat.explicit.stat_2974417149"]');
  assert.ok(document.querySelector('.bt-mod-buttons'), 'buttons are built while the setting is on');
  const [plus, minus] = field.querySelectorAll('.bt-mod-button');
  assert.equal(plus.textContent, '+');
  assert.equal(minus.textContent, '−');
  // The mod text is unchanged by the buttons.
  assert.equal(field.textContent.replace(/[+−]/g, '').trim(), '16% increased Spell Damage');

  click(plus);
  await sleep(50);
  const stats = () => JSON.parse(JSON.stringify(window.app.state.stats));
  assert.deepEqual(stats(), [
    {type: 'and', filters: []},
    {type: 'and', filters: [{id: 'explicit.stat_2974417149', value: {}, disabled: false}]},
  ]);
  assert.match(document.querySelector('.bt-flash-messages').textContent, /Added to the And group: 16% increased Spell Damage/);

  click(plus); // already there
  await sleep(50);
  assert.equal(stats()[1].filters.length, 1);
  assert.match(document.querySelector('.bt-flash-messages').textContent, /Already in the And group/);

  const other = document.querySelector('.resultset > div.row [data-field="stat.implicit.stat_2885144362"]');
  click(other.querySelector('.bt-mod-button-and'));
  click(other.querySelector('.bt-mod-button-not'));
  await sleep(50);
  assert.deepEqual(stats()[1].filters.map((f) => f.id), ['explicit.stat_2974417149', 'implicit.stat_2885144362']);
  assert.deepEqual(stats()[2], {type: 'not', filters: [{id: 'implicit.stat_2885144362', value: {}, disabled: false}]});
});

test('Plus / Minus buttons can be turned off in Settings', async () => {
  const {document} = await load();
  assert.ok(document.querySelector('.bt-mod-buttons'));
  click(tab(document, 'Settings'));
  await sleep(50);
  const option = [...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((c) => c.textContent.trim() === 'Plus / Minus buttons on result mods');
  assert.ok(option, 'option is in the Settings tab');
  click(option);
  await sleep(50);
  assert.equal(document.querySelector('.bt-mod-buttons'), null, 'turned off: the buttons are removed, not just hidden');
});

test('About has no settings; every result option in Settings turns on and off at once', async () => {
  // poe.ninja's current currency overview format.
  const ninja = {
    core: {primary: 'chaos'},
    lines: [{id: 'chaos', primaryValue: 1}, {id: 'divine', primaryValue: 150}],
    items: [{id: 'chaos', name: 'Chaos Orb'}, {id: 'divine', name: 'Divine Orb'}],
  };
  const asked = [];
  const {window, document} = await load({onMessage: (message) => (message.query === 'poe-ninja' ? (asked.push(message.resource), ninja) : null)});
  assert.match(asked[0], /^\/poe1\/api\/economy\/exchange\/current\/overview\?league=Standard&type=Currency$/);

  // About: only things about the extension.
  const aboutButton = [...document.querySelectorAll('a.bt-header-button')].pop();
  click(aboutButton);
  await sleep(50);
  assert.ok(document.querySelector('.bt-about-sections'), 'About is open');
  assert.equal(document.querySelectorAll('.bt-about-sections .bt-form-checkbox').length, 0);
  click(aboutButton);
  await sleep(50);

  const first = document.querySelector('.resultset > div.row[data-id]');
  // Priced at 100 Chaos: shows as Divines (a Chaos price gets no Chaos equivalent).
  // (its identical twin, the next result, too, so the two are still grouped).
  [...document.querySelectorAll('.resultset > div.row[data-id]')].slice(0, 2).forEach((row) => {
    row.querySelector('[data-field="price"] > br + span').textContent = '100';
  });

  click(tab(document, 'Settings'));
  await sleep(50);
  const box = (label) => [...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((b) => b.textContent.trim() === label);
  const toggle = async (label) => {
    click(box(label));
    await sleep(100);
  };
  const count = (selector) => document.querySelectorAll(selector).length;

  // Settled state after load (the changes above show once results are redone).
  assert.equal(count('.bt-equivalent-pricings'), 0, 'a 5 Chaos price has no equivalent');
  assert.ok(count('.item-mod.bt-highlight-stat-filters') > 0, 'searched mods highlighted');
  assert.equal(count('.bt-group-button'), 1, 'identical listings grouped');

  await toggle('Equivalent prices (from poe.ninja)');
  assert.equal(count('.bt-equivalent-pricings'), 0);
  await toggle('Equivalent prices (from poe.ninja)');
  assert.equal(count('.bt-equivalent-pricings'), 2);
  assert.match(document.querySelector('.bt-equivalent-pricings').textContent, /0\.7×/, '100 Chaos = 0.7 Divine');
  await toggle('Equivalent prices (from poe.ninja)');
  assert.equal(count('.bt-equivalent-pricings'), 0);
  await toggle('Equivalent prices (from poe.ninja)');


  await toggle('Highlight searched mods');
  assert.equal(count('.item-mod.bt-highlight-stat-filters'), 0);
  await toggle('Highlight searched mods');
  assert.ok(count('.item-mod.bt-highlight-stat-filters') > 0);

  await toggle('Group identical listings from the same seller');
  assert.equal(count('.bt-group-button'), 0);
  assert.equal(count('div.row[bt-regroup-state="hidden"]'), 0, 'the hidden copy shows again');
  await toggle('Group identical listings from the same seller');
  assert.equal(count('.bt-group-button'), 1);

  // Redoing never doubles the buttons on a result (and adds no Pin button: Pinned is off).
  assert.equal(first.querySelectorAll('.bt-pin-button').length, 0);
  assert.equal(first.querySelectorAll('.bt-mod-buttons').length, first.querySelectorAll('.item-mod [data-field^="stat."]').length);
  window.close();
});

// Shaped like a real build: two loadouts ("95" open, "Endgame"), each with its own tree and jewels.
const LOADOUT_XML = `<PathOfBuilding>
<Build className="Witch" ascendClassName="Elementalist" level="95"/>
<Tree activeSpec="1">
<Spec title="95"><Sockets><Socket nodeId="1" itemId="12"/></Sockets></Spec>
<Spec title="Endgame"><Sockets><Socket nodeId="1" itemId="11"/><Socket nodeId="2" itemId="11"/><Socket nodeId="3" itemId="0"/></Sockets></Spec>
</Tree>
<Items activeItemSet="1">
<Item id="10">Rarity: RELIC
Svalinn
Girded Tower Shield
Implicits: 0
+(30-40)% to Fire Resistance</Item>
<Item id="11">Rarity: RARE
Cluster Name
Large Cluster Jewel
Implicits: 0
7% increased maximum Life</Item>
<Item id="12">Rarity: RARE
Old Jewel
Viridian Jewel
Implicits: 0
7% increased maximum Life</Item>
<Item id="13">Rarity: RARE
Old Cap
Hubris Circlet
Implicits: 0
+40 to maximum Energy Shield</Item>
<ItemSet id="1" title="95"><Slot name="Helmet" itemId="13"/></ItemSet>
<ItemSet id="2" title="Endgame"><Slot name="Weapon 2" itemId="10"/></ItemSet>
</Items>
</PathOfBuilding>`;
const LOADOUT_CODE = deflateSync(Buffer.from(LOADOUT_XML)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

test('Add build: a loadout brings its own tree jewels; Relics search as uniques', async () => {
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  click(button(document, 'Add build'));
  await sleep(30);
  type(document.querySelector('.bt-modal-container input'), LOADOUT_CODE);
  await sleep(500);
  assert.match(document.querySelector('.bt-modal-container').textContent, /Loadout/);
  assert.equal(document.querySelector('.bt-build-import-set').selectedOptions[0].textContent, '95', 'the build\'s open loadout is picked first');
  click(document.querySelector('.bt-modal-overlay'));
  await sleep(30);

  await addBuild(document, window, LOADOUT_CODE, 'Endgame');
  const folder = store['bookmark-folders'].value[0];
  assert.equal(folder.title, 'Elementalist \u2013 Endgame');
  const trades = store[`bookmark-trades--${folder.id}`].value;
  // Endgame's shield, and Endgame's jewel once (it sits in two sockets); not the "95" tree's jewel.
  assert.deepEqual(trades.map((t) => t.title), ['Weapon: Svalinn', 'Jewel: Cluster Name (Large Cluster Jewel)']);
  const shield = decodeSlug(trades[0].location.slug);
  assert.equal(shield.name, 'Svalinn');
  assert.equal(shield.type, 'Girded Tower Shield');
});

test('Bulk counts listings per seller; tabs can be turned off; Pinned is off by default', async () => {
  const {window, document} = await load();
  const tabs = () => [...document.querySelectorAll('.bt-root-page-menu-item')].map((t) => t.textContent.trim());
  assert.deepEqual(tabs(), ['Bookmarks', 'Bulk', 'History', 'Settings']);
  // Pinned is off, so results have no Pin button showing.
  assert.equal(document.querySelector('.bt-pin-button'), null, 'no Pin buttons while the Pinned tab is off');
  assert.ok(!document.body.classList.contains('bt-sticky-search'), 'the search bar is not pinned by default');

  // Give the results three sellers: A twice, B and C once each (the page has 4+ rows).
  const first = document.querySelector('.resultset > div.row[data-id]');
  for (let i = document.querySelectorAll('.resultset > div.row[data-id]').length; i < 4; i++) {
    const copy = first.cloneNode(true);
    copy.setAttribute('data-id', `copy${i}`);
    first.parentNode.append(copy);
  }
  const rows = [...document.querySelectorAll('.resultset > div.row[data-id]')];
  const setSeller = (row, name) => row.querySelectorAll('.profile-link a').forEach((a) => {
    a.textContent = name;
    a.href = `/account/view-profile/${name}`;
  });
  rows.forEach((row, i) => setSeller(row, i < 2 ? 'SellerA#1' : i === 2 ? 'SellerB#2' : `Seller${i}#3`));

  click(tab(document, 'Bulk'));
  await sleep(50);
  const counts = () => [...document.querySelectorAll('.bt-bulk-seller')].map((r) => `${r.querySelector('.bt-bulk-seller-name').textContent} ${r.querySelector('.bt-bulk-seller-count').textContent}`);
  // Only sellers with more than one listing are listed.
  assert.deepEqual(counts(), ['SellerA#1 2']);
  assert.match(document.querySelector('.bt-bulk-summary').textContent, new RegExp(`${rows.length} listings from ${rows.length - 1} sellers, 1 with more than one`));

  // Each seller is a card listing their prices, with Find and Buy.
  const card = document.querySelector('.bt-bulk-seller');
  const listings = () => [...card.querySelectorAll('.bt-bulk-listing')];
  assert.equal(listings().length, 2);
  assert.match(listings()[0].querySelector('.bt-bulk-listing-price').textContent, /Price:\s*5/);
  assert.equal(listings()[0].querySelector('.bt-bulk-listing-currency').alt, 'Chaos Orb');

  // Find: jumps to the listing and outlines it for a moment. The second listing is a
  // copy of the first, tucked into its group: Find opens the group to show it.
  assert.equal(rows[1].getAttribute('bt-regroup-state'), 'hidden');
  click(listings()[1].querySelector('.is-find'));
  await sleep(50);
  assert.equal(rows[1].getAttribute('bt-regroup-state'), 'visible', 'the group was opened');
  assert.ok(rows[1].classList.contains('bt-bulk-found'));

  // Buy: greyed out while the site's own button is expired; otherwise presses it.
  const buy = () => listings()[0].querySelector('.is-buy');
  assert.equal(buy().disabled, true);
  const siteButton = rows[0].querySelector('.direct-btn');
  let pressed = 0;
  siteButton.addEventListener('click', () => pressed++);
  siteButton.disabled = false;
  await sleep(300);
  assert.equal(buy().disabled, false);
  click(buy());
  assert.equal(pressed, 1);

  // The heading folds the card and unfolds it again.
  click(card.querySelector('.bt-bulk-seller-header'));
  await sleep(50);
  assert.equal(listings().length, 0);
  click(card.querySelector('.bt-bulk-seller-header'));
  await sleep(50);
  assert.equal(listings().length, 2);

  // A new listing from SellerB is counted without leaving the tab.
  const extra = rows[3].cloneNode(true);
  extra.setAttribute('data-id', 'extra');
  setSeller(extra, 'SellerB#2');
  extra.querySelector('[data-field="price"] > br + span').textContent = '20';
  rows[3].parentNode.append(extra);
  await sleep(300);
  assert.deepEqual(counts(), ['SellerA#1 2', 'SellerB#2 2']);

  // Each card shows what the seller's listings cost together, and sellers can be sorted by it.
  const totals = () => [...document.querySelectorAll('.bt-bulk-seller-total')].map((t) => t.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(totals(), ['Total:10', 'Total:25']); // the gap is CSS spacing
  const sortBy = async (label) => {
    const select = document.querySelector('.bt-bulk-sort-select');
    select.value = [...select.options].find((option) => option.textContent === label).value;
    select.dispatchEvent(new window.Event('change', {bubbles: true}));
    await sleep(50);
  };
  await sortBy('Highest total price');
  assert.deepEqual(counts(), ['SellerB#2 2', 'SellerA#1 2']);
  await sortBy('Lowest total price');
  assert.deepEqual(counts(), ['SellerA#1 2', 'SellerB#2 2']);
  assert.equal(window.localStorage.getItem('bt-bulk-sort'), 'lowest', 'the choice is remembered');
  await sortBy('Most listings');

  // Settings > Tabs: turn Pinned on and History off.
  click(tab(document, 'Settings'));
  await sleep(50);
  const box = (label) => [...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((b) => b.textContent.trim() === label);
  click(box('Pinned items'));
  click(box('History'));
  await sleep(50);
  assert.deepEqual(tabs(), ['Bookmarks', 'Pinned', 'Bulk', 'Settings']);
  assert.ok(document.querySelector('.resultset .bt-pin-button'), 'turning Pinned on adds Pin buttons to the results');
  window.close();
});

test('result filter: map regexes (poe.re style) filter by properties and mods', async () => {
  const {document} = await load({settings: ['tier-search', 'advanced-filtering']});
  const resultset = document.querySelector('.resultset');
  const template = resultset.querySelector('div.row[data-id]');
  resultset.querySelectorAll('div.row[data-id]').forEach((row) => row.remove());

  // Map results laid out like the live trade site.
  const makeMap = (id, props, mods) => {
    const row = template.cloneNode(true);
    row.setAttribute('data-id', id);
    row.querySelector('.item-popup__header').innerHTML = `<div class="item-popup__header-line">Map ${id}</div><div class="item-popup__header-line">Strand Map (Tier 16)</div>`;
    row.querySelector('.item-popup__content').innerHTML =
      props.map((p) => `<div class="item-property item-popup__property">${p}</div>`).join('') +
      mods.map((m) => `<div class="item-mod item-mod--explicit"><span class="s lc">${m}</span><span class="lc l">P0<span class="d">[1]</span></span></div>`).join('');
    resultset.append(row);
  };
  makeMap('a', ['Item Quantity: +87%', 'Monster Pack Size: +32%'], ['Monsters reflect 18% of Elemental Damage', '21% increased number of Rare Monsters']);
  makeMap('b', ['Item Quantity: +92%', 'Monster Pack Size: +25%'], ['15% more Monster Life']);
  makeMap('c', ['Item Quantity: +45%', 'Monster Pack Size: +10%'], ['15% more Monster Life']);
  await sleep(100);

  const box = document.querySelector('.bt-mod-filter input');
  const shown = async (query) => {
    type(box, query);
    await sleep(100);
    return [...resultset.querySelectorAll('div.row[data-id]:not(.bt-mod-filter-hidden)')].map((r) => r.getAttribute('data-id'));
  };

  // Quantity of 80% or more.
  assert.deepEqual(await shown('"y: \\+([89]\\d|\\d{3})%"'), ['a', 'b']);
  // ...and no elemental reflect.
  assert.deepEqual(await shown('"y: \\+([89]\\d|\\d{3})%" "!ele.*refl|refl.*ele"'), ['b']);
  // "!" outside the quotes works too, and "|" means either.
  assert.deepEqual(await shown('!"monster life"'), ['a']);
  assert.deepEqual(await shown('"rare monsters|pack size: \\+25"'), ['a', 'b']);
  // The matched mod is highlighted.
  await shown('"rare monsters"');
  assert.match(resultset.querySelector('div.row[data-id="a"] .bt-mod-filter-highlight').textContent, /Rare Monsters/);
  // A pattern still being typed (invalid regex) is matched as plain text instead of breaking.
  assert.deepEqual(await shown('"monster life ("'), []);
  // The name lines count too ("Map a", "Strand Map").
  assert.deepEqual(await shown('"map [ab]$"'), ['a', 'b']);
  // Plain words still use the normal mod filter.
  assert.deepEqual(await shown('monster life'), ['b', 'c']);
});

// Implicits and enchantments go into the search unticked (except a cluster jewel's).
const EXTRAS_XML = `<PathOfBuilding>
<Build className="Witch" ascendClassName="Necromancer" level="90"/>
<Items activeItemSet="1">
<Item id="1">Rarity: RARE
Doom Crown
Hubris Circlet
Implicits: 2
{enchant}+42% to Fire Resistance
+40 to maximum Energy Shield
+90 to maximum Life</Item>
<Item id="2">Rarity: UNIQUE
Kaom's Heart
Glorious Plate
Implicits: 1
+40 to maximum Energy Shield
+(500-600) to maximum Life</Item>
<Item id="3">Rarity: RARE
Cluster Name
Large Cluster Jewel
Implicits: 1
{crafted}7% increased maximum Life
+90 to maximum Life</Item>
<ItemSet id="1" title="Main"><Slot name="Helmet" itemId="1"/><Slot name="Body Armour" itemId="2"/></ItemSet>
</Items>
<Tree activeSpec="1"><Spec><Sockets><Socket nodeId="1" itemId="3"/></Sockets></Spec></Tree>
</PathOfBuilding>`;

test('Add build: implicits and enchantments are added unticked', async () => {
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, deflateSync(Buffer.from(EXTRAS_XML)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
  const folder = store['bookmark-folders'].value[0];
  const trades = store[`bookmark-trades--${folder.id}`].value;
  const filtersOf = (title) => decodeSlug(trades.find((t) => t.title.startsWith(title)).location.slug).stats[0].filters;

  // Rare helmet: the mod is ticked; the implicit and the enchant are there but unticked.
  const helmet = filtersOf('Helmet');
  assert.deepEqual(helmet.map((f) => [f.id, Boolean(f.disabled)]), [
    ['explicit.stat_life', false],
    ['explicit.stat_fire', true],
    ['explicit.stat_es_local', true], // armour: the local version of the stat
  ]);

  // Unique: its own mod ticked (no value), its implicit unticked.
  const body = filtersOf('Body Armour');
  assert.deepEqual(body.map((f) => [f.id, Boolean(f.disabled)]), [['explicit.stat_life', false], ['explicit.stat_es_local', true]]);

  // Cluster jewel: its implicit/enchant stays ticked.
  const jewel = filtersOf('Jewel');
  assert.ok(jewel.every((f) => !f.disabled));
  assert.equal(jewel.length, 2);
});

test('bookmarks are backed up to a file automatically after they change', async () => {
  const saved = [];
  const {document, window} = await load({onMessage: (message) => (message.query === 'backup-file' ? (saved.push(message.text), true) : null)});

  click(button(document, 'New folder'));
  await sleep(30);
  type(document.querySelector('.bt-modal-container input'), 'Backed up');
  click(document.querySelector('.bt-icon-options .bt-icon-option'));
  await sleep(30);
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(300);
  assert.equal(saved.length, 0, 'waits a few seconds, so quick changes make one file');
  const status = () => document.querySelector('.bt-backup-status').textContent;
  assert.equal(status(), 'Auto backup saves a few seconds after your bookmarks change.');

  await sleep(5300);
  assert.equal(saved.length, 1);
  // The same format as the Backup button: each folder is "version:base64(JSON)".
  const folder = JSON.parse(Buffer.from(saved[0].split('\n')[0].split(':')[1], 'base64').toString());
  assert.equal(folder.tit, 'Backed up');
  await sleep(50);
  assert.equal(status(), 'Auto backup saved less than 5 seconds ago.');

  // Nothing changed: no new file. Turned off: no file either.
  // (Turned off in another tab: this tab hears about it.)
  window.localStorage.setItem('bt-setting-auto-backup', 'off');
  window.dispatchEvent(new window.StorageEvent('storage', {key: 'bt-setting-auto-backup'}));
  click(button(document, 'New folder'));
  await sleep(30);
  type(document.querySelector('.bt-modal-container input'), 'Not backed up');
  click(document.querySelector('.bt-icon-options .bt-icon-option'));
  await sleep(30);
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(5500);
  assert.equal(saved.length, 1);
  window.dispatchEvent(new window.Event('focus'));
  window.close();
});

test('price summary: lowest, median and highest of the loaded results, in Chaos / Divines', async () => {
  const ninja = {lines: [{id: 'chaos', primaryValue: 1}, {id: 'divine', primaryValue: 150}], items: [{id: 'chaos', name: 'Chaos Orb'}, {id: 'divine', name: 'Divine Orb'}]};
  const {window, document} = await load({settings: ['tier-search', 'advanced-filtering', 'price-summary'], onMessage: (message) => (message.query === 'poe-ninja' ? ninja : null)});
  const resultset = document.querySelector('.resultset');
  const template = resultset.querySelector('div.row[data-id]');
  resultset.querySelectorAll('div.row[data-id]').forEach((row) => row.remove());

  const addListing = (id, value, currency) => {
    const row = template.cloneNode(true);
    row.setAttribute('data-id', id);
    row.querySelector('.profile-link a').textContent = `Seller${id}`;
    row.querySelectorAll('.profile-link a').forEach((a) => (a.href = `/account/view-profile/Seller${id}`));
    row.querySelector('[data-field="price"] > br + span').textContent = value;
    row.querySelector('[data-field="price"] .currency-text span').textContent = currency;
    resultset.append(row);
  };
  addListing('a', '5', 'Chaos Orb');
  addListing('b', '40', 'Chaos Orb');
  addListing('c', '2', 'Divine Orb'); // 300 Chaos
  await sleep(300);

  const summary = () => document.querySelector('.bt-price-summary')?.textContent;
  assert.equal(summary(), '3 listings: lowest 5 c · median 40 c · highest 2 div');
  assert.equal(document.querySelector('.bt-price-summary').nextElementSibling, resultset, 'right above the results');

  // Listings the result filter hides are left out.
  resultset.querySelector('div.row[data-id="c"] .item-mod--explicit [data-field^="stat."] > span:last-child').textContent = 'Only on listing c';
  type(document.querySelector('.bt-mod-filter input'), '"!only on listing c"');
  await sleep(200);
  assert.ok(resultset.querySelector('div.row[data-id="c"]').classList.contains('bt-mod-filter-hidden'));
  assert.equal(summary(), '2 listings: lowest 5 c · median 22.5 c · highest 40 c');

  // Turned off in Settings.
  click(tab(document, 'Settings'));
  await sleep(50);
  click([...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((b) => b.textContent.trim().startsWith('Price summary')));
  await sleep(100);
  assert.equal(document.querySelector('.bt-price-summary'), null);
});

test('Add build: a Foulborn unique is searched under its unique name, with its changed mod', async () => {
  const xml = `<PathOfBuilding>
<Build className="Marauder" ascendClassName="Juggernaut" level="90"/>
<Items activeItemSet="1">
<Item id="1">Rarity: UNIQUE
Foulborn Kaom's Heart
Glorious Plate
Implicits: 0
+(500-600) to maximum Life
{mutated}+42% to Fire Resistance</Item>
<ItemSet id="1" title="Main"><Slot name="Body Armour" itemId="1"/></ItemSet>
</Items>
</PathOfBuilding>`;
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
  const folder = store['bookmark-folders'].value[0];
  const [trade] = store[`bookmark-trades--${folder.id}`].value;

  assert.equal(trade.title, "Body Armour: Foulborn Kaom's Heart");
  const query = decodeSlug(trade.location.slug);
  assert.equal(query.name, "Kaom's Heart", 'the trade site knows it as the plain unique name');
  assert.equal(query.type, 'Glorious Plate');
  // Its own mods, the changed one included (that's what sets the Foulborn version apart).
  assert.deepEqual(query.stats[0].filters.map((f) => f.id), ['explicit.stat_life', 'explicit.stat_fire']);
});

test('Add build: a rare named "New Item" (made in Path of Building) is titled by its base type', async () => {
  const xml = `<PathOfBuilding>
<Build className="Witch" ascendClassName="Necromancer" level="90"/>
<Items activeItemSet="1">
<Item id="1">Rarity: RARE
New Item
Hubris Circlet
Implicits: 0
+90 to maximum Life</Item>
<Item id="2">Rarity: RARE
Doom Crown
Hubris Circlet
Implicits: 0
+90 to maximum Life</Item>
<ItemSet id="1" title="Main"><Slot name="Helmet" itemId="1"/><Slot name="Helmet Swap" itemId="2"/></ItemSet>
</Items>
</PathOfBuilding>`;
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
  const folder = store['bookmark-folders'].value[0];
  const trades = store[`bookmark-trades--${folder.id}`].value;
  assert.equal(trades[0].title, 'Helmet: Hubris Circlet');
  assert.equal(decodeSlug(trades[0].location.slug).type, 'Hubris Circlet');
});

test('Add build: "Socketed Gems are Supported by" mods match with or without " Support" at the end', async () => {
  const xml = `<PathOfBuilding>
<Build className="Ranger" ascendClassName="Deadeye" level="90"/>
<Items activeItemSet="1">
<Item id="1">Rarity: RARE
New Item
Hubris Circlet
Implicits: 0
Socketed Gems are Supported by Level 20 Multistrike
Socketed Gems are Supported by Level 18 Pierce
Socketed Gems are Supported by Level 16 Fork</Item>
<ItemSet id="1" title="Main"><Slot name="Helmet" itemId="1"/></ItemSet>
</Items>
</PathOfBuilding>`;
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
  const folder = store['bookmark-folders'].value[0];
  const [trade] = store[`bookmark-trades--${folder.id}`].value;
  const stats = decodeSlug(trade.location.slug).stats;
  assert.deepEqual(stats[0].filters.map((f) => f.id), [
    'explicit.indexable_support_multistrike', // only listed as "... Multistrike Support"
    'explicit.indexable_support_pierce', // only listed as "... Pierce"
  ]);
  // Listed both ways: a Count group, so a listing with either one matches.
  assert.deepEqual(stats[1], {
    type: 'count',
    value: {min: 1},
    filters: [{id: 'explicit.indexable_support_fork_a', value: {min: 12}}, {id: 'explicit.indexable_support_fork_b', value: {min: 12}}], // 80% of 16
  });
});

test('Add build: the ascendancy is read from the loadout tree when the build leaves it out', async () => {
  const xml = `<PathOfBuilding>
<Build className="Marauder" ascendClassName="None" level="90"/>
<Tree activeSpec="1">
<Spec title="Lvl 90" treeVersion="3_29" classId="1" ascendClassId="1"><Sockets/></Spec>
</Tree>
<Items activeItemSet="1">
<Item id="1">Rarity: RARE
New Item
Hubris Circlet
Implicits: 0
+90 to maximum Life</Item>
<ItemSet id="1" title="Lvl 90"><Slot name="Helmet" itemId="1"/></ItemSet>
</Items>
</PathOfBuilding>`;
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
  const folder = store['bookmark-folders'].value[0];
  assert.equal(folder.title, 'Juggernaut'); // one loadout: no loadout name added
  assert.equal(folder.icon, 'juggernaut');
});

test('Re-import build: a build folder can be made again from its source, keeping your title and ticks', async () => {
  const {document, window, store} = await load({onFetch: tradeData, nodeStreams: true});
  await addBuild(document, window, POB_CODE, 'Leveling');

  const folder = store['bookmark-folders'].value[0];
  assert.equal(folder.title, 'Deadeye – Leveling');
  assert.deepEqual(store[`bookmark-build--${folder.id}`].value, {input: POB_CODE, setTitle: 'Leveling', minPercent: 80, title: 'Deadeye – Leveling'});
  // Rename it and tick its search as done.
  const trades = store[`bookmark-trades--${folder.id}`].value;
  store['bookmark-folders'].value = [{...folder, title: 'My leveling gear'}];
  store[`bookmark-trades--${folder.id}`].value = trades.map((t) => ({...t, completedAt: 'Mon, 16 Nov 2026 00:00:00 GMT'}));
  // Leave the tab and come back so the panel reads the changed storage.
  click(tab(document, 'History'));
  await sleep(50);
  click(tab(document, 'Bookmarks'));
  await sleep(150);

  document.querySelector('.bt-folder-header .bt-contextual-menu').dispatchEvent(new window.MouseEvent('click', {bubbles: true, clientX: 300, clientY: 100}));
  await sleep(50);
  const items = [...document.querySelectorAll('.bt-contextual-menu-item')];
  assert.deepEqual(items.map((item) => item.textContent.trim()), ['Edit', 'Re-import build', 'Archive', 'Export/Share', 'Delete']);
  assert.ok(items.some((item) => item.textContent.trim() === 'Re-import build'));
  click(items.find((item) => item.textContent.trim() === 'Re-import build'));
  await sleep(500);
  const modal = document.querySelector('.bt-modal-container');
  assert.match(modal.textContent, /Re-import build/);
  // The same code, loadout and percentage as before.
  assert.equal(modal.querySelector('input').value, POB_CODE);
  assert.equal(modal.querySelector('.bt-build-import-set').selectedOptions[0].textContent, 'Leveling');
  // Pick the other loadout this time.
  const select = modal.querySelector('.bt-build-import-set');
  select.value = [...select.options].find((option) => option.textContent === 'Endgame').value;
  select.dispatchEvent(new window.Event('change', {bubbles: true}));
  await sleep(30);
  modal.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(300);

  const folders = store['bookmark-folders'].value;
  assert.equal(folders.length, 1); // updated in place, not a second folder
  assert.equal(folders[0].title, 'My leveling gear'); // your own title kept
  const updated = store[`bookmark-trades--${folder.id}`].value;
  assert.equal(updated.length, 6);
  // Only searches with the same name as before keep their tick: the tree jewel is in both loadouts.
  assert.deepEqual(updated.filter((t) => t.completedAt).map((t) => t.title), ['Jewel: Dusk Delirium (Viridian Jewel)']);
  assert.equal(store[`bookmark-build--${folder.id}`].value.setTitle, 'Endgame');
});

test('Live search: new items above the shown ones play the sound once per batch, and notify in the background', async () => {
  const messages = [];
  const {document, window} = await load({path: '/trade/search/Standard/abc123/live', settings: ['live-alert-notification'], onMessage: (m) => (messages.push(m), true)});
  // A stand-in for the browser's audio: counts the sounds started.
  let played = 0;
  class FakeAudio {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return {gain: {value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}}; }
    createOscillator() { return {type: '', frequency: {}, connect() {}, start: () => played++, stop() {}}; }
    async resume() {}
  }
  window.AudioContext = FakeAudio;
  await sleep(200);

  const resultset = document.querySelector('.resultset');
  const first = resultset.querySelector('div.row[data-id]');
  const addRow = (id, where) => {
    const row = first.cloneNode(true);
    row.removeAttribute('bt-enhanced');
    row.setAttribute('data-id', id);
    if (where === 'top') resultset.prepend(row);
    else resultset.querySelector('.row.controls').before(row);
  };

  // "Load more" adds below the shown items: no alert.
  addRow('more1', 'bottom');
  await sleep(600);
  assert.equal(played, 0);

  // Two new items arrive at the top together: one sound (the chime's two notes), one notification.
  document.hasFocus = () => false;
  addRow('new1', 'top');
  addRow('new2', 'top');
  await sleep(700);
  assert.equal(played, 2);
  const notes = messages.filter((m) => m.query === 'notify');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Live search: 2 new items');

  // Turned off: nothing.
  click(tab(document, 'Settings'));
  await sleep(50);
  const box = (label) => [...document.querySelectorAll('.bt-settings .bt-form-checkbox')].find((b) => b.textContent.trim().startsWith(label));
  // The sound options show under the sound setting.
  assert.ok(document.querySelector('.bt-live-alert-sound'));
  assert.match(document.querySelector('.bt-live-alert-hint').textContent, /bookmark's Edit window/);
  click(box('Play a sound'));
  click(box('Desktop notification'));
  await sleep(50);
  addRow('new3', 'top');
  await sleep(700);
  assert.equal(played, 2);
  assert.equal(messages.filter((m) => m.query === 'notify').length, 1);
});

test('Live search: a bookmarked search plays the sound picked on its bookmark', async () => {
  const messages = [];
  const trade = (id, title, slug, sound) => ({id, title, completedAt: null, location: {version: '1', type: 'search', slug}, ...(sound ? {sound} : {})});
  const {document, window, store} = await load({
    path: '/trade/search/Standard/abc123/live',
    settings: ['live-alert-notification'],
    onMessage: (m) => (messages.push(m), true),
    stored: {
      'bookmark-folders': {value: [{id: 'f1', title: 'Gear', version: '1', icon: null, archivedAt: null}], expiresAt: null},
      'bookmark-trades--f1': {value: [trade('t1', 'Cheap Mageblood', 'abc123', 'ding'), trade('t2', 'Other', 'zzz999')], expiresAt: null},
    },
  });
  const notes = [];
  class FakeAudio {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return {gain: {value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}}; }
    createOscillator() { const o = {type: '', frequency: {}, connect() {}, start: () => notes.push(o.type), stop() {}}; return o; }
    async resume() {}
  }
  window.AudioContext = FakeAudio;
  await sleep(200);

  // The page says which sound this live search uses.
  assert.match(document.querySelector('.bt-live-alert-badge').textContent, /Live alert: Ding \(bookmark .Cheap Mageblood.\)/);

  const resultset = document.querySelector('.resultset');
  const row = resultset.querySelector('div.row[data-id]').cloneNode(true);
  row.removeAttribute('bt-enhanced');
  row.setAttribute('data-id', 'new1');
  document.hasFocus = () => false;
  resultset.prepend(row);
  await sleep(700);
  assert.deepEqual(notes, ['triangle'], 'the Ding, not the default Chime');
  assert.equal(messages.filter((m) => m.query === 'notify')[0].title, 'Cheap Mageblood: new item');

  // The bookmark's Edit window offers the sounds, with Default and No sound; pick Beep.
  if (!document.querySelector('.bt-folder-trade')) click(document.querySelector('.bt-folder-header-label'));
  await sleep(50);
  document.querySelector('.bt-folder-trade-actions .bt-contextual-menu').dispatchEvent(new window.MouseEvent('click', {bubbles: true, clientX: 300, clientY: 100}));
  await sleep(50);
  click([...document.querySelectorAll('.bt-contextual-menu-item')].find((item) => item.textContent.trim() === 'Edit'));
  await sleep(50);
  const select = document.querySelector('.bt-trade-sound');
  assert.deepEqual([...select.options].map((o) => o.textContent), ['Default (from Settings)', 'Chime', 'Ding', 'Beep', 'No sound']);
  assert.equal(select.value, 'ding');
  select.value = 'beep';
  select.dispatchEvent(new window.Event('change', {bubbles: true}));
  await sleep(30);
  document.querySelector('.bt-modal-container form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
  await sleep(150);
  assert.equal(store['bookmark-trades--f1'].value[0].sound, 'beep');
  assert.match(document.querySelector('.bt-live-alert-badge').textContent, /Live alert: Beep/);
  assert.equal(store['bookmark-trades--f1'].value[1].sound, undefined, 'other bookmarks keep the default');
});

test('Price on bookmarks: opening a bookmarked search remembers its lowest price and listing count', async () => {
  const trade = (id, title, slug) => ({id, title, completedAt: null, location: {version: '1', type: 'search', slug}});
  const previousVisit = {lowest: '9 c', lowestChaos: 9, count: 40, isCountExact: true, at: new Date(Date.now() - 86400000).toISOString()};
  const {document, store} = await load({
    path: '/trade/search/Standard/abc123',
    onMessage: (m) => (m.query === 'poe-ninja' ? {lines: [{id: 'chaos', primaryValue: 1}, {id: 'divine', primaryValue: 200}], items: [{id: 'chaos', name: 'Chaos Orb'}, {id: 'divine', name: 'Divine Orb'}]} : null),
    stored: {
      'bookmark-folders': {value: [{id: 'f1', title: 'Gear', version: '1', icon: null, archivedAt: null}], expiresAt: null},
      'bookmark-trades--f1': {value: [trade('t1', 'Cheap Mageblood', 'abc123'), trade('t2', 'Not opened', 'zzz999')], expiresAt: null},
      'bookmark-stats': {value: {t1: {current: previousVisit, previous: null}}, expiresAt: null},
    },
  });
  // The site's line above the results.
  const header = document.createElement('div');
  header.className = 'row row-total';
  header.innerHTML = '<h3>Showing 2 results <small>(1,234 matched)</small></h3>';
  document.querySelector('.resultset').before(header);
  await sleep(2000);

  const saved = store['bookmark-stats'].value.t1;
  assert.equal(saved.current.lowest, '5 c'); // the result rows are priced 5 Chaos
  assert.equal(saved.current.count, 1234);
  assert.deepEqual(saved.previous, previousVisit, 'yesterday\'s visit is kept to compare with');
  assert.equal(store['bookmark-stats'].value.t2, undefined);

  // Shown under the bookmark, with ▼ since the lowest price went down.
  if (!document.querySelector('.bt-folder-trade')) click(document.querySelector('.bt-folder-header-label'));
  await sleep(100);
  const [first, second] = document.querySelectorAll('.bt-folder-trade');
  const line = first.querySelector('.bt-folder-trade-stats');
  assert.match(line.textContent, /^5 c\u25BC · 1234 listings · /);
  assert.ok(line.querySelector('.is-down'));
  assert.equal(second.querySelector('.bt-folder-trade-stats'), null);
});
