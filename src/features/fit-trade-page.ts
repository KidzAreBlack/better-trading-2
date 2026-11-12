import {onPageChange} from '../lib/page-watch';

// Keeps the pathofexile.com trade page beside the Better Trading side panel
// instead of letting it slide underneath.
//
// The trade site has a minimum layout width. When the window is too narrow to
// fit that width plus the side panel, the page overflows to the right and ends
// up hidden behind the panel. When that happens, this scales the page down
// (with CSS zoom) so it fits exactly in the space left of the panel.

const EXTENSION_WIDTH = 400; // Keep in sync with --bt-width in src/content.css
const MIN_ZOOM = 0.5;
const PANEL_ANIMATION_MS = 250; // the panel's width transition takes 0.2s

let isFitting = false;

// The top-level child of <body> that contains the trade site.
const findPage = (): HTMLElement | null => {
  let element = document.getElementById('trade');
  while (element && element.parentElement && element.parentElement !== document.body) element = element.parentElement;
  return element;
};
let scheduled = false;

const fit = () => {
  scheduled = false;
  if (isFitting) return;

  const app = findPage();
  if (!app) return;

  isFitting = true;

  // Measure with the width animation switched off. Otherwise, right after the
  // panel is shown again, the page is still mid-animation (almost full width)
  // and gets shrunk far too much.
  const previousTransition = app.style.transition;
  app.style.transition = 'none';

  try {
    // Reset to the stylesheet's layout (width: calc(100% - panel)) before measuring.
    app.style.removeProperty('zoom');
    app.style.removeProperty('width');

    if (document.body.classList.contains('bt-is-collapsed')) return;

    const availableWidth = document.documentElement.clientWidth - EXTENSION_WIDTH;
    const neededWidth = Math.max(app.scrollWidth, app.getBoundingClientRect().width);

    if (availableWidth <= 0 || neededWidth <= availableWidth + 1) return;

    const zoom = Math.max(MIN_ZOOM, availableWidth / neededWidth);

    // Lay the page out at the width it needs, then scale it down to fit.
    app.style.setProperty('width', `${neededWidth}px`);
    app.style.setProperty('zoom', String(zoom));
  } finally {
    void app.offsetWidth; // apply the new size before the animation is switched back on
    app.style.transition = previousTransition;
    isFitting = false;
  }
};

const scheduleFit = () => {
  if (scheduled) return;
  scheduled = true;

  // Normally on the next frame; the timer covers moments when the browser is not drawing frames.
  const run = () => {
    if (scheduled) fit();
  };
  window.requestAnimationFrame(run);
  window.setTimeout(run, 100);
};

export default function fitTradePage() {
  window.addEventListener('resize', scheduleFit);

  // Collapsing/expanding the panel toggles a class on <body>. When the panel is
  // shown again, wait for the page's width animation to finish before fitting.
  let wasCollapsed = document.body.classList.contains('bt-is-collapsed');
  new MutationObserver(() => {
    const isCollapsed = document.body.classList.contains('bt-is-collapsed');
    if (isCollapsed === wasCollapsed) return;
    wasCollapsed = isCollapsed;

    if (isCollapsed) scheduleFit();
    else window.setTimeout(scheduleFit, PANEL_ANIMATION_MS);
  }).observe(document.body, {attributes: true, attributeFilter: ['class']});

  // The trade site renders asynchronously (search results, filters), so re-check as content changes.
  const app = findPage();
  if (app) app.classList.add('bt-page');
  onPageChange(scheduleFit);

  scheduleFit();
}
