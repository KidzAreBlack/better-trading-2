import {useEffect, useRef, useState} from 'preact/hooks';
import * as bookmarks from '../lib/bookmarks';
import type {BookmarkFolder, BookmarkTrade} from '../lib/bookmarks';
import {assetUrl} from '../lib/ext';
import {createBuildFolder, listItemSets, loadBuild} from '../lib/pob-import';
import type {ItemSetChoice} from '../lib/pob-import';
import {withoutTradeMode} from '../lib/search-link';
import {isAdvancedFilteringOn} from '../lib/settings';
import {recommendTitle} from '../lib/search-panel';
import {currentLocation, tradeUrl} from '../lib/trade-location';
import type {TradeSiteVersion} from '../lib/trade-location';
import {copyToClipboard} from '../lib/util';
import {AlertMessage, BookmarkFolderIcon, Button, ClipboardTextarea, ContextualMenu, Field, flash, Form, Input, Modal, useLoaded, useTradeModeSlugs} from './common';
import {FaIcon} from './icons';
import {ModFilter} from './ModFilter';

const FOLDERS_WARNING_THRESHOLD = 10;

interface FolderWithTrades {
  folder: BookmarkFolder;
  trades: BookmarkTrade[];
}

const loadAll = async (): Promise<FolderWithTrades[]> => {
  const folders = await bookmarks.fetchFolders();

  return Promise.all(folders.map(async (folder) => ({folder, trades: folder.id ? await bookmarks.fetchTrades(folder.id) : []})));
};

// Moves `moved` to the position of `target` in the list.
const reorder = <T,>(list: T[], moved: T, target: T): T[] => {
  if (moved === target) return list;

  const targetIndex = list.indexOf(target);
  const without = list.filter((item) => item !== moved);
  without.splice(targetIndex, 0, moved);

  return without;
};

// Dragging by the sort handle only, like the original.
interface Drag {
  kind: 'folder' | 'trade';
  id: string;
  folderId?: string;
}

let currentDrag: Drag | null = null;

const sortable = (drag: Drag, setDropTarget: (id: string | null) => void, onDrop: (dragged: Drag) => void) => ({
  onDragStart: (event: DragEvent) => {
    event.stopPropagation();
    currentDrag = drag;
    event.dataTransfer?.setData('text/plain', drag.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    (event.currentTarget as HTMLElement).classList.add('is-dragging');
  },
  onDragOver: (event: DragEvent) => {
    if (!currentDrag || currentDrag.kind !== drag.kind || currentDrag.folderId !== drag.folderId) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(drag.id);
  },
  onDrop: (event: DragEvent) => {
    if (!currentDrag || currentDrag.kind !== drag.kind) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    onDrop(currentDrag);
  },
  onDragEnd: (event: DragEvent) => {
    currentDrag = null;
    setDropTarget(null);
    const element = event.currentTarget as HTMLElement;
    element.classList.remove('is-dragging');
    element.draggable = false;
  },
});

function DragHandle(props: {class: string}) {
  const arm = (event: Event, draggable: boolean) => {
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-sortable]');
    if (row) row.draggable = draggable;
  };

  return (
    <button type="button" class={`${props.class} bt-drag-handle`} onMouseDown={(event) => arm(event, true)} onMouseUp={(event) => arm(event, false)}>
      <FaIcon icon="sort" />
    </button>
  );
}

