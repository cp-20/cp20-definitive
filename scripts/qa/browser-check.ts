// Browser checks of the built site: what the unit tests cannot see. Start the production preview
// (`npx wrangler dev`, port 8787 by default) and run `node scripts/qa/browser-check.ts`; results and
// screenshots go to .qa/. Stickers run against firebase-mock.ts (a seeded Google sign-in and an
// in-memory database with the same ownership and throttle rules), never the real database.
import { chromium, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockFirebase, signInAs } from './firebase-mock.ts';

declare global {
  interface Window {
    __streams: Set<EventSource>;
    __marker?: string;
    __header?: Element | null;
    __pageClicks: number;
  }
}

const origin = process.env.CHECK_ORIGIN || 'http://127.0.0.1:8787';
const outputDir = process.env.CHECK_OUTPUT_DIR || '.qa';
const database = 'https://**.firebasedatabase.app/**';
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const db = await mockFirebase(context);
const user = await signInAs(context);
// Counts the open sticker streams, so a page left behind by navigation shows up.
await context.addInitScript(() => {
  window.__streams = new Set();
  const Base = window.EventSource;
  window.EventSource = class extends Base {
    constructor(...args: ConstructorParameters<typeof EventSource>) {
      super(...args);
      window.__streams.add(this);
    }
    close() {
      window.__streams.delete(this);
      super.close();
    }
  };
});
const page = await context.newPage();
const errors: string[] = [],
  externalImages: string[] = [],
  documents: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  const url = new URL(r.url());
  if (r.resourceType() === 'image' && url.origin !== origin && url.hostname !== 'www.gravatar.com')
    externalImages.push(r.url());
  if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(r.url());
});
const report = {
  checks: [] as string[],
  accessibility: [] as { label: string; violations: { id: string; nodes: unknown[] }[] }[],
  errors,
  externalImages,
};
const passed = (what: string) => {
  report.checks.push(what);
  console.log('ok:', what);
};
const settle = async (tab: Page = page) => {
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(300);
};
async function axe(label: string, tab: Page = page) {
  const result = await new AxeBuilder({ page: tab }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  report.accessibility.push({
    label,
    violations: result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
}
const saved = (tab: Page) =>
  expect(tab.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
const openSheet = async (tab: Page) => {
  if (!(await tab.locator('.sticker-sheet').isVisible())) await tab.locator('.sticker-tab').click();
};
// Another visitor's stickers on `page`, at fractions of the page anchor.
const othersAt = (targets: { x: number; y: number }[]) => ({
  avatar: 'b'.repeat(64),
  stamps: Object.fromEntries(
    targets.map((t, i) => [i, { anchor: 'page', ...t, kind: 1, angle: 0, createdAt: 1700000000000 + i }]),
  ),
});
let visitorContext: BrowserContext | undefined,
  guestContext: BrowserContext | undefined,
  release = () => {};

try {
  // ── Every page: status, accessibility, local images only, no sideways scroll ──
  for (const path of ['/', '/articles', '/works', '/works/minna-no-monosashi', '/about', '/colophon']) {
    const response = await page.goto(origin + path);
    await settle();
    if (response?.status() !== (path === '/colophon' ? 404 : 200)) throw Error(`Status ${path}`);
    await axe(path);
    await page.locator('img[loading=lazy]').evaluateAll((imgs: HTMLImageElement[]) => {
      for (const i of imgs) i.loading = 'eager';
    });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const broken = await page
      .locator('img')
      .evaluateAll((imgs: HTMLImageElement[]) =>
        imgs
          .filter((i) => !i.naturalWidth && getComputedStyle(i).visibility !== 'hidden')
          .map((i) => i.getAttribute('src')),
      );
    if (broken.length) throw Error(`Broken local images: ${broken}`);
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/articles', '/works', '/works/dice-spec-v2', '/about']) {
      await page.goto(origin + path);
      await settle();
      if ((await page.evaluate(() => document.documentElement.scrollWidth)) > width)
        throw Error(`Overflow ${path} at ${width}`);
    }
  }
  passed('pages load with no axe violations, broken or remote images, or sideways scroll at 320-1440px');

  // ── In-app navigation ──
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/');
  await settle();
  const navigationBefore = documents.length;
  await page.evaluate(() => {
    window.__marker = 'persistent-document';
    window.__header = document.querySelector('.site-header');
  });
  await page.locator('.rail nav a[href="/works"]').click();
  await expect(page.locator('main h1')).toContainText('作品一覧');
  await page.locator('h2 a[href="/works/minna-no-monosashi"]').click();
  await expect(page.locator('main h1')).toHaveText('みんなのものさし');
  await page.goBack();
  await expect(page.locator('main h1')).toContainText('作品一覧');
  await page.goForward();
  await expect(page.locator('main h1')).toHaveText('みんなのものさし');
  await page.locator('.rail nav a[href="/articles"]').click();
  await page.getByRole('button', { name: /^zenn.dev/ }).click();
  // Filtering hides rows instead of rebuilding the list, so only the rows shown are counted.
  const zenn = await page.locator('[data-article]:not([hidden])').count();
  await page.locator('#article-sort').selectOption('oldest');
  const dates = await page
    .locator('[data-article]:not([hidden])')
    .evaluateAll((rows: HTMLElement[]) => rows.map((r) => r.dataset.date));
  if (dates.join() !== [...dates].sort().join()) throw Error('Sort order');
  // Focusing the controls may have started a smooth scroll; let it finish before scrolling.
  await page.waitForFunction(
    () =>
      new Promise((done) => {
        const y = scrollY;
        setTimeout(() => done(scrollY === y), 150);
      }),
  );
  await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const scroll = await page.evaluate(() => scrollY);
  await page.locator('.rail nav a[href="/about"]').click();
  await expect(page.locator('main h1')).toContainText('しーぴー');
  await page.goBack();
  await expect(page.locator('[data-article]:not([hidden])')).toHaveCount(zenn);
  await expect(page.locator('#article-sort')).toHaveValue('oldest');
  if (Math.abs((await page.evaluate(() => scrollY)) - scroll) > 2) throw Error('Back scroll restoration');
  if (
    documents.length !== navigationBefore ||
    !(await page.evaluate(
      () =>
        window.__marker === 'persistent-document' &&
        window.__header === document.querySelector('.site-header'),
    ))
  )
    throw Error('Navigation replaced the document or shell');
  await page.locator('.rail nav a[href="/"]').click();
  await page.locator('.home-favorites a[href="/about#music"]').click();
  await expect(page).toHaveURL(/about#music$/);
  await expect
    .poll(async () => Math.abs((await page.locator('#music').boundingBox())!.y - 24), { timeout: 3000 })
    .toBeLessThan(3);
  await page.waitForTimeout(350);
  if ((await page.evaluate(() => window.__streams.size)) !== 1)
    throw Error('Stale Firebase subscription after navigation');
  // Reloading, and coming back from another document, return to where the visitor was.
  {
    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await other.route(/firebasedatabase\.app|googleapis\.com/, (route) => route.abort());
    const tab = await other.newPage();
    await tab.goto(origin + '/articles');
    await tab.evaluate(() => scrollTo({ top: 2500, behavior: 'instant' }));
    await tab.waitForTimeout(200);
    await tab.reload();
    await tab.waitForTimeout(800);
    if (Math.abs((await tab.evaluate(() => scrollY)) - 2500) > 2) throw Error('Reload scroll restoration');
    await tab.goto(origin + '/feed.xml');
    await tab.goBack();
    await tab.waitForTimeout(800);
    if (Math.abs((await tab.evaluate(() => scrollY)) - 2500) > 2) throw Error('Cross-document back scroll');
    await other.close();
  }
  // The credits dialog: Esc and a click on the backdrop close it, and focus goes back to its button.
  await page.goto(origin + '/');
  const creditsButton = page.locator('.credits-open');
  await creditsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#credits')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#credits')).toBeHidden();
  await expect(creditsButton).toBeFocused();
  // Back with a dialog open closes it along with the page it was opened on.
  await page.locator('a[href="/about"]').first().click();
  await expect(page).toHaveURL(origin + '/about');
  await page.locator('.credits-open').click();
  await expect(page.locator('#credits')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(origin + '/');
  await expect(page.locator('#credits')).toBeHidden();
  if ((await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) === 'hidden')
    throw Error('Scroll lock left after back closed the credits');
  await page.goto(origin + '/about');
  await page.locator('.timeline-item h3 button').first().click();
  await expect(page.locator('#milestone-0')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator('#milestone-0')).toBeHidden();
  // Back returns focus to the link the keyboard followed.
  await page.goto(origin + '/works');
  const lastWork = page.locator('main a[href^="/works/"]:not([tabindex="-1"])').last();
  await lastWork.focus();
  const lastHref = await lastWork.getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(origin + lastHref);
  await page.goBack();
  await expect(lastWork).toBeFocused();
  passed(
    'navigation keeps the document and header; back/forward, reloads and other documents restore scroll, filters and focus; one sticker stream',
  );

  // ── Stickers with a mouse ──
  await page.goto(origin + '/');
  await settle();
  visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockFirebase(visitorContext, { db });
  await signInAs(visitorContext, { uid: 'mock-visitor', email: 'visitor2@example.com' });
  const visitor = await visitorContext.newPage();
  await visitor.goto(origin + '/');
  // Without a Google sign-in, stickers can be seen but not placed.
  guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await mockFirebase(guestContext, { db });
  const guest = await guestContext.newPage();
  await guest.goto(origin + '/');
  // At 1440px the sheet starts as the closed tab so it never covers the page (sheet-start.ts).
  await expect(guest.locator('.sticker-sheet')).toBeHidden();
  await guest.locator('.sticker-tab').click();
  await expect(guest.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  await guest.getByRole('button', { name: /^クローバー/ }).click();
  await expect(guest.locator('.stamp-overlay')).toHaveCount(0);
  await page.locator('.sticker-tab').click();
  await expect(page.locator('.account-avatar img')).toHaveAttribute(
    'src',
    /gravatar\.com\/avatar\/[0-9a-f]{64}/,
  );
  await axe('/#sticker-sheet');
  // The sticker shows before the save answers.
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held = false;
  const hold = async (route: Route) => {
    if (route.request().method() === 'PATCH' && !held) {
      held = true;
      await gate;
    }
    await route.fallback();
  };
  await page.route(database, hold);
  await page.getByRole('button', { name: 'しーぴーのシールを貼る', exact: true }).click();
  const anchor = (await page.locator('[data-stamp-anchor=intro]').boundingBox())!;
  await page.mouse.click(anchor.x + anchor.width * 0.6, anchor.y + anchor.height * 0.45);
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  release();
  await saved(page);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await page.unroute(database, hold);
  const own = page.locator(`[data-stamp-id^="${user.uid}-"]`);
  await expect(own).toHaveCount(1);
  if (!/^[0-9a-f]{64}$/.test(db.pages.get('home')?.[user.uid].avatar ?? ''))
    throw Error('Gravatar hash not saved');
  await expect(visitor.locator(`[data-stamp-id="${await own.getAttribute('data-stamp-id')}"]`)).toBeVisible();
  // It stays on the same spot of its anchor at any width.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    const box = (await own.boundingBox())!,
      target = (await page.locator('[data-stamp-anchor=intro]').boundingBox())!;
    if (
      Math.abs(box.x + box.width / 2 - target.x - target.width * 0.6) > 2 ||
      Math.abs(box.y + box.height / 2 - target.y - target.height * 0.45) > 2
    )
      throw Error('Responsive stamp anchor');
  }
  // Hovering shows who placed it; a click opens its menu, and moving it from there lifts it for
  // the next click to put down elsewhere.
  const placed = (await own.boundingBox())!;
  const spot = { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 };
  const menu = page.locator('.stamp-menu');
  await page.mouse.move(spot.x + 120, spot.y + 120);
  await page.mouse.move(spot.x, spot.y, { steps: 4 });
  await expect(page.locator('.sticker-avatar')).toHaveAttribute('src', /gravatar\.com\/avatar\/[0-9a-f]{64}/);
  await page.mouse.click(spot.x, spot.y);
  await expect(menu).toBeVisible();
  await expect(own.locator('.stamp-open')).toHaveAttribute('aria-expanded', 'true');
  // A second click on the sticker closes it again.
  await page.mouse.click(spot.x, spot.y);
  await expect(menu).toHaveCount(0);
  await page.mouse.click(spot.x, spot.y);
  await menu.getByRole('button', { name: '動かす' }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.placed-stamp[data-lifted]')).toHaveCount(1);
  await page.mouse.move(spot.x - 120, spot.y + 40, { steps: 6 });
  await page.mouse.click(spot.x - 120, spot.y + 40);
  await saved(page);
  const landed = (await own.boundingBox())!;
  if (
    Math.abs(landed.x + landed.width / 2 - spot.x + 120) > 1 ||
    Math.abs(landed.y + landed.height / 2 - spot.y - 40) > 1
  )
    throw Error('Lifted sticker placement');
  const movedId = await own.getAttribute('data-stamp-id');
  await expect(visitor.locator(`[data-stamp-id="${movedId}"]`)).toBeVisible();
  // Saved stickers come back after a reload, and the menu peels one at once.
  await page.reload();
  await expect(own).toHaveCount(1, { timeout: 10000 });
  await own.click();
  await menu.getByRole('button', { name: 'はがす' }).click();
  await expect(own).toHaveCount(0);
  await saved(page);
  await expect(visitor.locator(`[data-stamp-id="${movedId}"]`)).toHaveCount(0);
  // Undo peels the last one placed.
  await openSheet(page);
  await page.getByRole('button', { name: 'クローバーのシールを貼る', exact: true }).click();
  await page.mouse.click(500, 195);
  await saved(page);
  await expect(own).toHaveCount(1);
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(own).toHaveCount(0);
  await saved(page);
  passed(
    'signed-out visitors cannot place; placing shows at once, saves the Gravatar hash, syncs live and keeps its anchor; hover shows the avatar; the menu moves and peels; reload and undo',
  );

  // ── Stickers by touch ──
  await visitor.locator('.sticker-tab').tap();
  await visitor.getByRole('button', { name: 'ハートのシールを貼る', exact: true }).tap();
  await visitor.touchscreen.tap(160, 190);
  await expect(visitor.locator('[data-pending=true]')).toHaveCount(1);
  await saved(visitor);
  // A swipe that starts on your own sticker scrolls the page and leaves the sticker where it was.
  const writesBefore = db.writes;
  const cdp = await visitorContext.newCDPSession(visitor);
  const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 160, y }] });
  await finger('touchStart', 190);
  for (let y = 170; y >= 10; y -= 20) await finger('touchMove', y);
  // Rest before lifting the finger, so no fling keeps the page moving afterwards.
  await visitor.waitForTimeout(300);
  await finger('touchEnd');
  await expect.poll(() => visitor.evaluate(() => scrollY)).toBeGreaterThan(100);
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(0);
  await visitor.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => visitor.evaluate(() => scrollY)).toBe(0);
  // A tap opens its menu, with buttons a fingertip can hit; a tap elsewhere only closes it, and
  // so does scrolling.
  await visitor.evaluate(() => {
    window.__pageClicks = 0;
    document.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('.stamp-ui, .placed-stamp, .stamp-overlay')) window.__pageClicks++;
    });
  });
  const touchMenu = visitor.locator('.stamp-menu');
  await visitor.touchscreen.tap(160, 190);
  await expect(touchMenu).toBeVisible();
  for (const size of await touchMenu
    .locator('button')
    .evaluateAll((els) => els.map((e) => [e.clientWidth, e.clientHeight])))
    if (Math.min(...size) < 44) throw Error(`Sticker menu button ${size} smaller than 44px`);
  await visitor.touchscreen.tap(300, 420);
  await expect(touchMenu).toHaveCount(0);
  await visitor.touchscreen.tap(160, 190);
  await expect(touchMenu).toBeVisible();
  await visitor.evaluate(() => scrollBy({ top: 30, behavior: 'instant' }));
  await expect(touchMenu).toHaveCount(0);
  await visitor.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => visitor.evaluate(() => scrollY)).toBe(0);
  // Moving it from the menu floats it above where it lay; a tap on it puts it back.
  await visitor.touchscreen.tap(160, 190);
  await touchMenu.getByRole('button', { name: '動かす' }).tap();
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(1);
  await visitor.waitForTimeout(400);
  const floating = (await visitor.locator('.sticker-ghost').boundingBox())!;
  if (floating.y + floating.height > 190 - 23)
    throw Error('A sticker moved by touch does not float clear of it');
  await visitor.touchscreen.tap(floating.x + floating.width / 2, floating.y + floating.height / 2);
  await expect(visitor.locator('.stamp-overlay')).toHaveCount(0);
  await visitor.waitForTimeout(700);
  if (await visitor.evaluate(() => window.__pageClicks))
    throw Error('Closing the menu or putting a sticker back clicked the page');
  if (db.writes !== writesBefore) throw Error('A swipe or a put-back sticker was saved');
  // Held still, it can be dragged, riding above the finger, and lands where it was seen.
  await finger('touchStart', 190);
  await visitor.waitForTimeout(500);
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 160 + i * 10, y: 190 + i * 30 }],
    });
  await visitor.waitForTimeout(300);
  const riding = (await visitor.locator('.sticker-ghost').boundingBox())!;
  if (riding.y + riding.height > 370 - 10) throw Error('A dragged sticker is hidden under the finger');
  await finger('touchEnd');
  await saved(visitor);
  const dragged = (await visitor.locator('.placed-stamp[data-owned]').boundingBox())!;
  if (
    Math.abs(dragged.x + 23 - riding.x - riding.width / 2) > 2 ||
    Math.abs(dragged.y + 23 - riding.y - riding.height / 2) > 2
  )
    throw Error('A dragged sticker did not land where it was shown');
  // A long press let go without moving opens the menu too; peeling from it saves.
  const writesBeforePress = db.writes;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: dragged.x + 23, y: dragged.y + 23 }],
  });
  await visitor.waitForTimeout(500);
  await finger('touchEnd');
  await expect(touchMenu).toBeVisible();
  if (db.writes !== writesBeforePress) throw Error('A long press without moving was saved');
  await touchMenu.getByRole('button', { name: 'はがす' }).tap();
  await expect(visitor.locator('.placed-stamp')).toHaveCount(0);
  await saved(visitor);
  await expect.poll(() => Object.keys(db.pages.get('home') || {}).length).toBe(0);
  passed(
    'touch: tap to place, swipes over your sticker scroll; its menu (44px, closed by a tap elsewhere or a scroll) moves and peels; a drag rides above the finger; put back without clicking',
  );

  // ── Five stickers, and two tabs at once ──
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/about');
  await settle();
  const second = await context.newPage();
  await second.goto(origin + '/about');
  const stick = async (tab: Page, fx: number) => {
    await openSheet(tab);
    const box = (await tab.locator('[data-stamp-anchor=profile]').boundingBox())!;
    await tab.getByRole('button', { name: 'しーぴーのシールを貼る', exact: true }).click();
    await tab.mouse.click(box.x + box.width * fx, box.y + Math.min(box.height, 400) * 0.5);
  };
  for (const fx of [0.1, 0.25, 0.4, 0.55, 0.7]) await stick(page, fx);
  await saved(page);
  const five = () => db.pages.get('about')?.[user.uid]?.stamps || {};
  const beforeMove = structuredClone(five());
  if (Object.keys(beforeMove).length !== 5) throw Error('Five stickers not saved');
  const lift = (await page.locator(`[data-stamp-id="${user.uid}-3"]`).boundingBox())!;
  // Dragged with the mouse this time.
  await page.mouse.move(lift.x + lift.width / 2, lift.y + lift.height / 2);
  await page.mouse.down();
  await page.mouse.move(lift.x + 40, lift.y + 140, { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await saved(page);
  await expect(page.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(5);
  const afterMove = five() as Record<string, { y: number; createdAt: number }>;
  const was = beforeMove as typeof afterMove;
  if (
    ['0', '1', '2', '4'].some((slot) => JSON.stringify(afterMove[slot]) !== JSON.stringify(was[slot])) ||
    afterMove[3].createdAt !== was[3].createdAt ||
    afterMove[3].y === was[3].y
  )
    throw Error('Moving one of five stickers changed the others');
  db.pages.delete('about');
  await expect(page.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(0);
  // A save the database refuses (the other tab wrote first) is undone and said in that tab.
  await Promise.all([stick(page, 0.3), stick(second, 0.6)]);
  for (const tab of [page, second]) await saved(tab);
  const kept = Object.keys(five()).length;
  let refused = 0;
  for (const tab of [page, second])
    refused += await tab.locator('.stamp-status', { hasText: '保存できませんでした' }).count();
  if (kept < 1 || kept + refused !== 2) throw Error(`Concurrent tabs: ${kept} saved, ${refused} refused`);
  for (const tab of [page, second])
    await expect(tab.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(kept);
  await second.close();
  db.pages.delete('about');
  passed(
    'moving one of five stickers keeps the others; of two tabs placing at once, the refused one is undone',
  );

  // ── Other visitors' stickers never take the pointer or cover the index tabs ──
  // The tab in front (a Ctrl+click from a tab behind it opens no new tab).
  await page.bringToFront();
  await page.goto(origin + '/articles');
  await settle();
  const targets = await page.evaluate(() => {
    const body = document.querySelector('[data-stamp-anchor=page]')!.getBoundingClientRect();
    const at = (el: Element | null, fx = 0.5) => {
      const r = el!.getBoundingClientRect();
      return {
        x: (r.left + r.width * fx - body.left) / body.width,
        y: (r.top + 30 - body.top) / body.height,
      };
    };
    return [
      at(document.querySelector('#article-sort')),
      at(document.querySelector('.site-header a[href="/"]')),
      { ...at(document.querySelector('.rail nav a')), x: 1 },
    ];
  });
  db.pages.set('articles', { 'other-visitor': othersAt(targets) });
  await expect(page.locator('.placed-stamp')).toHaveCount(3);
  const rail = (await page.locator('.rail').boundingBox())!,
    onTab = (await page.locator('.placed-stamp').nth(2).boundingBox())!;
  if (onTab.x + onTab.width > rail.x) throw Error("Another visitor's sticker drawn over the index tabs");
  const logo = (await page.locator('.placed-stamp').nth(1).boundingBox())!;
  await page.mouse.move(logo.x + 23, logo.y + 23, { steps: 3 });
  await expect(page.locator('.sticker-avatar')).toHaveCount(1);
  // Headless Chromium opens no tab for a Ctrl+click, so the check is that the click reached the
  // link under the sticker (its default is cancelled here) and the page stayed.
  await page.evaluate(() =>
    document.querySelector('.site-header a[href="/"]')!.addEventListener(
      'click',
      (e) => {
        if ((e as MouseEvent).ctrlKey) (window as any).__ctrlHit = true;
        e.preventDefault();
      },
      { once: true },
    ),
  );
  await page.keyboard.down('Control');
  await page.mouse.click(logo.x + 23, logo.y + 23);
  await page.keyboard.up('Control');
  if (!(await page.evaluate(() => (window as any).__ctrlHit)))
    throw Error('Ctrl+click under a sticker did not reach the link');
  if (new URL(page.url()).pathname !== '/articles') throw Error('Ctrl+click under a sticker left the page');
  const sort = (await page.locator('.placed-stamp').nth(0).boundingBox())!;
  await page.mouse.click(sort.x + 23, sort.y + 23);
  await expect(page.locator('#article-sort')).toBeFocused();
  await page.keyboard.press('Escape');
  db.pages.delete('articles');
  await expect(page.locator('.placed-stamp')).toHaveCount(0);
  passed(
    "other visitors' stickers pass clicks and modifier clicks through, keep off the index tabs, and show their avatar",
  );

  // ── Filtering moves the cards, and their stickers with them ──
  await page.goto(origin + '/articles');
  await settle();
  const source = 'trap.jp';
  // The first card of `source` that is not first in the list, so filtering moves it.
  const filtered = await page.evaluate((source) => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-article]')];
    return rows.find(
      (r, i) => i > 0 && r.querySelector('.article-meta .visually-hidden')!.textContent === source,
    )!.dataset.stampAnchor!;
  }, source);
  db.pages.set('articles', {
    'other-visitor': {
      avatar: 'b'.repeat(64),
      stamps: { 0: { anchor: filtered, x: 0.3, y: 0.3, kind: 1, angle: 0, createdAt: 1700000000000 } },
    },
  });
  await expect(page.locator('.placed-stamp')).toHaveCount(1);
  const glide = page.evaluate(
    (anchor) =>
      new Promise<{ animated: boolean; moved: number; drift: number; shifts: number }>((resolve) => {
        const card = document.querySelector<HTMLElement>(`[data-stamp-anchor="${anchor}"]`)!;
        const offset = () => {
          const a = document.querySelector('.placed-stamp')!.getBoundingClientRect(),
            b = card.getBoundingClientRect();
          return [a.left - b.left, a.top - b.top, b.top];
        };
        const [x0, y0, top0] = offset();
        let animated = false,
          drift = 0,
          shifts = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean })[])
            if (!e.hadRecentInput) shifts++;
        }).observe({ type: 'layout-shift' });
        const t0 = performance.now();
        const step = () => {
          animated ||= card.getAnimations().length > 0;
          const [x, y] = offset();
          drift = Math.max(drift, Math.abs(x - x0), Math.abs(y - y0));
          if (performance.now() - t0 < 700) requestAnimationFrame(step);
          else resolve({ animated, moved: Math.abs(offset()[2] - top0), drift, shifts });
        };
        requestAnimationFrame(step);
      }),
    filtered,
  );
  await page.locator('.source-chip', { hasText: source }).click();
  const result = await glide;
  if (!result.animated || result.moved < 10)
    throw Error(`Filtering did not glide the card: ${JSON.stringify(result)}`);
  if (result.drift > 2) throw Error(`A sticker fell behind its moving card by ${result.drift}px`);
  if (result.shifts) throw Error('Filtering shifted the layout');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.source-chip').first().click();
  const scripted = () =>
    document
      .querySelector('.article-list')!
      .getAnimations({ subtree: true })
      .filter((a) => !(a instanceof CSSTransition || a instanceof CSSAnimation)).length;
  if (await page.evaluate(scripted)) throw Error('Filtering animated with reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  db.pages.delete('articles');
  await expect(page.locator('.placed-stamp')).toHaveCount(0);
  passed(
    'filtering glides the cards, keeps stickers on them and shifts nothing; reduced motion switches at once',
  );

  // ── The keyboard, and saves that fail ──
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  await page.locator('[data-project-tab="1"]').click();
  if (
    (await page
      .locator('#project-1 .featured-image')
      .evaluate((el) => getComputedStyle(el).animationName)) !== 'none'
  )
    throw Error('Reduced motion');
  const outage = async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test outage"}' });
  };
  await page.route(database, outage);
  const clover = page.getByRole('button', { name: 'クローバーのシールを貼る', exact: true });
  const spoken = page.locator('p.visually-hidden[role=status]');
  // Escape puts the sticker back and focus returns to the sheet sticker it came from.
  await clover.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-overlay')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(clover).toBeFocused();
  // Aiming at the desk outside the page is announced as a spot where nothing can go.
  await page.keyboard.press('Enter');
  for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft');
  await expect(spoken).toHaveText('ここには貼れません');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(clover).toBeFocused();
  await expect(spoken).toHaveText(/^クローバーを(?:.+の上に)?貼りました。残り\d枚$/);
  // A save that fails is undone at once and said; the next one saves.
  await expect(page.locator('.stamp-status')).toContainText('保存できませんでした', { timeout: 20000 });
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await expect(spoken).toHaveText('保存できませんでした。クローバーを元に戻しました');
  await page.unroute(database, outage);
  const writesAfterOutage = db.writes;
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(() => db.writes - writesAfterOutage, { timeout: 20000 }).toBe(1);
  await expect(page.locator('.stamp-status')).not.toContainText('保存できませんでした');
  // The keys open a sticker's menu (Escape returns to the sticker) and move it from there.
  await saved(page);
  const opener = own.locator('.stamp-open');
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-menu').getByRole('button', { name: '動かす' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stamp-menu')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-overlay')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(own.locator('.stamp-open')).toBeFocused();
  await saved(page);
  // A peel that fails brings the sticker back.
  await page.route(database, outage);
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(page.locator('.stamp-status')).toContainText('保存できませんでした', { timeout: 20000 });
  await expect(own).toHaveCount(1);
  await page.unroute(database, outage);
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(own).toHaveCount(0);
  await saved(page);
  await page.emulateMedia({ reducedMotion: null });
  passed(
    'keyboard placement with focus return and spoken results; failed saves and peels are undone and said; reduced motion',
  );

  // ── Without JavaScript every article and the featured works are there ──
  await page.goto(origin + '/articles');
  const allArticles = await page.locator('[data-article]:not([hidden])').count();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto(origin + '/articles');
  await expect(plain.locator('[data-article]')).toHaveCount(allArticles);
  await plain.goto(origin + '/');
  await expect(plain.locator('noscript a')).toHaveCount(3);
  await nojs.close();
  passed('complete static content without JavaScript');

  // ── Every `sizes` is at least the width its image is laid out at (src/components/Preview.tsx) ──
  await page.goto(origin + '/works');
  const workPage = (await page.locator('a[href^="/works/"]').first().getAttribute('href'))!;
  for (const width of [360, 380, 450, 600, 760, 761, 900, 901, 1100, 1101, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/', '/works', '/about', workPage]) {
      await page.goto(origin + route);
      const short = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('img[sizes]')].flatMap((img) => {
          const sizes = img.getAttribute('sizes')!;
          const [, , slot] =
            sizes
              .split(/,\s*(?![^()]*\))/)
              .map((part) => part.match(/^(\(.+?\))\s+(.+)$/) || [, , part])
              .find(([, query]) => !query || matchMedia(query).matches) || [];
          const probe = document.body.appendChild(document.createElement('div'));
          probe.style.width = slot ?? '';
          const room = probe.getBoundingClientRect().width;
          probe.remove();
          return img.offsetWidth > room + 0.5 ? [`${sizes}: ${img.offsetWidth} > ${room}`] : [];
        }),
      );
      if (short.length)
        throw Error(`sizes below the rendered width at ${width}px ${route}: ${short.join('; ')}`);
    }
  }
  passed('no image is laid out wider than its sizes promise, at 360-1920px');

  // ── Pages swapped out and rows filtered away are released ──
  // After a warm-up lap the DOM node count (after GC) stays flat. Chromium kept every
  // client-rendered srcset image, and with it its whole page (see responsive() in Preview.tsx).
  {
    const leak = await context.newPage();
    const session = await context.newCDPSession(leak);
    await session.send('Performance.enable');
    const nodes = async () => {
      for (let i = 0; i < 3; i++) await session.send('HeapProfiler.collectGarbage');
      const { metrics } = await session.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'Nodes')!.value;
    };
    const follow = async (href: string) => {
      await leak.evaluate((href) => {
        const a = Object.assign(document.createElement('a'), { href });
        document.querySelector('main')!.append(a);
        a.click();
        a.remove();
      }, href);
      await leak.waitForTimeout(250);
    };
    const lap = async () => {
      for (const href of ['/works', '/about', '/articles', '/works/dice-spec-v2', '/']) await follow(href);
      await follow('/articles');
      for (let i = 0; i < 6; i++)
        await leak
          .locator('.source-chip')
          .nth(i % 2 ? 0 : 1)
          .click();
      await leak.locator('#article-sort').selectOption('oldest');
      await leak.locator('#article-sort').selectOption('newest');
      await follow('/');
    };
    await leak.goto(origin + '/');
    await lap();
    const warm = await nodes();
    await lap();
    await lap();
    const after = await nodes();
    if (after > warm + 100) throw Error(`Detached pages kept in memory: ${warm} → ${after} DOM nodes`);
    await leak.close();
  }
  passed('swapped-out pages and filtered rows are released from memory');

  for (const [width, height, suffix] of [
    [390, 844, 'mobile'],
    [1440, 1000, 'desktop'],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const route of ['/', '/articles', '/about']) {
      await page.goto(origin + route);
      await settle();
      if (width === 390) await axe(`${route}?mobile`);
      const name = route === '/' ? 'home' : route.slice(1);
      await page.screenshot({ path: `${outputDir}/${name}-${suffix}.png`, fullPage: route !== '/articles' });
    }
  }
  const violations = report.accessibility.flatMap((p) => p.violations);
  if (errors.length || externalImages.length || violations.length)
    throw Error(
      `Browser check failed: ${errors.length} exceptions / ${externalImages.length} remote images / ${violations.length} axe violations`,
    );
  console.log(
    `Browser check passed: ${report.checks.length} groups, ${report.accessibility.length} axe runs`,
  );
} finally {
  release();
  await writeFile(`${outputDir}/browser-check.json`, JSON.stringify(report, null, 2));
  await visitorContext?.close();
  await guestContext?.close();
  await browser.close();
}
