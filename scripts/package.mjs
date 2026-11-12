// Packages the built extension for the stores.
//   npm run package
// Writes to release/:
//   better-trading-2-chrome-<version>.zip    upload to the Chrome Web Store
//   better-trading-2-firefox-<version>.zip   upload to addons.mozilla.org (AMO)
//   better-trading-2-source-<version>.zip    source code for AMO reviewers
// Each extension zip has manifest.json and LICENSE at its root. No dependencies: the zip
// writer below uses only Node's built-in zlib, so it works the same on Windows, macOS and Linux.
import {deflateRawSync} from 'node:zlib';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const {version} = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outDir = join(root, 'release');

// ---- Minimal zip writer (deflate, no zip64; fine for archives far below 4 GB) ----------

const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// Fixed timestamp (1 Jan 2020) so the same files always give the same archive.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

const writeZip = (file, entries) => {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const {name, data} of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, {level: 9});
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(file, Buffer.concat([...parts, ...central, end]));
};

// ---- Collecting files ------------------------------------------------------------------

// Every file under `dir`, as zip entries named relative to `base`, with "/" separators.
const collect = (dir, base, skip = () => false) => {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const rel = relative(base, path).split(sep).join('/');
    if (skip(rel, name)) continue;
    if (statSync(path).isDirectory()) entries.push(...collect(path, base, skip));
    else entries.push({name: rel, data: readFileSync(path)});
  }
  return entries;
};

const requireAtRoot = (label, entries, names) => {
  for (const name of names) {
    if (!entries.some((entry) => entry.name === name)) throw new Error(`${label}: ${name} is missing from the archive root`);
  }
};

mkdirSync(outDir, {recursive: true});

for (const target of ['chrome', 'firefox']) {
  const dir = join(root, 'dist', target);
  if (!existsSync(join(dir, 'manifest.json'))) throw new Error(`dist/${target} is not built. Run: npm run build`);

  const entries = collect(dir, dir, (_rel, name) => name.startsWith('.'));
  requireAtRoot(target, entries, ['manifest.json', 'LICENSE', 'content.js', 'content.css', 'background.js']);

  const file = join(outDir, `better-trading-2-${target}-${version}.zip`);
  writeZip(file, entries);
  console.log(`${relative(root, file)}  (${entries.length} files)`);
}

// Source for AMO review: everything needed to rebuild, without installed or generated files.
const SKIP_SOURCE = new Set(['node_modules', 'dist', 'release', '.git']);
const sourceEntries = collect(root, root, (rel, name) => SKIP_SOURCE.has(rel.split('/')[0]) || name === '.DS_Store');
requireAtRoot('source', sourceEntries, ['package.json', 'package-lock.json', 'build.mjs', 'LICENSE', 'README.md']);
const sourceFile = join(outDir, `better-trading-2-source-${version}.zip`);
writeZip(sourceFile, sourceEntries);
console.log(`${relative(root, sourceFile)}  (${sourceEntries.length} files)`);
