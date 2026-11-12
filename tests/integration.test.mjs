// Loads the built extension into a mock of the trade page and checks the main features.
// Run with: npm run build && npm test
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

const load = async ({path = '/trade/search/Standard/abc123', settings = [], rarityValue = ''} = {}) => {
  const store = {};
  const dom = new JSDOM(PAGE, {url: `https://www.pathofexile.com${path}`, runScripts: 'outside-only', pretendToBeVisual: true});
  const {window} = dom;
  window.chrome = {
    runtime: {getURL: (p) => `chrome-extension://test/${p}`, sendMessage: async () => null},
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
  window.fetch = async (url) => {
    const path = String(url).replace('chrome-extension://test/', '');
    const body = readFileSync(new URL(`../dist/chrome/${path}`, import.meta.url), 'utf8');

    return {json: async () => JSON.parse(body)};
  };
  window.TextEncoder = TextEncoder; // jsdom lacks these; browsers have them
  window.TextDecoder = TextDecoder;
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
  assert.deepEqual([...document.querySelectorAll('.bt-root-page-menu-item')].map((t) => t.textContent.trim()), ['Bookmarks', 'Pinned items', 'History', 'Settings']);
  assert.equal(document.querySelector('.bt-root-page-menu-item.is-active').textContent.trim(), 'Bookmarks');
  assert.match(document.title, /Staff - Trade - Path of Exile/);
});

test('settings are off by default and turn features on', async () => {
  const {document} = await load();
  const search = document.querySelector('.search-left input');

  type(search, 'bel');
  assert.equal(search.value, 'bel');
  assert.equal(document.querySelector('.bt-tier-button'), null);
  assert.equal(document.querySelector('.bt-mod-filter'), null);

  click(tab(document, 'Settings'));
  await sleep(50);
  const box = (label) => [...document.querySelectorAll('.bt-form-checkbox')].find((b) => b.textContent.trim() === label);
  const isChecked = (label) => box(label).querySelector('.bt-form-checkbox-indicator').classList.contains('is-active');
  assert.deepEqual([...document.querySelectorAll('.bt-settings .bt-form-checkbox')].map((b) => b.textContent.trim()), ['Fuzzy search', 'Tier search', 'Highlight searched mods', 'Item rarity starts on Any Non-Unique', 'Open the hidden panel by hovering its icon']);
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

  type(search, 'bel');
  assert.equal(search.value, '~bel');
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

  for (const label of ['Pinned items', 'History', 'Settings']) {
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
  const {document} = await load();
  const rows = [...document.querySelectorAll('.resultset > .row[data-id]')];

  assert.ok(rows.every((r) => r.hasAttribute('bt-enhanced')));
  assert.ok(rows.every((r) => r.querySelector('.bt-pin-button')));
  assert.equal(rows[1].getAttribute('bt-regroup-state'), 'hidden');
  assert.equal(rows[0].querySelector('.bt-group-button').textContent, '1 similar result');
  assert.ok(rows[0].querySelector('.item-mod.bt-highlight-stat-filters'), 'searched stat is highlighted');

  click(rows[0].querySelector('.bt-pin-button'));
  await sleep(50);
  assert.ok(rows[0].classList.contains('bt-pinned'));
  click(tab(document, 'Pinned items'));
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
