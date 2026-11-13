import type {ComponentChildren} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {assetUrl} from '../lib/ext';
import {currentTradeMode, withTradeMode} from '../lib/search-link';
import type {TradeSiteVersion} from '../lib/trade-location';
import {copyToClipboard, emit, on} from '../lib/util';
import {FaIcon, type IconName} from './icons';

// Re-runs `load` whenever one of the named events fires, and returns its latest result.
export function useLoaded<T>(events: string[], load: () => Promise<T> | T, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let isActive = true;
    const refresh = async () => {
      const next = await load();
      if (isActive) setValue(next);
    };

    void refresh();
    const unsubscribes = events.map((event) => on(event, () => void refresh()));

    return () => {
      isActive = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return value;
}

// ---- Button -------------------------------------------------------------------

interface ButtonProps {
  theme: 'blue' | 'gold' | 'red';
  label?: string;
  icon?: IconName;
  href?: string;
  type?: 'button' | 'submit';
  class?: string;
  onClick?: () => void;
  onFile?: (file: File) => void;
}

export function Button(props: ButtonProps) {
  const className = `bt-button is-${props.theme} ${props.class || ''}`;
  const content = (
    <>
      {props.icon && <FaIcon icon={props.icon} />}
      {props.label && <span class={props.icon ? 'bt-button-label with-icon' : 'bt-button-label'}>{props.label}</span>}
    </>
  );

  if (props.href) {
    return (
      <a href={props.href} target="_blank" rel="noopener" class={className}>
        {content}
      </a>
    );
  }

  if (props.onFile) {
    return (
      <label class={className}>
        <input
          class="bt-button-file-input"
          type="file"
          accept="text/plain"
          onChange={(event) => {
            const input = event.target as HTMLInputElement;
            if (input.files?.[0]) props.onFile?.(input.files[0]);
            input.value = '';
          }}
        />
        {content}
      </label>
    );
  }

  return (
    <button type={props.type || 'button'} class={className} onClick={() => props.onClick?.()}>
      {content}
    </button>
  );
}

// ---- Alert and flash messages ----------------------------------------------------

type AlertType = 'warning' | 'alert' | 'success';

export function AlertMessage(props: {type: AlertType; message: ComponentChildren; class?: string}) {
  return (
    <div class={`bt-alert-message is-${props.type} ${props.class || ''}`}>
      <FaIcon icon={props.type === 'success' ? 'check-circle' : 'exclamation-circle'} class="bt-alert-message-icon" />
      <span>{props.message}</span>
    </div>
  );
}

interface Flash {
  id: number;
  message: string;
  type: AlertType;
}

let flashes: Flash[] = [];
let nextFlashId = 1;

const dismiss = (flash: Flash) => {
  flashes = flashes.filter((candidate) => candidate !== flash);
  emit('flashes-change');
};

const addFlash = (message: string, type: AlertType) => {
  const flash = {id: nextFlashId++, message, type};
  flashes = [...flashes, flash];
  emit('flashes-change');
  window.setTimeout(() => dismiss(flash), 3000);
};

export const flash = {
  success: (message: string) => addFlash(message, 'success'),
  alert: (message: string) => addFlash(message, 'alert'),
};

export function FlashMessages() {
  const current = useLoaded(['flashes-change'], () => flashes, flashes);

  return (
    <div class="bt-flash-messages">
      {current.map((item) => (
        <div key={item.id} class="bt-flash-message-wrapper" onClick={() => dismiss(item)}>
          <AlertMessage type={item.type} message={item.message} class="bt-flash-message" />
        </div>
      ))}
    </div>
  );
}

// ---- Modal and forms ---------------------------------------------------------------

export function Modal(props: {title: string; onClose: () => void; children: ComponentChildren}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && props.onClose();
    document.body.addEventListener('keyup', onKey);

    return () => document.body.removeEventListener('keyup', onKey);
  }, []);

  return (
    <div class="bt-modal-wrapper">
      <div class="bt-modal-overlay" onClick={props.onClose} />
      <div class="bt-modal-dialog">
        <div class="bt-modal-container">
          <header class="bt-modal-header">
            <h1 class="bt-modal-header-title">
              <img class="bt-modal-header-title-logo" src={assetUrl('images/logo.png')} />
              {props.title}
            </h1>
            <button type="button" class="bt-modal-header-close" onClick={props.onClose}>
              <FaIcon icon="times" />
            </button>
          </header>
          <div>{props.children}</div>
        </div>
      </div>
    </div>
  );
}