export function Bookmarks() {
  const location = useLoaded(['location-change'], currentLocation, currentLocation());
  const all = useLoaded(['bookmarks-change'], loadAll, []);
  const [expandedIds, setExpandedIds] = useState(bookmarks.getExpandedFolderIds());
  const [isShowingArchived, setIsShowingArchived] = useState(false);
  const [stagedFolder, setStagedFolder] = useState<BookmarkFolder | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isAddingBuild, setIsAddingBuild] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const advancedFiltering = useLoaded(['settings-change'], isAdvancedFilteringOn, isAdvancedFilteringOn());

  const applicable = all.filter(({folder}) => folder.version === location.version);
  const active = applicable.filter(({folder}) => !folder.archivedAt);
  const archived = applicable.filter(({folder}) => folder.archivedAt);
  const showingArchived = isShowingArchived && archived.length > 0;
  const displayed = showingArchived ? archived : active;

  const updateExpanded = (ids: string[]) => {
    bookmarks.setExpandedFolderIds(ids);
    setExpandedIds(ids);
  };

  const toggleExpansion = (id: string) => updateExpanded(expandedIds.includes(id) ? expandedIds.filter((other) => other !== id) : [...expandedIds, id]);

  const reorderFolders = (dragged: Drag, target: BookmarkFolder) => {
    const folders = all.map(({folder}) => folder);
    const moved = folders.find((folder) => folder.id === dragged.id);
    if (moved) void bookmarks.saveFolders(reorder(folders, moved, target));
  };

  const persistFolder = async (folder: BookmarkFolder) => {
    const isNew = !folder.id;
    const id = await bookmarks.saveFolder(folder);
    if (isNew && !expandedIds.includes(id)) updateExpanded([...expandedIds, id]);

    flash.success(`The folder "${folder.title}" has been ${isNew ? 'created' : 'updated'}.`);
    setStagedFolder(null);
  };

  const persistImportedFolder = async ([folder, trades]: [BookmarkFolder, BookmarkTrade[]]) => {
    const id = await bookmarks.saveFolder(folder);
    await bookmarks.saveTrades(trades, id);
    flash.success(`The folder "${folder.title}" has been imported.`);
    setIsImporting(false);
  };

  const persistBuildFolder = async (folder: BookmarkFolder, trades: BookmarkTrade[]) => {
    const id = await bookmarks.saveFolder(folder);
    await bookmarks.saveTrades(trades, id);
    if (!expandedIds.includes(id)) updateExpanded([...expandedIds, id]);
    flash.success(`The folder "${folder.title}" has been created with ${trades.length} searches.`);
    setIsAddingBuild(false);
  };

  const headerActions = (
    <>
      {active.length > 0 && !showingArchived && <Button theme="gold" label="Collapse folders" icon="compress-alt" onClick={() => updateExpanded([])} />}
      {archived.length > 0 && (
        <Button
          theme="gold"
          label={showingArchived ? 'Return to active folders' : 'Show archive'}
          icon={showingArchived ? 'undo' : 'archive'}
          onClick={() => setIsShowingArchived(!showingArchived)}
        />
      )}
    </>
  );

  return (
    <>
      <div>
        {/* With Advanced filtering on, the result filter sits here and "Collapse folders" joins its
            Load all / Next 100 row; otherwise "Collapse folders" has a row of its own. */}
        {advancedFiltering ? <ModFilter trailing={headerActions} /> : <div class="bt-bookmarks-header-actions">{headerActions}</div>}

        <div class="bt-bookmarks-folders-wrapper">
          {displayed.map(({folder, trades}) => (
            <div
              key={folder.id}
              data-sortable
              class={`bt-bookmarks-folder-wrapper ${dropTarget === folder.id ? 'is-drop-target' : ''}`}
              {...sortable({kind: 'folder', id: folder.id as string}, setDropTarget, (dragged) => reorderFolders(dragged, folder))}
            >
              <Folder
                folder={folder}
                trades={trades}
                league={location.league || (location.version === '2' ? 'poe2/Standard' : 'Standard')}
                isExpanded={expandedIds.includes(folder.id as string)}
                onEdit={() => setStagedFolder(folder)}
                onExpansionToggle={() => toggleExpansion(folder.id as string)}
              />
            </div>
          ))}
        </div>

        {!showingArchived && (
          <div class="bt-bookmarks-actions">
            <Button
              theme="gold"
              class="bt-bookmarks-create-folder-button"
              label="New folder"
              icon="folder-plus"
              onClick={() => setStagedFolder({title: '', icon: null, version: location.version, archivedAt: null})}
            />
            <Button theme="gold" class="bt-bookmarks-create-folder-button" label="Import folder" icon="plus-square" onClick={() => setIsImporting(true)} />
            <Button theme="gold" class="bt-bookmarks-create-folder-button" label="Add build" icon="user-plus" onClick={() => setIsAddingBuild(true)} />
          </div>
        )}

        {!showingArchived && displayed.length >= FOLDERS_WARNING_THRESHOLD && (
          <AlertMessage
            class="bt-bookmarks-folders-warning"
            type="warning"
            message={
              <>
                Having a lot of folders can slow down the website.
                <br />
                Backup unnecessary folders using the export feature, then delete them.
              </>
            }
          />
        )}
      </div>

      <Backup />

      {stagedFolder && <FolderEdition folder={stagedFolder} onCancel={() => setStagedFolder(null)} onSubmit={(folder) => void persistFolder(folder)} />}
      {isAddingBuild && (
        <BuildImport
          version={location.version}
          onCancel={() => setIsAddingBuild(false)}
          onSubmit={(folder, trades) => void persistBuildFolder(folder, trades)}
        />
      )}
      {isImporting && <FolderImport onCancel={() => setIsImporting(false)} onSubmit={(result) => void persistImportedFolder(result)} />}
    </>
  );
}

