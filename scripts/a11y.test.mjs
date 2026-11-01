import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OVER_SHEET, focusAfterRemoval, stampAnnouncement, stampPlace } from '../src/data/stamp-a11y.mjs';

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
  // Placing over the limit says which sticker it pushed off; a failed save says what came back.
  assert.equal(
    stampAnnouncement('placed', 'ハート', 0, 'クローバー'),
    'ハートを貼りました。一番古いクローバーをはがしました',
  );
  assert.equal(stampAnnouncement('failed', 'しーぴー', 0), '保存できませんでした。しーぴーを元に戻しました');
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
  // Only while aiming with the keys: a pointer is guided by the hint bar, read out as it appears.
  assert.match(overlay, /role=\{byKeys\(\) \? 'application' : undefined\}/);
  assert.match(overlay, /aria-roledescription=\{byKeys\(\) \? 'シールの配置'/);
  assert.match(overlay, /aria-hidden=\{byKeys\(\) \? undefined : 'true'\}/);
  assert.match(overlay, /tabindex=\{byKeys\(\) \? 0 : undefined\}/);
  const release = stamps.slice(stamps.indexOf('const release = '), stamps.indexOf('const aimHint = '));
  assert.match(release, /say\(`\$\{aimHint\(h\)\}/);
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
  assert.match(html, /--tabs-cover: 0px;\s*scroll-padding-bottom: calc\(var\(--tabs-cover\) \+ 16px\)/);
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(phone.slice(0, 600), /--tabs-cover: calc\(58px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(
    stamps,
    /setProperty\('scroll-padding-bottom', `calc\(max\(\$\{px\}px, var\(--tabs-cover\)\) \+ 16px\)`\)/,
  );
  assert.match(stamps, /const PHONE_LAYOUT = '\(max-width: 760px\)'/);
});

// Perf: a custom property written on <html> restyles every element of the page, so the
// measurements written on each load, sheet toggle and page turn must not go there.
test('measured sizes are not written as custom properties on <html>', async () => {
  const nav = await source('src/navigation.ts');
  for (const code of [stamps, nav]) {
    assert.doesNotMatch(code, /documentElement\.style\.setProperty\('--/);
    assert.doesNotMatch(code, /root\.setProperty\(`--/);
  }
  assert.match(nav, /::view-transition-\$\{part\}\(root\)\{/);
  const css = await source('src/styles/app.css');
  assert.ok(!css.includes('--stamp-cover'), 'the sheet cover is written inline, not as a custom property');
});

test('turning the featured deck with the arrows is announced', async () => {
  const projects = await source('src/components/Projects.tsx');
  assert.match(projects, /<span class="visually-hidden" role="status">\s*\{spoken\(\)\}/);
  assert.match(projects, /setSpoken\(`0\$\{next \+ 1\} \/ 03 \$\{projects\[next\]\.title\}`\)/);
});

test('focus follows the sheet when it opens, closes or its header swaps on sign-in and sign-out', () => {
  const toggle = stamps.slice(
    stamps.indexOf('function toggle('),
    stamps.indexOf('\n  }\n', stamps.indexOf('function toggle(')),
  );
  assert.match(toggle, /flush\(\);/);
  assert.match(toggle, /focusOnceShown\(next \? sheetStart\(\) \|\| sheetFocus\(\) : tab\)/);
  assert.match(stamps, /\[!!account\(\), signingIn\(\) \|\| restoring\(\)\]/);
});

