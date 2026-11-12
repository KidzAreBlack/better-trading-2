// Mouse-wheel over the sidebar: the sidebar scrolls while it has more to show
// in that direction; once it is at its end (or has nothing to scroll), the
// trade page scrolls instead, straight away.
//
// Browsers normally keep sending the rest of a wheel gesture to the sidebar
// even after it reaches its end, which made the page feel stuck.

const findPageScroller = (): Element | null => {
  const root = document.scrollingElement;
  if (root && root.scrollHeight > root.clientHeight) return root;

  // Some layouts scroll an inner element instead of the window.
  for (let element = document.getElementById('trade'); element; element = element.parentElement) {
    const {overflowY} = getComputedStyle(element);
    if (/(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight) return element;
  }

  return root;
};

const pixels = (event: WheelEvent, scroller: Element) => {
  if (event.deltaMode === 1) return event.deltaY * 16; // lines
  if (event.deltaMode === 2) return event.deltaY * scroller.clientHeight; // pages

  return event.deltaY;
};

export default function setupSidebarScroll(): void {
  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || !event.deltaY) return; // ctrl+wheel is zoom

      const panel = document.getElementById('better-trading-container');
      const target = event.target as Element | null;
      if (!panel || !target || !panel.contains(target)) return;

      // Leave inner scrollable boxes (text areas, lists) alone.
      for (let element: Element | null = target; element && element !== panel; element = element.parentElement) {
        const {overflowY} = getComputedStyle(element);
        if (/(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight) return;
      }

      const goingDown = event.deltaY > 0;
      const panelCanScroll = goingDown
        ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1
        : panel.scrollTop > 0;
      if (panelCanScroll) return;

      const scroller = findPageScroller();
      if (!scroller) return;

      event.preventDefault();
      scroller.scrollBy({top: pixels(event, scroller)});
    },
    {passive: false}
  );
}
