// Bulk: sellers with more than one listing in the current search results, most first.
// Each seller is a card (click its heading to fold it) listing their prices, with
// Find (scroll to the listing) and Buy (the listing's own "Travel to Hideout" /
// "Direct Whisper" button on the trade site).

import {useEffect, useState} from 'preact/hooks';
import {sleep} from '../lib/util';
import {AlertMessage, flash} from './common';

interface Listing {
  id: string;
  price: string; // "10"
  currencyImage: string | null;
  currencyName: string;
}

interface Seller {
  account: string;
  listings: Listing[];
}

const RESULT_ROWS = '.resultset > div.row[data-id]';
const BUY_BUTTON = '.details .btns .direct-btn';
const FOUND_CLASS = 'bt-bulk-found';

const rowById = (id: string) =>
  [...document.querySelectorAll<HTMLElement>(RESULT_ROWS)].find((row) => row.getAttribute('data-id') === id) || null;

const readSellers = (): {listings: number; sellers: Seller[]} => {
  const byAccount = new Map<string, Seller>();
  let listings = 0;

  document.querySelectorAll<HTMLElement>(RESULT_ROWS).forEach((row) => {
    const account = row.querySelector('.profile-link a')?.textContent?.trim() || '';
    const id = row.getAttribute('data-id') || '';
    if (!account || !id) return;

    listings++;
    const image = row.querySelector<HTMLImageElement>('[data-field="price"] .currency-image img');
    const seller = byAccount.get(account) || {account, listings: []};
    seller.listings.push({
      id,
      price: row.querySelector('[data-field="price"] > br + span')?.textContent?.trim() || '?',
      currencyImage: image?.src || null,
      currencyName: row.querySelector('[data-field="price"] .currency-text span')?.textContent?.trim() || image?.alt || '',
    });
    byAccount.set(account, seller);
  });

  const sellers = [...byAccount.values()].sort((a, b) => b.listings.length - a.listings.length || a.account.localeCompare(b.account));
  return {listings, sellers};
};

const signature = (state: {sellers: Seller[]}) =>
  state.sellers.map((seller) => `${seller.account}:${seller.listings.map((listing) => `${listing.id}=${listing.price}`).join(',')}`).join('|');

// Re-reads when results are added or removed (a new search, scrolling, loading more), and
// when a listing's buy button changes (it expires after a while).
const useSellers = () => {
  const [state, setState] = useState(readSellers);
  const [, setTick] = useState(0);

  useEffect(() => {
    let last = signature(state);
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = readSellers();
        const nextSignature = signature(next);
        if (nextSignature !== last) {
          last = nextSignature;
          setState(next);
        } else {
          setTick((tick) => tick + 1); // buy buttons may have changed
        }
      }, 150);
    };

    const observer = new MutationObserver(update);
    observer.observe(document.querySelector('#trade') || document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return state;
};

// A listing can be hidden on the page: tucked into a group of identical listings
// ("Group identical listings"), or by the result filter. Open its group so it can be shown.
const reveal = (row: HTMLElement): boolean => {
  if (row.getAttribute('bt-regroup-state') === 'hidden') {
    const hash = row.getAttribute('bt-regroup-hash');
    let first: Element = row;
    while (first.previousElementSibling && first.previousElementSibling.getAttribute('bt-regroup-hash') === hash) {
      first = first.previousElementSibling;
    }
    first.querySelector<HTMLButtonElement>('.bt-group-button')?.click();
  }
  if (row.classList.contains('bt-mod-filter-hidden')) {
    flash.alert('That listing is hidden by the result filter. Clear the filter to see it.');
    return false;
  }
  return row.getAttribute('bt-regroup-state') !== 'hidden';
};

const find = async (id: string) => {
  const row = rowById(id);
  if (!row) {
    flash.alert('That listing is no longer on the page.');
    return;
  }
  if (!reveal(row)) return;
  row.scrollIntoView?.({block: 'center', behavior: 'smooth'});
  row.classList.add(FOUND_CLASS);
  await sleep(1500);
  row.classList.remove(FOUND_CLASS);
};

const buyButton = (id: string) => rowById(id)?.querySelector<HTMLButtonElement>(BUY_BUTTON) || null;

export function Bulk() {
  const {listings, sellers} = useSellers();
  const [folded, setFolded] = useState<Set<string>>(new Set());

  useEffect(() => () => document.querySelectorAll(`.${FOUND_CLASS}`).forEach((row) => row.classList.remove(FOUND_CLASS)), []);

  if (!sellers.length) {
    return <AlertMessage type="warning" message="Run a search to see how many listings each seller has in it." />;
  }

  // Sellers with a single listing are left out.
  const repeatSellers = sellers.filter((seller) => seller.listings.length > 1);
  const toggle = (account: string) => {
    const next = new Set(folded);
    if (next.has(account)) next.delete(account);
    else next.add(account);
    setFolded(next);
  };

  return (
    <div class="bt-bulk">
      <div class="bt-bulk-summary">
        {listings} listings from {sellers.length} sellers, {repeatSellers.length} with more than one
      </div>

      {repeatSellers.length === 0 && <AlertMessage type="warning" message="No seller has more than one listing in the loaded results." />}

      {repeatSellers.map((seller) => {
        const isFolded = folded.has(seller.account);
        return (
          <div key={seller.account} class={`bt-bulk-seller ${isFolded ? 'is-folded' : ''}`}>
            <div class="bt-bulk-seller-header" onClick={() => toggle(seller.account)}>
              <span class="bt-bulk-seller-arrow">{isFolded ? '▸' : '▾'}</span>
              <span class="bt-bulk-seller-name">{seller.account}</span>
              <span class="bt-bulk-seller-count">{seller.listings.length}</span>
            </div>

            {!isFolded &&
              seller.listings.map((listing) => {
                const buy = buyButton(listing.id);
                const canBuy = Boolean(buy && !buy.disabled);
                return (
                  <div key={listing.id} class="bt-bulk-listing">
                    <span class="bt-bulk-listing-price">
                      <span class="bt-bulk-listing-label">Price:</span> <span class="bt-bulk-listing-value">{listing.price}</span>
                      {listing.currencyImage ? (
                        <img class="bt-bulk-listing-currency" src={listing.currencyImage} alt={listing.currencyName} title={listing.currencyName} />
                      ) : (
                        <span> {listing.currencyName}</span>
                      )}
                    </span>
                    <button type="button" class="bt-bulk-button is-find" onClick={() => void find(listing.id)}>
                      Find
                    </button>
                    <button
                      type="button"
                      class="bt-bulk-button is-buy"
                      disabled={!canBuy}
                      title={canBuy ? buy!.textContent?.trim() : 'The listing must be refreshed on the trade site first'}
                      onClick={() => buyButton(listing.id)?.click()}
                    >
                      Buy
                    </button>
                  </div>
                );
              })}
          </div>
        );
      })}

      <AlertMessage type="warning" message="Counts the results loaded on the page. Scroll down or load more results to count more of the search." />
    </div>
  );
}