test('spoken feedback reaches assistive technology even when the sheet is closed or locked', () => {
  const enqueue = stamps.slice(stamps.indexOf('function enqueue('), stamps.indexOf('function retryFailed('));
  // Said from outside the sheet whether it is open or not; the sheet line shows it without repeating it.
  assert.match(enqueue, /\.catch\([\s\S]*say\(stampAnnouncement\('failed'/);
  assert.doesNotMatch(enqueue, /if \(!open\(\)\)\s*say/);
  assert.match(stamps, /<span aria-hidden="true">\{failure\(\)\}<\/span>/);
  assert.match(stamps, /data-failed=\{failed\(\)\.length/);
  const ask = stamps.slice(
    stamps.indexOf('function askToSignIn('),
    stamps.indexOf('onSettled(', stamps.indexOf('function askToSignIn(')),
  );
  assert.match(ask, /say\(/);
  const aim = stamps.slice(stamps.indexOf('function aimWithKeys('), stamps.indexOf('function keyboard('));
  assert.match(aim, /placeSoon\(450\)/);
  assert.match(stamps, /function placeSoon\([^)]*\) \{[^}]*setTimeout\(announcePlace/);
  // Tabbing out of the placement overlay puts the sticker back, and the overlay says so.
  const overlay = stamps.slice(
    stamps.indexOf('class="stamp-overlay"'),
    stamps.indexOf('onPointerMove', stamps.indexOf('class="stamp-overlay"')),
  );
  assert.match(overlay, /EscapeかTabでやめる/);
  assert.match(overlay, /onFocusOut=[\s\S]*cancelHeld\(true\)/);
});

test('back and forward return focus to the followed link instead of the page heading', async () => {
  const navigation = await source('src/navigation.ts');
  assert.match(
    navigation,
    /cp20Focus: e\.detail === 0 \? \{ href: a\.href, n: linksTo\(a\.href\)\.indexOf\(a\) \}/,
  );
  assert.match(navigation, /\(restore && restoredFocus\(focusLink\)\)/);
  assert.match(navigation, /e\.state\?\.cp20Focus/);
});

test('text follows the browser default font size and the works deck can be pinched', async () => {
  const css = await source('src/styles/app.css');
  // px font sizes ignore a larger default size set in the browser; rem follows it.
  // (A px term inside a viewport-width calculation is a length, not a text size.)
  const fixed = css
    .split('\n')
    .filter((line) => /font-size:/.test(line) && /\d+px/.test(line.replace(/\([^()]*vw[^()]*\)/g, '')));
  assert.deepEqual(fixed, []);
  assert.match(css, /\.project-deck \{[^}]*touch-action: pan-y pinch-zoom;/);
  const projects = await source('src/components/Projects.tsx');
  assert.match(
    projects,
    /if \(e\.isPrimary\)[^\n]*\n\s*else swipeCancel\(\);/,
    'a second finger cancels the swipe',
  );
});

test('the sticker in hand over the sheet is announced as the sheet, and setting it down there says so', () => {
  assert.equal(OVER_SHEET, 'シール帳の上（ここには貼れません）');
  const announce = stamps.slice(
    stamps.indexOf('function announcePlace('),
    stamps.indexOf('function placeSoon('),
  );
  // Same order as drop(): the sheet is checked before the page under it.
  assert.ok(
    announce.indexOf('overSheetAt(') >= 0 && announce.indexOf('overSheetAt(') < announce.indexOf('placeAt('),
  );
  const drop = stamps.slice(stamps.indexOf('function drop('), stamps.indexOf('const overSheetAt'));
  const branch = drop.slice(drop.indexOf('if (overSheetAt('), drop.indexOf('hand.flyTo(slotCenter'));
  assert.match(branch, /say\(stampAnnouncement\('returned'/);
});

test('placing says where it went, and scrolling while aiming with the keys re-reads the place', () => {
  assert.equal(
    stampAnnouncement('placed', 'いいね', 4, undefined, 'traP Missionの上'),
    'いいねをtraP Missionの上に貼りました。残り4枚',
  );
  assert.equal(
    stampAnnouncement('placed', 'ハート', 0, 'クローバー', '経歴の上'),
    'ハートを経歴の上に貼りました。一番古いクローバーをはがしました',
  );
  const drop = stamps.slice(stamps.indexOf('function drop('), stamps.indexOf('const overSheetAt'));
  assert.match(drop, /const place = placeAt\(x, y\)/);
  assert.match(stamps, /addEventListener\('scroll', scrolled/);
  const scrolled = stamps.slice(
    stamps.indexOf('const scrolled = '),
    stamps.indexOf("addEventListener('scroll'"),
  );
  assert.match(scrolled, /placeSoon\(\)/);
});

test('peeling your last sticker or retrying a save keeps focus on the sheet and says the outcome', () => {
  const sheetFocus = stamps.slice(
    stamps.indexOf('function sheetFocus('),
    stamps.indexOf('function focusPastDeleteButton('),
  );
  assert.match(sheetFocus, /remainingWithout\(without\) < LIMIT/);
  assert.match(stamps, /\(next \|\| sheetFocus\(target\)\)/);
  const retry = stamps.slice(
    stamps.indexOf('function retryFailed('),
    stamps.indexOf('\n  }\n', stamps.indexOf('function retryFailed(')),
  );
  assert.ok(retry.indexOf("matches('.stamp-retry')") < retry.indexOf('setFailed([])'));
  assert.match(retry, /sheetFocus\(\)\?\.focus/);
  const retried = stamps.slice(stamps.indexOf('function retried('), stamps.indexOf('function retryFailed('));
  assert.match(retried, /if \(!op\.retry\) return/);
  assert.match(retried, /stampAnnouncement\('saved'/);
  assert.equal(stampAnnouncement('saved', 'いいね', 0), 'いいねを保存しました');
});
