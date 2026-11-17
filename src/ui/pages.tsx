import {clearPinnedItems, getPinnedItems, unpinItem} from '../enhancers';
import {useState} from 'preact/hooks';
import {addCustomSound, getCustomSounds, getSoundChoice, getVolume, listSounds, playAlertSound, removeCustomSound, renameCustomSound, setSoundChoice, setVolume} from '../features/live-alert';
import {local} from '../lib/ext';
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

          <Button theme="gold" label="Clear pinned items" icon="times" onClick={() => clearPinnedItems()} />
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

// Settings sections you folded (remembered in this browser).
const FOLDED_KEY = 'settings-folded';
const readFolded = () => new Set((local.get(FOLDED_KEY) || '').split('|').filter(Boolean));

export function Settings() {
  useLoaded(['settings-change'], () => Date.now(), 0);
  const [color, setColor] = useState(getHighlightColor());
  const [folded, setFolded] = useState(readFolded);

  const toggle = (title: string) => {
    const next = new Set(folded);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    local.set(FOLDED_KEY, [...next].join('|') || null);
    setFolded(next);
  };

  return (
    <div class="bt-settings">
      {SETTINGS_SECTIONS.map((section) => (
        <section key={section.title} class={`bt-settings-section ${folded.has(section.title) ? 'is-folded' : ''}`}>
          <h2 class="bt-settings-section-title" onClick={() => toggle(section.title)}>
            <span class="bt-settings-section-arrow">{folded.has(section.title) ? '\u25B8' : '\u25BE'}</span>
            {section.title}
          </h2>
          {!folded.has(section.title) && section.keys.map((key) => (
            <div key={key} class="bt-settings-row">
              <Checkbox label={SETTINGS[key].label} value={isEnabled(key)} onChange={(value) => setEnabled(key, value)} />
              {key === 'tier-search' && isEnabled('tier-search') && (
                <div class="bt-settings-sub-option">
                  <Checkbox label={SETTINGS['advanced-filtering'].label} value={isEnabled('advanced-filtering')} onChange={(value) => setEnabled('advanced-filtering', value)} />
                </div>
              )}
              {key === 'live-alert-sound' && isEnabled('live-alert-sound') && <LiveAlertSoundOptions />}
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

// The default live search alert sound, the volume, and your own sounds.
// Each bookmark can use a different sound (Edit on the bookmark).
function LiveAlertSoundOptions() {
  const choice = useLoaded(['live-alert-change'], getSoundChoice, getSoundChoice());
  const volume = useLoaded(['live-alert-change'], getVolume, getVolume());
  const sounds = useLoaded(['live-alert-change'], listSounds, []);
  const customs = useLoaded(['live-alert-change'], getCustomSounds, []);

  const addFile = async (file: File) => {
    const problem = await addCustomSound(file);
    if (problem) flash.alert(problem);
    else flash.success(`"${file.name}" was added to your sounds.`);
  };

  return (
    <div class="bt-settings-sub-option bt-live-alert-options">
      <div class="bt-live-alert-line">
        Default
        <select class="bt-form-input bt-live-alert-sound" value={choice} onChange={(event) => setSoundChoice((event.target as HTMLSelectElement).value)}>
          {sounds.map((sound) => (
            <option key={sound.value} value={sound.value}>
              {sound.label}
            </option>
          ))}
        </select>
        <Button theme="blue" class="bt-live-alert-test" label="Test" icon="play" onClick={() => void playAlertSound()} />
      </div>
      <label class="bt-live-alert-line bt-live-alert-volume">
        Volume
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => {
            setVolume(Number((event.target as HTMLInputElement).value));
            void playAlertSound();
          }}
        />
        <span class="bt-live-alert-volume-value">{volume}%</span>
      </label>
      {customs.length > 0 && (
        <div class="bt-live-alert-customs">
          <div class="bt-live-alert-customs-title">Your sounds</div>
          {customs.map((sound) => (
            <div key={sound.id} class="bt-live-alert-line bt-live-alert-custom">
              <input
                type="text"
                class="bt-form-input bt-live-alert-custom-name"
                value={sound.name}
                title="Rename"
                onChange={(event) => void renameCustomSound(sound.id, (event.target as HTMLInputElement).value)}
              />
              <Button theme="blue" icon="play" onClick={() => void playAlertSound(`custom:${sound.id}`)} />
              <Button theme="red" icon="times" onClick={() => void removeCustomSound(sound.id)} />
            </div>
          ))}
        </div>
      )}
      <div class="bt-live-alert-line">
        <Button theme="blue" label="Add a sound\u2026" icon="file-import" accept="audio/*" onFile={(file) => void addFile(file)} />
      </div>
      <div class="bt-live-alert-hint">Pick a different sound for a search in its bookmark's Edit window.</div>
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