function Folder(props: {
  folder: BookmarkFolder;
  trades: BookmarkTrade[];
  league: string;
  isExpanded: boolean;
  onEdit: () => void;
  onExpansionToggle: () => void;
}) {
  const {folder, trades, league} = props;
  const folderId = folder.id as string;
  const isArchived = Boolean(folder.archivedAt);
  const [stagedTrade, setStagedTrade] = useState<BookmarkTrade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState<BookmarkTrade | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Links open in the trade mode you are using now, not the one saved with them.
  const slugFor = useTradeModeSlugs(trades.map((trade) => ({key: trade.id as string, slug: trade.location.slug, version: trade.location.version})));
  const url = (trade: BookmarkTrade, suffix = '') =>
    tradeUrl(trade.location.version, trade.location.type, slugFor(trade.id as string, trade.location.slug), league) + suffix;

  const createTrade = async () => {
    const {version, type, slug} = currentLocation();
    if (!type || !slug) return;

    // Saved without the trade mode, so opening it later keeps whichever mode you are using.
    setStagedTrade({title: recommendTitle(), completedAt: null, location: {version, type, slug: await withoutTradeMode(slug)}});
  };

  const persistTrade = async (trade: BookmarkTrade) => {
    await bookmarks.saveTrade(trade, folderId);
    flash.success(`The trade "${trade.title}" has been ${trade.id ? 'updated' : 'created'}.`);
    setStagedTrade(null);
  };

  const updateTradeLocation = async (trade: BookmarkTrade) => {
    const {version, type, slug} = currentLocation();
    if (!type || !slug) return;

    await bookmarks.saveTrade({...trade, location: {version, type, slug: await withoutTradeMode(slug)}}, folderId);
    flash.success(`The trade location for "${trade.title}" has been updated.`);
  };

  const deleteTrade = async (trade: BookmarkTrade) => {
    await bookmarks.deleteTrade(trade.id as string, folderId);
    flash.success(`The trade "${trade.title}" has been deleted.`);
    setDeletingTrade(null);
  };

  const reorderTrades = (dragged: Drag, target: BookmarkTrade) => {
    const moved = trades.find((trade) => trade.id === dragged.id);
    if (moved) void bookmarks.saveTrades(reorder(trades, moved, target), folderId);
  };

  return (
    <>
      <div class={`bt-folder ${props.isExpanded ? 'is-expanded' : ''} ${isArchived ? 'is-archived' : ''}`}>
        <div class="bt-folder-header">
          <div class="bt-folder-expansion-wrapper" onClick={props.onExpansionToggle}>
            {folder.icon && <BookmarkFolderIcon icon={folder.icon} class="bt-folder-header-icon" />}
            <div class="bt-folder-header-label">{folder.title}</div>
            {!isArchived && <FaIcon icon="chevron-down" class="bt-folder-expansion-indicator" />}
          </div>

          <div class="bt-folder-header-actions">
            <ContextualMenu
              class="bt-folder-header-action"
              items={[
                ...(isArchived ? [] : [{label: 'Edit', onClick: props.onEdit}]),
                {
                  label: isArchived ? 'Restore' : 'Archive',
                  onClick: () => void bookmarks.saveFolder({...folder, archivedAt: isArchived ? null : new Date().toUTCString()}, {moveToEnd: true}),
                },
                {label: 'Export/Share', onClick: () => setIsExporting(true)},
                // Deletes the folder and every bookmark in it (asks to confirm first).
                {label: 'Delete', onClick: () => setIsDeletingFolder(true)},
              ]}
            />
            <DragHandle class="bt-folder-header-action" />
          </div>
        </div>

        {props.isExpanded && !isArchived && (
          <div>
            <ul class="bt-folder-trades">
              {trades.map((trade) => (
                <li
                  key={trade.id}
                  data-sortable
                  class={`bt-folder-trade ${dropTarget === trade.id ? 'is-drop-target' : ''}`}
                  {...sortable({kind: 'trade', id: trade.id as string, folderId}, setDropTarget, (dragged) => reorderTrades(dragged, trade))}
                >
                  <a href={url(trade)} class="bt-folder-trade-link" draggable={false}>
                    {trade.completedAt && (
                      <span class="bt-folder-trade-link-completed">
                        <FaIcon icon="check" />
                      </span>
                    )}
                    {trade.title}
                  </a>

                  <div class="bt-folder-trade-actions">
                    <ContextualMenu
                      class="bt-folder-trade-action"
                      items={[
                        {
                          label: 'Copy URL to clipboard',
                          onClick: () => {
                            void copyToClipboard(url(trade));
                            flash.success(`Trade URL for "${trade.title}" has been copied to the clipboard.`);
                          },
                        },
                        ...(trade.location.type === 'search' ? [{label: 'Live search', href: url(trade, '/live')}] : []),
                        {label: 'Save active trade', onClick: () => void updateTradeLocation(trade)},
                        {
                          label: trade.completedAt ? 'Unmark as complete' : 'Mark as complete',
                          onClick: () => void bookmarks.saveTrade({...trade, completedAt: trade.completedAt ? null : new Date().toUTCString()}, folderId),
                        },
                        {label: 'Edit', onClick: () => setStagedTrade(trade)},
                        {label: 'Delete', onClick: () => setDeletingTrade(trade)},
                      ]}
                    />
                    <DragHandle class="bt-folder-trade-action" />
                  </div>
                </li>
              ))}
            </ul>

            <div class="bt-folder-actions">
              <Button theme="gold" class="bt-folder-actions-new-trade" label="Register current trade" onClick={() => void createTrade()} />
            </div>
          </div>
        )}
      </div>

      {stagedTrade && (
        <Modal title="Bookmark trade" onClose={() => setStagedTrade(null)}>
          <TradeEdition trade={stagedTrade} onSubmit={(trade) => void persistTrade(trade)} />
        </Modal>
      )}

      {deletingTrade && (
        <Modal title="Confirm deletion" onClose={() => setDeletingTrade(null)}>
          <p class="bt-deletion-confirmation">
            Delete the bookmark <strong>{deletingTrade.title}</strong> ?
          </p>
          <div class="bt-deletion-actions">
            <Button theme="red" label="Delete" icon="trash-alt" onClick={() => void deleteTrade(deletingTrade)} />
            <Button theme="blue" label="Cancel" onClick={() => setDeletingTrade(null)} />
          </div>
        </Modal>
      )}

      {isDeletingFolder && (
        <Modal title="Confirm deletion" onClose={() => setIsDeletingFolder(false)}>
          <p class="bt-deletion-confirmation">
            Delete the bookmarks folder <strong>{folder.title}</strong>{' '}
            {trades.length === 1 && (
              <>
                and its <strong>single bookmark</strong>{' '}
              </>
            )}
            {trades.length > 1 && (
              <>
                and its <strong>{trades.length} bookmarks</strong>{' '}
              </>
            )}
            ?
          </p>
          <div class="bt-deletion-actions">
            <Button
              theme="red"
              label="Delete"
              icon="trash-alt"
              onClick={() => {
                void bookmarks.deleteFolder(folderId);
                flash.success(`The folder "${folder.title}" has been deleted.`);
                setIsDeletingFolder(false);
              }}
            />
            <Button theme="blue" label="Cancel" onClick={() => setIsDeletingFolder(false)} />
          </div>
        </Modal>
      )}

      {isExporting && (
        <Modal title="Bookmark folder export" onClose={() => setIsExporting(false)}>
          <div class="bt-folder-export-container">
            <Field label="Export code" helper="This code can be used to restore a folder. It can be used for backup and sharing purposes.">
              <ClipboardTextarea value={bookmarks.serializeFolder(folder, trades)} />
            </Field>
            <Button theme="blue" label="Close" onClick={() => setIsExporting(false)} />
          </div>
        </Modal>
      )}
    </>
  );
}

