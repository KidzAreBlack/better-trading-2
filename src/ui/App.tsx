import {useEffect, useRef, useState} from 'preact/hooks';
import {assetUrl, local} from '../lib/ext';
import {isAdvancedFilteringOn, isEnabled} from '../lib/settings';
import {Bookmarks} from './Bookmarks';
import {FlashMessages, useLoaded} from './common';
import {FaIcon, type IconName} from './icons';
import {ModFilter} from './ModFilter';
import {About, History, PinnedItems, Settings} from './pages';

const COLLAPSED_KEY = 'side-panel-collapsed';
const PEEK_CLOSE_DELAY_MS = 350;

const PAGES: {id: string; icon: IconName; label: string; component: () => preact.JSX.Element | null}[] = [
  {id: 'bookmarks', icon: 'folder-open', label: 'Bookmarks', component: Bookmarks},
  {id: 'pinned-items', icon: 'thumbtack', label: 'Pinned items', component: PinnedItems},
  {id: 'history', icon: 'history', label: 'History', component: History},
  {id: 'settings', icon: 'cog', label: 'Settings', component: Settings},
];

export function App() {
  // Every newly opened page starts on Bookmarks.
  const [pageId, setPageId] = useState('bookmarks');
  const [isAbout, setIsAbout] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(local.get(COLLAPSED_KEY) === 'true');
  const advancedFiltering = useLoaded(['settings-change'], isAdvancedFilteringOn, isAdvancedFilteringOn());

  // Optional "peek": while the panel is hidden, hovering its icon slides the panel
  // in over the page (the page keeps its full width). It slides away again
  // shortly after the mouse leaves it. Clicking the icon still opens it for good.
  const [isPeeking, setIsPeeking] = useState(false);
  const peekTimer = useRef<number>();
  const cancelPeekClose = () => window.clearTimeout(peekTimer.current);
  const startPeek = () => {
    if (!isCollapsed || !isEnabled('hover-open')) return;
    cancelPeekClose();
    setIsPeeking(true);
  };
  const endPeek = () => {
    if (!isPeeking) return;
    cancelPeekClose();
    peekTimer.current = window.setTimeout(() => setIsPeeking(false), PEEK_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    document.body.classList.toggle('bt-is-peeking', isPeeking);
  }, [isPeeking]);

  useEffect(() => cancelPeekClose, []);

  const collapse = (collapsed: boolean) => {
    cancelPeekClose();
    setIsPeeking(false);
    local.set(COLLAPSED_KEY, collapsed ? 'true' : null);
    document.body.classList.toggle('bt-is-collapsed', collapsed);
    setIsCollapsed(collapsed);
  };

  const Page = PAGES.find((page) => page.id === pageId)!.component;

  return (
    <>
      {/* The icon is inside the panel, so leaving the icon or the panel both end the peek here. */}
      <div id="better-trading-container" onMouseEnter={cancelPeekClose} onMouseLeave={endPeek}>
        <div class="bt-header">
          {/* While peeking, this arrow keeps the panel open instead of hiding it. */}
          <button
            type="button"
            class="bt-header-button"
            title={isPeeking ? 'Keep the panel open' : undefined}
            onClick={() => collapse(!isPeeking)}
          >
            <FaIcon icon={isPeeking ? 'angle-left' : 'angle-right'} />
          </button>

          <a class="bt-header-brand" href="#" onClick={(event) => (event.preventDefault(), setIsAbout(false))}>
            <img class="bt-header-logo" src={assetUrl('images/logo.png')} />
            <div class="bt-header-title">Better Trading 2</div>
          </a>

          <a class="bt-header-button" href="#" onClick={(event) => (event.preventDefault(), setIsAbout(!isAbout))}>
            <FaIcon icon={isAbout ? 'times' : 'info-circle'} fixedWidth />
          </a>
        </div>

        <button
          type="button"
          class={`bt-header-expand-button ${isCollapsed ? 'is-visible' : ''}`}
          onClick={() => collapse(false)}
          onMouseEnter={startPeek}
        >
          <FaIcon icon="angle-left" class="bt-header-expand-button-icon" />
          <img class="bt-header-logo" src={assetUrl('images/logo.png')} />
        </button>

        {isAbout ? (
          <About />
        ) : (
          <>
            <ul class="bt-root-page-menu">
              {PAGES.map((page) => (
                <li key={page.id} class={`bt-root-page-menu-item ${page.id === pageId ? 'is-active' : ''}`} onClick={() => setPageId(page.id)}>
                  <FaIcon icon={page.icon} class="bt-root-page-menu-item-icon" />
                  {page.label}
                </li>
              ))}
            </ul>

            {/* The result filter only shows on the Bookmarks tab. */}
            {advancedFiltering && pageId === 'bookmarks' && <ModFilter />}

            <Page />
          </>
        )}
      </div>

      <FlashMessages />
    </>
  );
}
