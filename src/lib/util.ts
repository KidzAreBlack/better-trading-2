export const uniqueId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

// UTF-8 safe base64, compatible with the original extension's folder export strings.
export const base64Encode = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));

  return btoa(binary);
};

export const base64Decode = (encoded: string): string => {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
};

// "5 minutes ago", "about 2 hours ago"... worded like the original (date-fns formatDistance).
export const timeAgo = (isoDate: string): string => {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(minutes / 1440);
  const months = Math.round(days / 30);
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;
  let distance: string;

  if (seconds < 5) distance = 'less than 5 seconds';
  else if (seconds < 10) distance = 'less than 10 seconds';
  else if (seconds < 20) distance = 'less than 20 seconds';
  else if (seconds < 40) distance = 'half a minute';
  else if (seconds < 60) distance = 'less than a minute';
  else if (seconds < 90) distance = '1 minute';
  else if (minutes < 45) distance = plural(minutes, 'minute');
  else if (minutes < 90) distance = 'about 1 hour';
  else if (minutes < 1440) distance = `about ${plural(hours, 'hour')}`;
  else if (minutes < 2520) distance = '1 day';
  else if (days < 30) distance = plural(days, 'day');
  else if (days < 45) distance = 'about 1 month';
  else if (days < 60) distance = 'about 2 months';
  else if (days < 365) distance = plural(months, 'month');
  else distance = `about ${plural(Math.round(days / 365), 'year')}`;

  return `${distance} ago`;
};

// Tiny event hub so features and the sidebar can notify each other.
type Listener = () => void;
const listeners: Record<string, Set<Listener>> = {};

export const on = (event: string, listener: Listener): (() => void) => {
  (listeners[event] ||= new Set()).add(listener);

  return () => listeners[event].delete(listener);
};

export const emit = (event: string): void => {
  (listeners[event] || []).forEach((listener) => listener());
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch (_error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();

    return ok;
  }
};

// Sets a value on one of the trade site's own inputs in a way its framework notices.
export const setInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;

  ['input', 'change', 'blur'].forEach((type) => input.dispatchEvent(new Event(type, {bubbles: true})));
};