function TradeEdition(props: {trade: BookmarkTrade; onSubmit: (trade: BookmarkTrade) => void}) {
  const [title, setTitle] = useState(props.trade.title);

  return (
    <Form canSubmit={Boolean(title)} onSubmit={() => props.onSubmit({...props.trade, title})}>
      <Input label="Title" value={title} autofocus onChange={setTitle} />
      <Button type="submit" theme="gold" label="Save" icon="save" />
    </Form>
  );
}

function FolderEdition(props: {folder: BookmarkFolder; onCancel: () => void; onSubmit: (folder: BookmarkFolder) => void}) {
  const [title, setTitle] = useState(props.folder.title);
  const [icon, setIcon] = useState(props.folder.icon);
  const {items, ascendancies} = bookmarks.FOLDER_ICONS[props.folder.version];

  const option = (name: string) => (
    <li key={name} class={`bt-icon-option ${icon === name ? 'is-selected' : ''}`} onClick={() => setIcon(icon === name ? null : name)}>
      <img class="bt-icon-option-image" src={assetUrl(`images/bookmark-folder/${name}.png`)} alt={name} />
    </li>
  );

  return (
    <Modal title="Bookmark folder" onClose={props.onCancel}>
      <Form canSubmit={Boolean(title)} onSubmit={() => props.onSubmit({...props.folder, title, icon})}>
        <Input label="Title" value={title} autofocus onChange={setTitle} />

        <Field label="Icon">
          <ul class="bt-icon-options with-items">{items.map(option)}</ul>
          <ul class="bt-icon-options with-ascendancies">
            {ascendancies.map((group) => (
              <li key={group[0]}>
                <ul class="bt-icon-options">{group.map(option)}</ul>
              </li>
            ))}
          </ul>
        </Field>

        <Button type="submit" theme="gold" label="Save" icon="save" />
      </Form>
    </Modal>
  );
}

