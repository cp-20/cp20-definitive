import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sheetStartsOpen, SHEET_DESK_SPACE } from '../src/data/sheet-start.mjs';

const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const at = css.indexOf(`  ${selector} {`);
  assert.ok(at >= 0, `missing rule ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

test('the sticker sheet only starts open when it fits on the desk beside the page', () => {
  // 1440 and 1280 desktops: the page reaches within ~150px of the edge, so the sheet would cover it.
  assert.equal(sheetStartsOpen(null, 1440, 1300), false);
  assert.equal(sheetStartsOpen(null, 1024, 1004), false);
  assert.equal(sheetStartsOpen(null, 390, 390), false);
  assert.equal(sheetStartsOpen(null, 1920, 1540), true);
  assert.equal(sheetStartsOpen(null, 1800, 1800 - SHEET_DESK_SPACE), true);
  // An explicit choice always wins.
  assert.equal(sheetStartsOpen('open', 390, 390), true);
  assert.equal(sheetStartsOpen('closed', 2560, 1860), false);
});

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every manga spine keeps its title and author legible (4.5:1) and authors inherit the spine ink', async () => {
  const editorial = await readFile(new URL('../src/data/editorial.ts', import.meta.url), 'utf8');
  const pairs = [...editorial.matchAll(/spine: '(#[0-9a-f]{6})',\s*ink: '(#[0-9a-f]{6})'/gi)];
  assert.ok(pairs.length >= 6);
  for (const [, spine, ink] of pairs) {
    assert.ok(contrast(spine, ink) >= 4.5, `${ink} on ${spine} is ${contrast(spine, ink).toFixed(2)}:1`);
  }
  const small = rule('.book-spine small');
  assert.match(small, /color: inherit/);
  assert.doesNotMatch(small, /opacity/);
});

test('Japanese headings and short copy break between phrases, not mid-word', () => {
  const phrase = css.match(/:lang\(ja\)\s+:is\(([^)]*)\):not\(([^)]*)\)\s*\{\s*word-break: auto-phrase;/);
  assert.ok(phrase, 'missing the auto-phrase rule');
  assert.match(phrase[1], /h3[^)]*\.project-name/);
  // Narrow article titles and the 404 heading wrap normally: auto-phrase only added lines there.
  assert.match(phrase[2], /\.article-row h3/);
  assert.match(phrase[2], /\.not-found h1/);
});

test('manga spines shrink to fit the shelf; the open book keeps its cover width', () => {
  assert.match(rule('.book'), /flex: 0 1 var\(--spine-width\);/);
  assert.match(rule(".book[aria-expanded='true']"), /flex-shrink: 0;/);
});

test('an icon-only work image sits on the placeholder pattern at no more than its own size', async () => {
  const { isIconImage } = await import('../src/data/icon-image.mjs');
  assert.equal(isIconImage({ width: 256, height: 256 }), true);
  assert.equal(isIconImage({ width: 1200, height: 630 }), false);
  assert.equal(isIconImage(undefined), false);
  const previews = JSON.parse(await readFile(new URL('../src/data/previews.json', import.meta.url), 'utf8'));
  const foodmoji = previews['https://marketplace.visualstudio.com/items?itemName=cp20.foodmoji-vscode'];
  if (foodmoji?.width) assert.equal(isIconImage(foodmoji), true);
  assert.match(rule('.og-image.icon img'), /height: min\(var\(--icon-size\), \d+%\);/);
  assert.match(css, /\.og-image\.unavailable::after,\s*\.og-image\.icon::after \{/);
});

test('credits read as running text; only the cover list is laid out as items', async () => {
  assert.doesNotMatch(rule('.credits dd'), /display: flex|gap/);
  assert.match(rule('.credits .credits-list'), /display: flex/);
  const pages = await readFile(new URL('../src/pages.tsx', import.meta.url), 'utf8');
  assert.match(pages, /<dt>漫画の表紙<\/dt>\s*<dd class="credits-list">/);
});

test('binder holes are spaced to the sheet height so none is cut off', () => {
  const holes = rule('.site-body::before');
  assert.match(holes, /background-repeat: no-repeat space;/);
  assert.doesNotMatch(holes, /repeat-y/);
});

test('postmark dates sit on a paper band, and phone tab labels stay on one line', () => {
  assert.match(rule('.postmark-date'), /background: color-mix\(in srgb, var\(--page, var\(--paper\)\)/);
  assert.match(css, /\.rail nav a \{[^}]*white-space: nowrap;/);
  assert.match(css, /@media \(max-width: 430px\) \{\s*\.rail nav a > svg \{\s*display: none;/);
});
