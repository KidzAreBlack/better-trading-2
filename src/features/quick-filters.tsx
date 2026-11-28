// Quick filters: a bar of your own one-click filters above the site's Stat Filters. A click
// puts the filter into the search form, for example Corrupted ✗ sets Miscellaneous >
// Corrupted to No. Any filter from the site's filter lists can be added: a Yes / No filter
// gets a ✗ (No) and a ✓ (Yes) button, others the option or min and max you choose.
// A quick filter can instead be a set of stats under your own name ("Res / Life"): its +
// puts them in the Stat Filters, its − takes them out.
//
// The search form lives in the page's own code, so the change is made by page-world.ts.

import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {onPageChange} from '../lib/page-watch';
import {fetchQuickFilters, saveQuickFilters} from '../lib/quick-filter-store';
import type {QuickFilter} from '../lib/quick-filter-store';
import {isEnabled} from '../lib/settings';
import {apiBase, pageFetch} from '../lib/trade-api';
import {currentLocation, type TradeSiteVersion} from '../lib/trade-location';
import {on} from '../lib/util';
import {flash} from '../ui/common';
import {FaIcon} from '../ui/icons';

const BAR_ID = 'bt-quick-filters';

// ---- The site's filter lists ---------------------------------------------------------------

interface FilterDefinition {
  group: string;
  groupTitle: string;
  id: string;
  text: string;
  options: {id: string; text: string}[]; // without "Any"
  minMax: boolean;
}

const definitions = new Map<TradeSiteVersion, Promise<FilterDefinition[]>>();

const GROUP_TITLES: Record<string, string> = {
  status_filters: 'Status',
  type_filters: 'Type Filters',
  trade_filters: 'Trade Filters',
};

const loadDefinitions = (version: TradeSiteVersion): Promise<FilterDefinition[]> => {
  let loaded = definitions.get(version);
  if (!loaded) {
    loaded = pageFetch(`${apiBase(version)}/filters`)
      .then((response) => response.json())
      .then((payload) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload.result || []).flatMap((group: any) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (group.filters || []).map((filter: any) => ({
            group: group.id,
            groupTitle: group.title || GROUP_TITLES[group.id] || group.id,
            id: filter.id,
            text: filter.text || filter.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options: (filter.option?.options || [])
              .filter((option: any) => option.id !== null)
              .map((option: any) => ({
                id: String(option.id),
                text: option.text,
              })),
            minMax: Boolean(filter.minMax),
          }))
        )
      )
      .catch(() => {
        definitions.delete(version);
        return [];
      });
    definitions.set(version, loaded);
  }
  return loaded;
};

// The site's stats ("+# total maximum Life", under Pseudo, Explicit, Implicit...).
interface StatDefinition {
  id: string;
  text: string;
  kind: string; // Pseudo, Explicit...
  search: string; // lower case, for matching what you type
}

const statLists = new Map<TradeSiteVersion, Promise<StatDefinition[]>>();

const loadStats = (version: TradeSiteVersion): Promise<StatDefinition[]> => {
  let loaded = statLists.get(version);
  if (!loaded) {
    loaded = pageFetch(`${apiBase(version)}/stats`)
      .then((response) => response.json())
      .then((payload) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload.result || []).flatMap((group: any) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (group.entries || []).map((entry: any) => {
            const kind = String(group.label || group.id || '');
            return {id: String(entry.id), text: String(entry.text), kind, search: `${kind} ${entry.text}`.toLowerCase()};
          })
        )
      )
      .catch(() => {
        statLists.delete(version);
        return [];
      });
    statLists.set(version, loaded);
  }
  return loaded;
};

const MAX_MATCHES = 15;

// Every word typed must appear: "res total" finds "+#% total Elemental Resistance".
const findStats = (list: StatDefinition[], query: string): StatDefinition[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found: StatDefinition[] = [];
  for (const stat of list) {
    if (words.every((word) => stat.search.includes(word))) found.push(stat);
    if (found.length >= MAX_MATCHES) break;
  }
  return found;
};