function FolderImport(props: {onCancel: () => void; onSubmit: (result: [BookmarkFolder, BookmarkTrade[]]) => void}) {
  const [code, setCode] = useState('');
  const parsed = code ? bookmarks.deserializeFolder(code) : null;
  const count = parsed ? parsed[1].length : 0;

  return (
    <Modal title="Import bookmark folder" onClose={props.onCancel}>
      <Form canSubmit={Boolean(parsed)} onSubmit={() => parsed && props.onSubmit(parsed)}>
        <Input label="Import code" autofocus onChange={setCode} />

        {parsed ? (
          <div class="bt-import-preview">
            {parsed[0].icon && <BookmarkFolderIcon icon={parsed[0].icon} />}
            <div class="bt-import-preview-title">
              {parsed[0].title} {count === 1 ? '(1 bookmark)' : count > 1 ? `(${count} bookmarks)` : ''}
            </div>
          </div>
        ) : (
          code && <AlertMessage type="alert" message="The entered code seems invalid, try another one." />
        )}

        <Button type="submit" theme="gold" label="Save" icon="save" />
      </Form>
    </Modal>
  );
}

function BuildImport(props: {version: TradeSiteVersion; onCancel: () => void; onSubmit: (folder: BookmarkFolder, trades: BookmarkTrade[]) => void}) {
  const [input, setInput] = useState('');
  const [percent, setPercent] = useState('80');
  const [build, setBuild] = useState<Document | null>(null);
  const [sets, setSets] = useState<ItemSetChoice[]>([]);
  const [setId, setSetId] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minPercent = Math.min(100, Math.max(0, parseInt(percent, 10) || 0));

  // Read the build as soon as a code or link is pasted, so its item sets can be listed.
  useEffect(() => {
    setBuild(null);
    setSets([]);
    setError(null);
    if (!input.trim()) return undefined;

    let isCurrent = true;
    const timer = window.setTimeout(async () => {
      setIsReading(true);
      const result = await loadBuild(input);
      if (!isCurrent) return;
      setIsReading(false);
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      const listed = listItemSets(result);
      setBuild(result);
      setSets(listed.sets);
      setSetId(listed.active);
    }, 300);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [input]);

  const submit = async () => {
    if (!build) return;
    setIsWorking(true);
    setError(null);
    const result = await createBuildFolder(build, props.version, minPercent, setId || undefined);
    setIsWorking(false);
    if (typeof result === 'string') setError(result);
    else if (!result.trades.length) setError('No searches could be made from this item set.');
    else props.onSubmit(result.folder, result.trades);
  };

  return (
    <Modal title="Add build" onClose={props.onCancel}>
      <Form canSubmit={Boolean(build) && !isWorking} onSubmit={() => void submit()}>
        <Input label="Path of Building code or pobb.in link" autofocus onChange={setInput} />
        {sets.length > 1 && (
          <Field label="Item set">
            <select class="bt-form-input bt-build-import-set" value={setId} onChange={(event) => setSetId((event.target as HTMLSelectElement).value)}>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Input label="Minimum mod values (% of the build's rolls)" value={percent} onChange={setPercent} />
        <div class="bt-build-import-help">
          {isReading
            ? 'Reading build\u2026'
            : `Makes a folder with a trade search for each item the build wears. Uniques are searched by name and their mods (any roll); other items by their mods, at ${minPercent}% of the build's values.`}
        </div>
        {error && <AlertMessage type="alert" message={error} />}
        <Button type="submit" theme="gold" label={isWorking ? 'Adding\u2026' : 'Add build'} icon="user-plus" />
      </Form>
    </Modal>
  );
}

function Backup() {
  const linkRef = useRef<HTMLAnchorElement>(null);

  const generate = async () => {
    const link = linkRef.current;
    if (!link) return;

    link.href = URL.createObjectURL(new Blob([await bookmarks.generateBackup()], {type: 'text/plain'}));
    link.download = 'poe-better-trading-backup.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const restore = async (file: File) => {
    const restored = await file
      .text()
      .then(bookmarks.restoreBackup)
      .catch(() => 0);
    if (!restored) flash.alert('Backup restoration has failed.');
  };

  return (
    <div class="bt-backup">
      <div class="bt-backup-title">Backup tools</div>
      <Button class="bt-backup-action" theme="blue" icon="file-export" label="Save file" onClick={() => void generate()} />
      <Button class="bt-backup-action" theme="blue" icon="file-import" label="Restore from file" onFile={(file) => void restore(file)} />
      <a ref={linkRef} style="display:none" />
    </div>
  );
}
