// Builds the extension for Chrome (dist/chrome) and Firefox (dist/firefox).
//   node build.mjs           one build
//   node build.mjs --watch   rebuild whenever a source file changes
import {build, context, transform} from 'esbuild';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';

const watch = process.argv.includes('--watch');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const TRADE_MATCHES = ['*://www.pathofexile.com/trade*'];
const NINJA_HOST = 'https://poe.ninja/*';

// Firefox add-on id. It can never change once the add-on is uploaded to addons.mozilla.org.
const GECKO_ID = 'better-trading-2@KidzAreBlack';

const baseManifest = {
  manifest_version: 3,
  name: 'Better Trading 2',
  description: 'Unofficial community rewrite of Better Trading: sidebar, bookmarks and search tools for the Path of Exile trade site.',
  version: pkg.version,
  homepage_url: 'https://github.com/KidzAreBlack/better-trading-2',
  icons: {16: 'assets/icon16.png', 32: 'assets/icon32.png', 48: 'assets/icon48.png', 128: 'assets/icon128.png'},
  permissions: ['storage'],
  // Price data for the "equivalent prices" feature is fetched from poe.ninja by the background script.
  host_permissions: [NINJA_HOST],
  content_scripts: [{matches: TRADE_MATCHES, js: ['content.js'], css: ['content.css'], run_at: 'document_idle'}],
  web_accessible_resources: [{resources: ['assets/*'], matches: ['*://www.pathofexile.com/*']}],
};

const manifests = {
  // Chrome, Edge, Brave, Opera, Vivaldi, Thorium...
  chrome: {
    ...baseManifest,
    minimum_chrome_version: '110',
    background: {service_worker: 'background.js'},
  },
  // Firefox runs Manifest V3 background code as a script (event page), not a service worker.
  firefox: {
    ...baseManifest,
    background: {scripts: ['background.js']},
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        // 140 is the first release that understands data_collection_permissions.
        strict_min_version: '140.0',
        // Nothing about the user is collected or sent anywhere.
        data_collection_permissions: {required: ['none']},
      },
      // Firefox for Android understands data_collection_permissions from 142.
      gecko_android: {strict_min_version: '142.0'},
    },
  },
};

const options = (target) => ({
  entryPoints: {content: 'src/main.tsx', background: 'src/background.ts'},
  outdir: `dist/${target}`,
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox126'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define: {__VERSION__: JSON.stringify(pkg.version)},
  minify: !watch, // small, fast-loading files for use; readable ones while developing
  logLevel: 'info',
});

const prepare = (target) => {
  rmSync(`dist/${target}`, {recursive: true, force: true});
  mkdirSync(`dist/${target}`, {recursive: true});
  cpSync('assets', `dist/${target}/assets`, {recursive: true});
  cpSync('LICENSE', `dist/${target}/LICENSE`);
  writeFileSync(`dist/${target}/manifest.json`, JSON.stringify(manifests[target], null, 2));
};

// Styles: minified for use, as written while developing.
const writeCss = async (target) => {
  const css = readFileSync('src/content.css', 'utf8');
  writeFileSync(`dist/${target}/content.css`, watch ? css : (await transform(css, {loader: 'css', minify: true})).code);
};

for (const target of Object.keys(manifests)) {
  prepare(target);
  await writeCss(target);

  if (watch) {
    const ctx = await context({
      ...options(target),
      plugins: [{name: 'copy-css', setup: (b) => b.onEnd(() => writeCss(target))}],
    });
    await ctx.watch();
  } else {
    await build(options(target));
  }
}

console.log(watch ? 'Watching for changes...' : 'Built dist/chrome and dist/firefox');