const rangeText = (min?: number, max?: number) =>
  min !== undefined && max !== undefined ? `${min}–${max}` : min !== undefined ? `${min}+` : max !== undefined ? `≤${max}` : '';

// ---- Talking to the page ---------------------------------------------------------------------

let nextKey = 1;

const askPage = (request: Record<string, unknown>): Promise<boolean> =>
  new Promise((resolve) => {
    const key = `q${nextKey++}`;
    const finish = (done: boolean) => {
      window.removeEventListener('bt-quick-filter-result', listener);
      window.clearTimeout(timer);
      resolve(done);
    };
    const listener = (event: Event) => {
      try {
        const result = JSON.parse(String((event as CustomEvent).detail));
        if (result.key === key) finish(Boolean(result.done));
      } catch (_error) {
        // Not our answer.
      }
    };
    const timer = window.setTimeout(() => finish(false), 1000);
    window.addEventListener('bt-quick-filter-result', listener);
    window.dispatchEvent(
      new CustomEvent('bt-quick-filter', {
        detail: JSON.stringify({key, ...request}),
      })
    );
  });

const done = (ok: boolean) => {
  if (!ok) flash.alert('Could not reach the search form. Reload the page and try again.');
};

const apply = async (filter: QuickFilter, value: QuickFilter['value']) => done(await askPage({group: filter.group, filter: filter.filter, value}));

// Back to Any: the filter is taken out of the search form.
const clear = async (filter: QuickFilter) => done(await askPage({group: filter.group, filter: filter.filter, clear: true}));

const applyStats = async (filter: QuickFilter, mode: 'add' | 'remove') =>
  done(await askPage({mode, stats: (filter.stats || []).map(({id, min, max}) => ({id, min, max}))}));

// ---- The bar ---------------------------------------------------------------------------------