export function Form(props: {canSubmit?: boolean; onSubmit: () => void; children: ComponentChildren}) {
  const canSubmit = props.canSubmit !== false;

  return (
    <form
      class={`bt-form-container ${canSubmit ? '' : 'is-disabled'}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) props.onSubmit();
      }}
    >
      {props.children}
    </form>
  );
}

export function Field(props: {label: string; helper?: string; children: ComponentChildren}) {
  return (
    <label class="bt-form-field">
      <div class="bt-form-field-label">{props.label}</div>
      {props.children}
      {props.helper && <p class="bt-form-field-helper">{props.helper}</p>}
    </label>
  );
}

export function Input(props: {label: string; value?: string; autofocus?: boolean; onChange: (value: string) => void}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.autofocus) input.current?.focus();
  }, []);

  return (
    <Field label={props.label}>
      <input ref={input} type="text" class="bt-form-input" value={props.value} onInput={(event) => props.onChange((event.target as HTMLInputElement).value)} />
    </Field>
  );
}

export function Checkbox(props: {label: string; value: boolean; class?: string; onChange: (value: boolean) => void}) {
  return (
    <label class={`bt-form-checkbox ${props.class || ''}`} onClick={() => props.onChange(!props.value)}>
      <div class={`bt-form-checkbox-indicator ${props.value ? 'is-active' : ''}`} />
      <span class="bt-form-checkbox-label">{props.label}</span>
    </label>
  );
}

export function ClipboardTextarea(props: {value: string}) {
  const [hasCopied, setHasCopied] = useState(false);

  return (
    <div class="bt-clipboard-textarea-wrapper">
      <textarea class="bt-clipboard-textarea" readOnly value={props.value} onFocus={(event) => (event.target as HTMLTextAreaElement).select()} />
      <Button
        theme="gold"
        icon="clipboard"
        class="bt-clipboard-button"
        label={hasCopied ? 'Copied' : 'Copy to clipboard'}
        onClick={() => {
          void copyToClipboard(props.value);
          setHasCopied(true);
        }}
      />
    </div>
  );
}

// ---- Contextual menu (the "..." on folders and trades) ---------------------------------

export interface MenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

const HIDE_DELAY_MS = 500;

export function ContextualMenu(props: {class?: string; items: MenuItem[]}) {
  const [position, setPosition] = useState<{x: number; y: number} | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const itemsElement = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();

  const cancelHide = () => window.clearTimeout(hideTimer.current);
  const hide = () => {
    cancelHide();
    setPosition(null);
    setTop(null);
  };

  useEffect(() => {
    if (!position || !itemsElement.current) return;
    setTop(position.y - Math.max(itemsElement.current.clientHeight + position.y - window.innerHeight, 0));
  }, [position]);

  useEffect(() => cancelHide, []);

  return (
    <>
      <div class={`bt-contextual-menu ${props.class || ''}`} onClick={(event) => setPosition({x: event.clientX, y: event.clientY})}>
        <FaIcon icon="ellipsis-h" />
      </div>

      {position && (
        <div
          ref={itemsElement}
          class="bt-contextual-menu-items"
          style={{top: `${top ?? position.y}px`, left: `${position.x}px`}}
          onMouseLeave={() => {
            cancelHide();
            hideTimer.current = window.setTimeout(hide, HIDE_DELAY_MS);
          }}
          onMouseEnter={cancelHide}
        >
          {props.items.map((item) =>
            item.href ? (
              <a key={item.label} href={item.href} class="bt-contextual-menu-item" onClick={hide}>
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                class="bt-contextual-menu-item"
                onClick={() => {
                  item.onClick?.();
                  hide();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}

// ---- Folder icon and mounting of cloned page elements ---------------------------------

const isItemIcon = (icon: string) => !/^(poe2-)?(slayer|gladiator|champion|assassin|saboteur|trickster|juggernaut|berserker|chieftain|necromancer|elementalist|occultist|deadeye|raider|pathfinder|guardian|hierophant|inquisitor|ascendant|titan|warbringer|smith-of-kitava|infernalist|blood-mage|lich|chronomancer|stormweaver|witch-hunter|gemling-legionnaire|tactician|invoker|acolyte-of-chayula|ritualist|amazon)$/.test(icon);

export function BookmarkFolderIcon(props: {icon: string; class?: string}) {
  return (
    <img
      class={`bt-bookmark-folder-icon ${isItemIcon(props.icon) ? 'is-item' : 'is-ascendancy'} ${props.class || ''}`}
      src={assetUrl(`images/bookmark-folder/${props.icon}.png`)}
      alt={props.icon}
    />
  );
}

export function Mount(props: {element: HTMLElement | null; class?: string}) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = holder.current;
    if (!target || !props.element) return undefined;

    target.replaceChildren(props.element);

    return () => target.replaceChildren();
  }, [props.element]);

  return <div class={props.class} style={props.class ? undefined : 'display:contents'} ref={holder} />;
}

// Saved links (bookmarks, history) opened in the trade mode you are using now (In Person,
// Instant Buyout...) instead of the one they were saved with. Returns a lookup by key.
export function useTradeModeSlugs(items: {key: string; slug: string; version: TradeSiteVersion}[]): (key: string, fallback: string) => string {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [modeChanges, setModeChanges] = useState(0);
  useEffect(() => on('trade-mode-change', () => setModeChanges((count) => count + 1)), []);

  const signature = items.map((item) => `${item.key}:${item.version}:${item.slug}`).join('|');
  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      const next: Record<string, string> = {};
      for (const item of items) next[item.key] = await withTradeMode(item.slug, currentTradeMode(item.version));
      if (isCurrent) setResolved(next);
    })();
    return () => {
      isCurrent = false;
    };
  }, [signature, modeChanges]);

  return (key, fallback) => resolved[key] ?? fallback;
}
