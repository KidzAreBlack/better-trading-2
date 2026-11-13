import {clearPinnedItems, getPinnedItems, unpinItem} from '../enhancers';
import {useState} from 'preact/hooks';
import {getHighlightColor, setHighlightColor} from '../lib/highlight-color';
import {clearHistory, fetchHistory} from '../lib/history';
import {isEnabled, setEnabled, SETTINGS, SETTINGS_SECTIONS} from '../lib/settings';
import {tradeUrl} from '../lib/trade-location';
import {sleep, timeAgo} from '../lib/util';
import {AlertMessage, Button, Checkbox, flash, Mount, useLoaded, useTradeModeSlugs} from './common';

declare const __VERSION__: string;

// Better Trading 2's own repository (issues go here, not to the original project).
const GITHUB_URL = 'https://github.com/KidzAreBlack/better-trading-2';

export function History() {
  const entries = useLoaded(['history-change', 'location-change'], fetchHistory, null);
  // History links open in the trade mode you are using now.
  const slugFor = useTradeModeSlugs((entries || []).map((entry) => ({key: entry.id, slug: entry.slug, version: entry.version})));

  if (!entries) return null;
  if (!entries.length) return <AlertMessage type="warning" message="The search history is currently empty." />;

  return (
    <div>
      {entries.map((entry) => (
        <a key={entry.id} href={tradeUrl(entry.version, entry.type, slugFor(entry.id, entry.slug), entry.league)} class="bt-history-entry-link">
          <div class="bt-history-entry-title">{entry.title || (entry.type === 'exchange' ? 'Bulk item exchange' : 'Any item')}</div>
          <div class="bt-history-entry-details">
            <div class="bt-history-entry-slug">{entry.league.replace(/^poe2\//, '')}</div>
            <div>{timeAgo(entry.createdAt)}</div>
          </div>
        </a>
      ))}

      <Button
        theme="gold"
        label="Clear history"
        icon="times"
        class="bt-history-clear-button"
        onClick={() => {
          void clearHistory();
          flash.success('The search history has been cleared.');
        }}
      />
    </div>
  );
}

const scrollToItem = async (id: string) => {
  const row = document.querySelector<HTMLElement>(`.resultset > div.row[data-id="${id}"]`);
  if (!row) return;

  row.scrollIntoView({block: 'center', behavior: 'smooth'});
  row.classList.add('bt-pinned-glow');
  await sleep(1000);
  row.classList.remove('bt-pinned-glow');
};

export function PinnedItems() {
  const items = useLoaded(['pinned-change'], getPinnedItems, getPinnedItems());

  return (
    <div class="bt-pinned-items">
      {items.length > 0 ? (
        <>
          {items.map((item) => (
            <div key={item.id} class="bt-pinned-item-wrapper">
              <Mount element={item.detailsElement} />
              <Mount class="bt-pinned-rendered-item-wrapper" element={item.renderedItemElement} />
              <Mount element={item.pricingElement} />

              <div class="bt-pinned-item-actions">
                <Button theme="blue" label="Scroll to the item result" class="bt-pinned-item-scroll" onClick={() => void scrollToItem(item.id)} />
                <Button theme="blue" label="Unpin" onClick={() => unpinItem(item.id)} />
              </div>
            </div>
          ))}

          <Button theme="gold" label="Clear pinned itmes" icon="times" onClick={() => clearPinnedItems()} />
        </>
      ) : (
        <AlertMessage type="warning" message={'Items can be pinned here by clicking the "pin" button near the "whisper" button.'} />
      )}

      <AlertMessage
        type="warning"
        message="Items will remain pinned as long as they are within the current results. Changing the search or refreshing the results will reset the pins."
      />
    </div>
  );
}

export function Settings() {
  useLoaded(['settings-change'], () => Date.now(), 0);
  const [color, setColor] = useState(getHighlightColor());

  return (
    <div class="bt-settings">
      {SETTINGS_SECTIONS.map((section) => (
        <section key={section.title} class="bt-settings-section">
          <h2 class="bt-settings-section-title">{section.title}</h2>
          {section.keys.map((key) => (
            <div key={key} class="bt-settings-row">
              <Checkbox label={SETTINGS[key].label} value={isEnabled(key)} onChange={(value) => setEnabled(key, value)} />
              {key === 'tier-search' && isEnabled('tier-search') && (
                <div class="bt-settings-sub-option">
                  <Checkbox label={SETTINGS['advanced-filtering'].label} value={isEnabled('advanced-filtering')} onChange={(value) => setEnabled('advanced-filtering', value)} />
                </div>
              )}
              {key === 'highlight-stat-filters' && (
                <input
                  type="color"
                  class="bt-settings-color"
                  title="Highlight colour"
                  value={color}
                  onInput={(event) => {
                    const value = (event.target as HTMLInputElement).value;
                    setColor(value);
                    setHighlightColor(value);
                  }}
                />
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function About() {
  return (
    <>
      <div class="bt-about-sections">
        <section class="bt-about-section">
          <h1 class="bt-about-section-title">On GitHub</h1>
          <p class="bt-about-section-description">To contribute, report issues or simply browse the code.</p>
          <Button href={GITHUB_URL} theme="blue" icon="github" label="View on GitHub" />
        </section>

        <section class="bt-about-section">
          <h1 class="bt-about-section-title">Credits</h1>
          <p class="bt-about-section-description">
            Better Trading was originally created by <strong>InfaMc</strong> (<a href="https://github.com/pboutin">@pboutin</a>) and is currently maintained
            by <strong>brosmike</strong> (<a href="https://github.com/dbjorge">@dbjorge</a>). Better Trading 2 is an unofficial community rewrite of{' '}
            <a href="https://github.com/exile-center/better-trading">Better Trading</a>, not made or endorsed by its authors; tier data comes from RePoE.
          </p>
        </section>
      </div>

      <p class="bt-about-disclaimer">This extension is fan-made and not affiliated with Grinding Gear Games or Exile Center in any way.</p>
      <p class="bt-about-version">{__VERSION__}</p>
    </>
  );
}