function QuickFilterBar(props: {version: TradeSiteVersion}) {
  const [filters, setFilters] = useState<QuickFilter[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<QuickFilter | null>(null);
  // The pencil and × on each quick filter only show in edit mode, to keep the bar tidy.
  const [isEditMode, setIsEditMode] = useState(false);

  const shown = filters.filter((filter) => filter.version === props.version);

  useEffect(() => {
    const load = () => void fetchQuickFilters().then(setFilters);
    load();
    return on('quick-filters-change', load);
  }, []);

  const remove = (filter: QuickFilter) => void saveQuickFilters(filters.filter((candidate) => candidate.id !== filter.id));

  // Edit mode: drag a preset onto another to move it there.
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const move = (id: string, targetId: string) => {
    const from = filters.findIndex((filter) => filter.id === id);
    const to = filters.findIndex((filter) => filter.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...filters];
    const [moving] = next.splice(from, 1);
    next.splice(to, 0, moving); // dragged forward it lands after the target, backward before it
    void saveQuickFilters(next);
  };
  // The bar shows where the dragged preset will land: before the target when moved back, after it when moved forward.
  const dropSide = (targetId: string): string => {
    const from = filters.findIndex((filter) => filter.id === dragged);
    const to = filters.findIndex((filter) => filter.id === targetId);
    if (from < 0 || to < 0 || from === to) return '';
    return from < to ? 'is-drop-after' : 'is-drop-before';
  };
  const endDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };

  return (
    <div class="bt-quick-filters-box">
      <div class="bt-quick-filters-header">
        <div class="bt-quick-filters-title">Quick filter presets</div>
        <button type="button" class="bt-quick-filter-add" title="Add a quick filter" disabled={isAdding || Boolean(editing)} onClick={() => setIsAdding(true)}>
          <FaIcon icon="plus-square" />
        </button>
        {shown.length > 0 && (
          <button
            type="button"
            class={`bt-quick-filters-mode ${isEditMode ? 'is-on' : ''}`}
            title={isEditMode ? 'Done editing' : 'Edit or remove quick filters'}
            onClick={() => {
              setIsEditMode(!isEditMode);
              setEditing(null);
            }}
          >
            {isEditMode ? 'Done' : <FaIcon icon="pen" />}
          </button>
        )}
      </div>
      <div class="bt-quick-filters-list">
        {shown.map((filter) => (
          <span
            key={filter.id}
            class={`bt-quick-filter ${isEditMode ? 'is-movable' : ''} ${dragged === filter.id ? 'is-dragged' : ''} ${dropTarget === filter.id ? dropSide(filter.id) : ''}`}
            draggable={isEditMode}
            title={isEditMode ? 'Drag to move' : undefined}
            onDragStart={(event) => {
              if (!isEditMode) return;
              event.dataTransfer?.setData('text/plain', filter.id); // Firefox only drags with data set
              setDragged(filter.id);
            }}
            onDragOver={(event) => {
              if (!dragged) return;
              event.preventDefault(); // allows dropping here
              if (dropTarget !== filter.id) setDropTarget(filter.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged) move(dragged, filter.id);
              endDrag();
            }}
            onDragEnd={endDrag}
          >
            <span
              class="bt-quick-filter-label"
              title={filter.stats ? filter.stats.map((stat) => `${stat.text} ${rangeText(stat.min, stat.max)}`.trim()).join('\n') : undefined}
            >
              {filter.label}
            </span>
            {!filter.stats && !filter.yesNo && (
              <span class="bt-quick-filter-value">
                <ValueMark filter={filter} />
              </span>
            )}
            {isEditMode ? (
              // Edit mode: the same two button spaces hold edit and remove, so nothing moves.
              <>
                <button
                  type="button"
                  class="bt-quick-filter-choice is-edit"
                  title="Edit this preset"
                  onClick={() => {
                    setIsAdding(false);
                    setEditing(filter);
                  }}
                >
                  <FaIcon icon="pen" />
                </button>
                <button type="button" class="bt-quick-filter-choice is-delete" title="Remove this preset" onClick={() => remove(filter)}>
                  <FaIcon icon="times" />
                </button>
              </>
            ) : filter.stats ? (
              // A red − that takes the stats out and a green + that puts them in.
              <>
                <button
                  type="button"
                  class="bt-quick-filter-choice is-no"
                  title={`Take out of Stat Filters: ${filter.label}`}
                  onClick={() => void applyStats(filter, 'remove')}
                >
                  −
                </button>
                <button
                  type="button"
                  class="bt-quick-filter-choice is-yes"
                  title={`Add to Stat Filters: ${filter.label}`}
                  onClick={() => void applyStats(filter, 'add')}
                >
                  +
                </button>
              </>
            ) : filter.yesNo ? (
              // A red ✗ that sets No and a green ✓ that sets Yes.
              <>
                <button type="button" class="bt-quick-filter-choice is-no" title={`${filter.label}: No`} onClick={() => void apply(filter, {option: 'false'})}>
                  ✗
                </button>
                <button type="button" class="bt-quick-filter-choice is-yes" title={`${filter.label}: Yes`} onClick={() => void apply(filter, {option: 'true'})}>
                  ✓
                </button>
              </>
            ) : (
              // A red − that clears the filter and a green + that sets it.
              <>
                <button type="button" class="bt-quick-filter-choice is-no" title={`Clear ${filter.label}`} onClick={() => void clear(filter)}>
                  −
                </button>
                <button
                  type="button"
                  class="bt-quick-filter-choice is-yes"
                  title={`Set ${filter.label}: ${filter.valueText}`}
                  onClick={() => void apply(filter, filter.value)}
                >
                  +
                </button>
              </>
            )}
          </span>
        ))}
      </div>
      {isAdding && (
        <QuickFilterForm
          version={props.version}
          onCancel={() => setIsAdding(false)}
          onAdd={(filter) => {
            void saveQuickFilters([...filters, filter]);
            setIsAdding(false);
          }}
        />
      )}
      {editing && (
        <QuickFilterForm
          key={editing.id}
          version={props.version}
          initial={editing}
          onCancel={() => setEditing(null)}
          onAdd={(filter) => {
            // Saved in the same place, so the order stays.
            void saveQuickFilters(filters.map((candidate) => (candidate.id === filter.id ? filter : candidate)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ✓ for Yes, ✗ for No, otherwise the value itself.
function ValueMark(props: {filter: QuickFilter}) {
  const {valueText} = props.filter;
  if (valueText === 'Yes') return <span class="bt-quick-filter-mark is-yes">✓</span>;
  if (valueText === 'No') return <span class="bt-quick-filter-mark is-no">✗</span>;
  return <span class="bt-quick-filter-mark">{valueText}</span>;
}

interface FormProps {
  version: TradeSiteVersion;
  initial?: QuickFilter;
  onAdd: (filter: QuickFilter) => void;
  onCancel: () => void;
}

// Adding a quick filter (a filter, or a set of stats), or editing one (`initial`): the same
// form, filled in.
function QuickFilterForm(props: FormProps) {
  const [kind, setKind] = useState<'filter' | 'stats'>(props.initial?.stats ? 'stats' : 'filter');
  return (
    <div class="bt-quick-filter-editor">
      {!props.initial && (
        <div class="bt-quick-filter-kinds">
          <button type="button" class={`bt-quick-filter-kind ${kind === 'filter' ? 'is-current' : ''}`} onClick={() => setKind('filter')}>
            Filter
          </button>
          <button type="button" class={`bt-quick-filter-kind ${kind === 'stats' ? 'is-current' : ''}`} onClick={() => setKind('stats')}>
            Stats
          </button>
        </div>
      )}
      {kind === 'stats' ? <StatsForm {...props} /> : <FilterForm {...props} />}
    </div>
  );
}

interface StatRow {
  id: string;
  text: string;
  kind: string;
  min: string;
  max: string;
}

const toNumber = (text: string) => (text.trim() === '' ? undefined : Number(text));

// A set of stats under one name, each with an optional min and max.
function StatsForm(props: FormProps) {
  const {initial} = props;
  const [list, setList] = useState<StatDefinition[] | null>(null);
  const [rows, setRows] = useState<StatRow[]>(
    (initial?.stats || []).map((stat) => ({
      id: stat.id,
      text: stat.text,
      kind: '',
      min: stat.min !== undefined ? String(stat.min) : '',
      max: stat.max !== undefined ? String(stat.max) : '',
    }))
  );
  const [query, setQuery] = useState('');
  // The list of matching stats only shows while the stat box has the cursor.
  const [isSearching, setIsSearching] = useState(false);
  const [label, setLabel] = useState(initial?.label || '');

  useEffect(() => {
    void loadStats(props.version).then(setList);
  }, [props.version]);

  const matches = list ? findStats(list, query).filter((stat) => !rows.some((row) => row.id === stat.id)) : [];

  const addRow = (stat: StatDefinition) => {
    setRows((current) => [...current, {id: stat.id, text: stat.text, kind: stat.kind, min: '', max: ''}]);
    if (!label.trim()) setLabel(stat.text.replace(/[#+%]/g, '').replace(/\s+/g, ' ').trim());
    setQuery('');
  };
  // From the latest rows, so quick typing in several boxes doesn't lose any of it.
  const update = (index: number, change: Partial<StatRow>) => setRows((current) => current.map((row, at) => (at === index ? {...row, ...change} : row)));

  const numbersOk = rows.every((row) => [toNumber(row.min), toNumber(row.max)].every((value) => value === undefined || Number.isFinite(value)));
  const canSave = Boolean(rows.length && label.trim() && numbersOk);

  const save = () => {
    if (!canSave) return;
    props.onAdd({
      id: initial?.id || Date.now().toString(36),
      version: props.version,
      label: label.trim(),
      group: '',
      filter: '',
      value: {},
      valueText: '',
      stats: rows.map((row) => {
        const min = toNumber(row.min);
        const max = toNumber(row.max);
        return {id: row.id, text: row.text, ...(min !== undefined ? {min} : {}), ...(max !== undefined ? {max} : {})};
      }),
    });
  };

  return (
    <form
      class="bt-quick-filter-form is-stats"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {rows.map((row, index) => (
        <div key={row.id} class="bt-quick-stat-row">
          <span class="bt-quick-stat-text">
            {row.kind && <span class="bt-quick-stat-kind">{row.kind}</span>}
            {row.text}
          </span>
          <input
            class="bt-quick-filter-input bt-quick-filter-number"
            placeholder="min"
            value={row.min}
            onInput={(event) => update(index, {min: (event.target as HTMLInputElement).value})}
          />
          <input
            class="bt-quick-filter-input bt-quick-filter-number"
            placeholder="max"
            value={row.max}
            onInput={(event) => update(index, {max: (event.target as HTMLInputElement).value})}
          />
          <button
            type="button"
            class="bt-quick-filter-remove"
            title="Remove this stat"
            onClick={() => setRows((current) => current.filter((_row, at) => at !== index))}
          >
            <FaIcon icon="times" />
          </button>
        </div>
      ))}
      <div class="bt-quick-stat-search">
        <input
          class="bt-quick-filter-input bt-quick-stat-query"
          placeholder={list ? (rows.length ? 'Add another stat…' : 'Type to find a stat, e.g. "total life"') : 'Loading the site’s stats…'}
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          onFocus={() => setIsSearching(true)}
          onBlur={() => setIsSearching(false)}
          onKeyDown={(event) => {
            // Enter picks the first match instead of saving.
            if (event.key === 'Enter' && matches.length) {
              event.preventDefault();
              addRow(matches[0]);
            }
          }}
        />
        {isSearching && matches.length > 0 && (
          <div class="bt-quick-stat-matches">
            {matches.map((stat) => (
              <button
                type="button"
                key={stat.id}
                class="bt-quick-stat-match"
                // Pressing on a match would take the cursor out of the stat box (closing the list) before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addRow(stat)}
              >
                <span class="bt-quick-stat-kind">{stat.kind}</span>
                {stat.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="bt-quick-stat-footer">
        <input
          class="bt-quick-filter-input bt-quick-filter-name"
          placeholder="Name"
          value={label}
          onInput={(event) => setLabel((event.target as HTMLInputElement).value)}
        />
        <button type="submit" class="bt-quick-filter-form-button is-add" disabled={!canSave}>
          {initial ? 'Save' : 'Add'}
        </button>
        <button type="button" class="bt-quick-filter-form-button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// One filter from the site's filter lists, with its value.
function FilterForm(props: FormProps) {
  const {initial} = props;
  const [list, setList] = useState<FilterDefinition[] | null>(null);
  const [key, setKey] = useState(initial ? `${initial.group}.${initial.filter}` : '');
  const [option, setOption] = useState(initial?.value.option || '');
  const [min, setMin] = useState(initial?.value.min !== undefined ? String(initial.value.min) : '');
  const [max, setMax] = useState(initial?.value.max !== undefined ? String(initial.value.max) : '');
  const [label, setLabel] = useState(initial?.label || '');

  useEffect(() => {
    void loadDefinitions(props.version).then(setList);
  }, [props.version]);

  const definition = list?.find((candidate) => `${candidate.group}.${candidate.id}` === key) || null;
  // Only Yes and No to choose from: the quick filter gets both buttons instead.
  const isYesNo = Boolean(
    definition &&
    !definition.minMax &&
    definition.options
      .map((candidate) => candidate.id)
      .sort()
      .join() === 'false,true'
  );
  const groups = list ? [...new Set(list.map((candidate) => candidate.groupTitle))] : [];

  const pick = (next: string) => {
    setKey(next);
    const picked = list?.find((candidate) => `${candidate.group}.${candidate.id}` === next);
    setOption(picked?.options[0]?.id || '');
    setMin('');
    setMax('');
    setLabel(picked?.text || '');
  };

  const minNumber = min.trim() === '' ? undefined : Number(min);
  const maxNumber = max.trim() === '' ? undefined : Number(max);
  const hasNumbers = minNumber !== undefined || maxNumber !== undefined;
  const numbersOk = [minNumber, maxNumber].every((value) => value === undefined || Number.isFinite(value));
  const canAdd = Boolean(definition && label.trim() && numbersOk && (isYesNo || option || hasNumbers));

  const add = () => {
    if (!definition || !canAdd) return;
    if (isYesNo) {
      props.onAdd({
        id: initial?.id || Date.now().toString(36),
        version: props.version,
        label: label.trim(),
        group: definition.group,
        filter: definition.id,
        value: {},
        valueText: 'Yes / No',
        yesNo: true,
      });
      return;
    }
    const optionText = definition.options.find((candidate) => candidate.id === option)?.text;
    const range = rangeText(minNumber, maxNumber);
    props.onAdd({
      id: initial?.id || Date.now().toString(36),
      version: props.version,
      label: label.trim(),
      group: definition.group,
      filter: definition.id,
      value: {
        ...(option ? {option} : {}),
        ...(minNumber !== undefined ? {min: minNumber} : {}),
        ...(maxNumber !== undefined ? {max: maxNumber} : {}),
      },
      valueText: [optionText, range].filter(Boolean).join(' ') || 'Any',
    });
  };

  return (
    <form
      class="bt-quick-filter-form"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <select class="bt-quick-filter-input bt-quick-filter-pick" value={key} onChange={(event) => pick((event.target as HTMLSelectElement).value)}>
        <option value="">{list ? 'Pick a filter…' : 'Loading the site’s filters…'}</option>
        {groups.map((group) => (
          <optgroup key={group} label={group}>
            {list
              ?.filter((candidate) => candidate.groupTitle === group && (candidate.options.length || candidate.minMax))
              .map((candidate) => (
                <option key={`${candidate.group}.${candidate.id}`} value={`${candidate.group}.${candidate.id}`}>
                  {candidate.text}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {definition && definition.options.length > 0 && !isYesNo && (
        <select class="bt-quick-filter-input" value={option} onChange={(event) => setOption((event.target as HTMLSelectElement).value)}>
          {definition.minMax && <option value="">(no option)</option>}
          {definition.options.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.text}
            </option>
          ))}
        </select>
      )}
      {definition?.minMax && (
        <>
          <input
            class="bt-quick-filter-input bt-quick-filter-number"
            placeholder="min"
            value={min}
            onInput={(event) => setMin((event.target as HTMLInputElement).value)}
          />
          <input
            class="bt-quick-filter-input bt-quick-filter-number"
            placeholder="max"
            value={max}
            onInput={(event) => setMax((event.target as HTMLInputElement).value)}
          />
        </>
      )}
      {definition && (
        <input
          class="bt-quick-filter-input bt-quick-filter-name"
          placeholder="Name"
          value={label}
          onInput={(event) => setLabel((event.target as HTMLInputElement).value)}
        />
      )}
      <button type="submit" class="bt-quick-filter-form-button is-add" disabled={!canAdd}>
        {initial ? 'Save' : 'Add'}
      </button>
      <button type="button" class="bt-quick-filter-form-button" onClick={props.onCancel}>
        Cancel
      </button>
    </form>
  );
}

// ---- Placing the bar ------------------------------------------------------------------------------

let mountedVersion: TradeSiteVersion | null = null;

const place = () => {
  const pane = document.querySelector('.search-advanced-pane.brown');
  const existing = document.getElementById(BAR_ID);
  const {version} = currentLocation();

  if (!isEnabled('quick-filters') || !pane) {
    if (existing) {
      render(null, existing);
      existing.remove();
      mountedVersion = null;
    }
    return;
  }

  if (existing && existing.parentElement === pane && mountedVersion === version) {
    if (pane.firstElementChild !== existing) pane.prepend(existing);
    return;
  }

  const bar = existing || document.createElement('div');
  bar.id = BAR_ID;
  if (bar.parentElement !== pane || pane.firstElementChild !== bar) pane.prepend(bar);
  mountedVersion = version;
  render(<QuickFilterBar version={version} />, bar);
};

export default function setupQuickFilters() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      place();
    });
  };
  onPageChange(schedule);
  on('settings-change', schedule);
  on('location-change', schedule);
  schedule();
}
