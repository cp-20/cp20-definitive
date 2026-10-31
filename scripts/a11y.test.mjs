import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { focusAfterRemoval, stampAnnouncement, stampPlace } from '../src/data/stamp-a11y.mjs';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stamps = await source('src/components/Stamps.tsx');

test('keyboard sticker placement speaks where the sticker is and what happened', () => {
  assert.equal(stampPlace('history', ' 経歴\n'), '経歴の上');
  assert.equal(stampPlace('page', 'ページの見出しは使わない'), 'ページの余白の上');
  assert.equal(stampPlace('footer', ''), 'フッターの上');
  assert.equal(stampPlace('constructor', ''), 'ページの上');
  assert.ok(stampPlace('article-x', 'あ'.repeat(80)).length <= 42);
  assert.equal(stampAnnouncement('placed', 'ハート', 4), 'ハートを貼りました。残り4枚');
  assert.equal(stampAnnouncement('removed', 'ハート', 5), 'ハートをはがしました。残り5枚');
  assert.equal(stampAnnouncement('placed', 'ハート', -1), 'ハートを貼りました。残り0枚');
  assert.match(stampAnnouncement('blocked', 'いいね', 3), /^ここには貼れません/);
  assert.equal(stampAnnouncement('returned', 'いいね', 3), 'いいねをシール帳に戻しました');
});

test('peeling a sticker moves focus to the next of your stickers, then the previous one', () => {
  assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(focusAfterRemoval(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(focusAfterRemoval(['a'], 'a'), undefined);
  assert.equal(focusAfterRemoval(['a'], 'x'), undefined);
});

test('putting the sticker in hand down always goes through the focus-returning path', () => {
  // letGo hands focus back to the sheet sticker when the keyboard overlay held it.
  const letGo = stamps.slice(stamps.indexOf('function letGo('), stamps.indexOf('function returnHeld('));
  assert.match(letGo, /document\.activeElement === overlay/);
  assert.match(letGo, /\.focus\(/);
  for (const fn of ['returnHeld', 'cancelHeld', 'drop']) {
    const at = stamps.indexOf(`function ${fn}(`);
    const body = stamps.slice(at, stamps.indexOf('\n  }\n', at));
    assert.doesNotMatch(body, /setHeld\(null\)/, `${fn} must call letGo instead of setHeld(null)`);
    assert.match(body, /letGo\(|returnHeld\(/, `${fn} must release through letGo`);
  }
  assert.match(stamps, /function erase\([^)]*\) \{[^}]*focusPastDeleteButton\(target\)/s);
});

test('the placement overlay is an application with spoken feedback, and sheet stickers are not toggles', () => {
  const overlay = stamps.slice(
    stamps.indexOf('class="stamp-overlay"'),
    stamps.indexOf('onKeyDown={keyboard}'),
  );
  assert.match(overlay, /role="application"/);
  assert.match(overlay, /aria-roledescription="シールの配置"/);
  // The live region sits outside the sheet, which turns inert when closed.
  const live = stamps.indexOf('<p class="visually-hidden" role="status">');
  assert.ok(live > 0 && live < stamps.indexOf('class="sticker-sheet stamp-ui"'));
  const sticker = stamps.slice(
    stamps.indexOf('class="sheet-sticker"'),
    stamps.indexOf('onPointerDown', stamps.indexOf('class="sheet-sticker"')),
  );
  assert.doesNotMatch(sticker, /aria-pressed/);
  assert.match(sticker, /のシールを貼る/);
});

test('in-app links to a section focus that section instead of the page heading', async () => {
  const nav = await source('src/navigation.ts');
  assert.match(nav, /target && !restore && focusableTarget\(target\)/);
  const helper = nav.slice(
    nav.indexOf('function focusableTarget('),
    nav.indexOf('export function createNavigation'),
  );
  assert.match(helper, /querySelector<HTMLElement>\('h1, h2, h3, h4, h5, h6'\)/);
  // Natively focusable targets must keep their place in the tab order.
  assert.doesNotMatch(nav, /heading\.tabIndex = -1;\n\s*heading\.focus/);
});

test('focused controls scroll clear of the pinned sticker sheet and the phone tabs', async () => {
  const css = await source('src/styles/app.css');
  const html = css.slice(css.indexOf('  html {'), css.indexOf('}', css.indexOf('  html {')));
  assert.match(html, /scroll-padding-bottom: calc\(var\(--stamp-cover, 0px\) \+ 16px\)/);
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(phone.slice(0, 600), /scroll-padding-bottom: calc\(max\(var\(--stamp-cover, 0px\), 58px/);
  assert.match(stamps, /setProperty\('--stamp-cover'/);
});

test('turning the featured deck with the arrows is announced', async () => {
  const projects = await source('src/components/Projects.tsx');
  assert.match(projects, /<span class="visually-hidden" role="status">\s*\{spoken\(\)\}/);
  assert.match(projects, /setSpoken\(`0\$\{next \+ 1\} \/ 03 \$\{projects\[next\]\.title\}`\)/);
});
