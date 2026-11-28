// Automatic bookmark backup: a few seconds after your bookmarks (or Quick filter presets) change, the same file the
// Backup button makes is saved to Downloads/Better Trading 2/<browser>_backup.txt (overwriting the
// last one). The background script does the saving; nothing is saved when nothing changed.

import {generateBackup, isEmptyBackup} from '../lib/bookmarks';
import {local, sendMessage} from '../lib/ext';
import {isEnabled} from '../lib/settings';
import {emit, on} from '../lib/util';

const DELAY_MS = 5000;
const LAST_KEY = 'auto-backup-last'; // a fingerprint of the last saved backup
const STATUS_KEY = 'auto-backup-status'; // when it last saved, or last failed

export interface AutoBackupStatus {
  savedAt: string | null;
  failedAt: string | null;
}

export const getAutoBackupStatus = (): AutoBackupStatus => {
  try {
    return {savedAt: null, failedAt: null, ...JSON.parse(local.get(STATUS_KEY) || '{}')};
  } catch (_error) {
    return {savedAt: null, failedAt: null};
  }
};

const setStatus = (status: AutoBackupStatus) => {
  local.set(STATUS_KEY, JSON.stringify(status));
  emit('auto-backup-change');
};

// A short fingerprint, to tell whether anything changed since the last save.
const fingerprint = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash}`;
};

const backUpNow = async (): Promise<boolean> => {
  const text = await generateBackup();
  // Nothing to save (no bookmarks or presets here, or they couldn't be read): keep the last file
  // rather than replace it with an empty one. Another browser or profile may share the same
  // Downloads folder.
  if (isEmptyBackup(text)) return true;
  const print = fingerprint(text);
  if (local.get(LAST_KEY) === print) return true;

  const saved = await sendMessage<boolean>({query: 'backup-file', text});
  const now = new Date().toISOString();
  if (saved) {
    local.set(LAST_KEY, print);
    setStatus({savedAt: now, failedAt: null});
  } else {
    setStatus({...getAutoBackupStatus(), failedAt: now});
  }
  return Boolean(saved);
};

export default function setupAutoBackup() {
  let timer: number | undefined;
  const schedule = () => {
    if (!isEnabled('auto-backup')) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void backUpNow(), DELAY_MS);
  };

  on('bookmarks-change', schedule);
  on('quick-filters-change', schedule);
  // Turning the setting on saves one right away (after the same short wait).
  on('settings-change', schedule);
}
