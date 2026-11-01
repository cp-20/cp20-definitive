import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockFirebase, signInAs } from './firebase-mock.mjs';
const origin = process.env.CHECK_ORIGIN || 'http://127.0.0.1:8787';
const outputDir = process.env.CHECK_OUTPUT_DIR || '.qa';
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
// Stickers run against an in-memory database with a seeded Google sign-in (see firebase-mock.mjs).
const db = await mockFirebase(context);
const user = await signInAs(context);
await context.addInitScript(() => {
  window.__streams = new Set();
  const Base = window.EventSource;
  window.EventSource = class extends Base {
    constructor(...args) {
      super(...args);
      window.__streams.add(this);
    }
    close() {
      window.__streams.delete(this);
      super.close();
    }
  };
});
const page = await context.newPage(),
  errors = [],
  externalImages = [],
  documents = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  const url = new URL(r.url());
  if (r.resourceType() === 'image' && url.origin !== origin && url.hostname !== 'www.gravatar.com')
    externalImages.push(r.url());
  if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(r.url());
});
const report = {
  pages: [],
  viewports: [],
  layout: [],
  interactions: [],
  errors,
  externalImageRequests: externalImages,
};
let visitorContext,
  guestContext,
  visitor,
  releaseWrite = () => {};
const settle = async () => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
};
async function axe(label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  report.pages.push({
    label,
    violations: result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
  console.log('Accessibility:', label);
}
async function beginLayout(selector) {
  await page.evaluate((selector) => {
    window.__layout = {
      shifts: [],
      start: [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
      frames: [],
    };
    window.__observer = new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => window.__layout.shifts.push(e.value)),
    );
    window.__observer.observe({ type: 'layout-shift' });
    const until = performance.now() + 450;
    const tick = () => {
      window.__layout.frames.push(
        [...document.querySelectorAll(selector)].map((el) => {
          const r = el.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      );
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, selector);
}
async function endLayout(label) {
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    window.__observer.disconnect();
    const { start, frames, shifts } = window.__layout;
    let max = 0;
    for (const frame of frames)
      for (let i = 0; i < Math.min(frame.length, start.length); i++)
        for (let j = 0; j < 4; j++) max = Math.max(max, Math.abs(frame[i][j] - start[i][j]));
    return { maxMovementPx: max, rawLayoutShift: shifts.reduce((a, b) => a + b, 0) };
  });
  report.layout.push({ label, ...result });
  if (result.maxMovementPx > 0.1 || result.rawLayoutShift > 0)
    throw Error(`Layout moved: ${label}: ${JSON.stringify(result)}`);
}
try {
  for (const path of ['/', '/articles', '/works', '/works/minna-no-monosashi', '/about', '/colophon']) {
    const response = await page.goto(origin + path);
    await settle();
    if (response.status() !== (path === '/colophon' ? 404 : 200)) throw Error(`Status ${path}`);
    await axe(path);
    await page.locator('img[loading=lazy]').evaluateAll((imgs) => imgs.forEach((i) => (i.loading = 'eager')));
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const broken = await page
      .locator('img')
      .evaluateAll((imgs) =>
        imgs
          .filter((i) => !i.naturalWidth && getComputedStyle(i).visibility !== 'hidden')
          .map((i) => i.getAttribute('src')),
      );
    if (broken.length) throw Error(`Broken local images: ${broken}`);
  }
  await page.goto(origin + '/');
  await settle();
  await expect(page.locator('input[type=search],#search-dialog,.search-trigger')).toHaveCount(0);
  await expect(page.locator('#project-0 .featured-image img')).toHaveAttribute('src', /^\/media\//);
  await expect(page.locator('#project-0 .original-icon')).toHaveAttribute('src', /^\/media\//);
  if (
    await page
      .locator('main')
      .innerText()
      .then((t) => /つくることと|いま見てほしい|技術の話と、|日々の記録/.test(t))
  )
    throw Error('Removed copy returned');
  report.interactions.push('search and editorial filler removed; originals served from local /media assets');
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
  await expect(page.locator('[data-article]:not([hidden])')).toHaveCount(11);
  await page.locator('#article-sort').selectOption('oldest');
  const dates = await page
    .locator('[data-article]:not([hidden])')
    .evaluateAll((rows) => rows.map((r) => r.dataset.date));
  if (dates.join() !== [...dates].sort().join()) throw Error('Sort order');
  await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const scroll = await page.evaluate(() => scrollY);
  await page.locator('.rail nav a[href="/about"]').click();
  await expect(page.locator('main h1')).toContainText('しーぴー');
  await page.goBack();
  await expect(page.locator('[data-article]:not([hidden])')).toHaveCount(11);
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
    .poll(async () => Math.abs((await page.locator('#music').boundingBox()).y - 24), {
      timeout: 3000,
      message: 'Cross-page hash scroll',
    })
    .toBeLessThan(3);
  await page.waitForTimeout(350);
  if ((await page.evaluate(() => window.__streams.size)) !== 1)
    throw Error('Stale Firebase subscription after navigation');
  report.interactions.push(
    'zero document reloads across navigation, persistent header, back/forward, scroll and filters restored, cross-page anchor, one active Firebase stream',
  );
  // Reloading, and coming back from another document, return to where the visitor was.
  {
    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await other.route(/firebaseio\.com|firebasedatabase\.app|googleapis\.com/, (route) => route.abort());
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
  report.interactions.push(
    'scroll position restored after a reload and after coming back from another document',
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + '/');
    await settle();
    for (const tab of [1, 2, 0]) {
      await page.locator(`[data-project-tab="${tab}"]`).scrollIntoViewIfNeeded();
      await beginLayout('.featured,.project-deck,.home-middle,.site-header');
      await page.locator(`[data-project-tab="${tab}"]`).click();
      await endLayout(`project ${tab} ${width}`);
    }
  }
  await page.keyboard.press('End');
  await expect(page.locator('[data-project-tab="2"]')).toHaveAttribute('aria-selected', 'true');
  await axe('/#project-2');
  const icon = page.locator('.rail nav a').first().locator('svg');
  const before = await icon.boundingBox();
  await page.locator('.rail nav a').first().hover();
  await page.waitForTimeout(260);
  const after = await icon.boundingBox();
  if (Math.abs(before.y - after.y) > 0.1) throw Error('Sidebar icon lifted');
  for (const width of [320, 390, 768, 1440]) {
    console.log('Viewport:', width);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/articles', '/works', '/works/dice-spec-v2', '/about']) {
      await page.goto(origin + path);
      await settle();
      const actual = await page.evaluate(() => document.documentElement.scrollWidth);
      report.viewports.push({ width, path, actual });
      if (actual > width) throw Error(`Overflow ${path} at ${width}`);
    }
    await page.goto(origin + '/articles');
    await settle();
    const select = await page.locator('#article-sort').boundingBox(),
      wrapper = await page.locator('.native-select').boundingBox(),
      label = await page.locator('label[for=article-sort]').boundingBox();
    if (
      Math.abs(select.width - wrapper.width) > 0.1 ||
      Math.abs(select.y + select.height / 2 - label.y - label.height / 2) > 1 ||
      select.height < 40
    )
      throw Error(`Select alignment ${width}`);
    const ratios = await page
      .locator('.article-row>.og-image')
      .evaluateAll((images) => images.slice(0, 8).map((i) => i.offsetWidth / i.offsetHeight));
    if (ratios.some((r) => Math.abs(r - 16 / 9) > 0.04)) throw Error('Inconsistent article image frames');
  }
  report.interactions.push(
    'native select bounds and vertical alignment at four widths; consistent 16:9 article frames; sidebar icons stay within bounds',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/');
  await settle();
  visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mockFirebase(visitorContext, { db });
  await signInAs(visitorContext, { uid: 'mock-visitor', email: 'visitor2@example.com' });
  visitor = await visitorContext.newPage();
  await visitor.goto(origin + '/');
  // Without a Google sign-in, stickers can be seen but not placed.
  guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await mockFirebase(guestContext, { db });
  const guest = await guestContext.newPage();
  await guest.goto(origin + '/');
  // At 1440px the sheet would cover the page, so it starts as the closed tab (sheet-start.mjs).
  await guest.locator('.sticker-tab').click();
  await expect(guest.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
  await guest.getByRole('button', { name: /^クローバー/ }).click();
  await expect(guest.locator('.stamp-overlay')).toHaveCount(0);
  await expect(guest.locator('.sticker-login')).toHaveAttribute('data-nudge', 'a');
  await beginLayout('main,.site-header,.site-footer');
  // At 1440px the sheet starts closed so it never covers the page; open it from the tab.
  await expect(page.locator('.sticker-sheet')).toBeHidden();
  await page.locator('.sticker-tab').click();
  await expect(page.locator('.sticker-sheet')).toBeVisible();
  await expect(page.locator('.account-avatar img')).toHaveAttribute(
    'src',
    /gravatar\.com\/avatar\/[0-9a-f]{64}/,
  );
  await endLayout('sticker sheet shown');
  await axe('/#sticker-sheet');
  let unblock;
  const gate = new Promise((resolve) => (unblock = resolve));
  releaseWrite = unblock;
  let held = false;
  const hold = async (route) => {
    if (route.request().method() === 'PATCH' && !held) {
      held = true;
      await gate;
    }
    await route.fallback();
  };
  await page.route('https://**.firebasedatabase.app/**', hold);
  // Click a sticker to hold it, then click the page to stick it.
  await page.getByRole('button', { name: 'しーぴーのシールを貼る', exact: true }).click();
  await expect(page.locator('.stamp-overlay')).toBeVisible();
  const anchor = await page.locator('[data-stamp-anchor=intro]').boundingBox();
  await beginLayout('main,.site-header,.site-footer');
  await page.mouse.click(anchor.x + anchor.width * 0.6, anchor.y + anchor.height * 0.45);
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  await endLayout('optimistic stamp placement before network response');
  unblock();
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  const own = page.locator(`[data-stamp-id^="${user.uid}-"]`);
  await expect(own).toHaveCount(1);
  if (!/^[0-9a-f]{64}$/.test(db.pages.get('home')[user.uid].avatar)) throw Error('Gravatar hash not saved');
  const stampId = await own.getAttribute('data-stamp-id');
  await expect(visitor.locator(`[data-stamp-id="${stampId}"]`)).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    const box = await own.boundingBox(),
      target = await page.locator('[data-stamp-anchor=intro]').boundingBox();
    if (
      Math.abs(box.x + box.width / 2 - target.x - target.width * 0.6) > 2 ||
      Math.abs(box.y + box.height / 2 - target.y - target.height * 0.45) > 2
    )
      throw Error('Responsive stamp anchor');
  }
  // Hovering shows who placed it; a click lifts it and the next click puts it down elsewhere.
  const placed = await own.boundingBox();
  const spot = { x: placed.x + placed.width / 2, y: placed.y + placed.height / 2 };
  await page.mouse.move(spot.x + 120, spot.y + 120);
  await page.mouse.move(spot.x, spot.y, { steps: 4 });
  await expect(page.locator('.sticker-avatar')).toHaveAttribute('src', /gravatar\.com\/avatar\/[0-9a-f]{64}/);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('.placed-stamp[data-lifted]')).toHaveCount(1);
  await page.mouse.move(spot.x - 120, spot.y + 40, { steps: 6 });
  await page.mouse.click(spot.x - 120, spot.y + 40);
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  const moved = page.locator(`[data-stamp-id^="${user.uid}-"]`);
  await expect(moved).toHaveCount(1);
  const landed = await moved.boundingBox();
  if (
    Math.abs(landed.x + landed.width / 2 - spot.x + 120) > 1 ||
    Math.abs(landed.y + landed.height / 2 - spot.y - 40) > 1
  )
    throw Error('Lifted sticker placement');
  const movedId = await moved.getAttribute('data-stamp-id');
  await expect(visitor.locator(`[data-stamp-id="${movedId}"]`)).toBeVisible();
  await beginLayout('main,.site-header,.site-footer');
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(moved).toHaveCount(0);
  await endLayout('optimistic undo');
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await expect(visitor.locator(`[data-stamp-id="${movedId}"]`)).toHaveCount(0);
  await page.unroute('https://**.firebasedatabase.app/**', hold);
  // A second visitor places, lifts and peels a sticker using actual touch events.
  await visitor.locator('.sticker-tab').tap();
  await expect(visitor.locator('.sticker-sheet')).toBeVisible();
  await visitor.getByRole('button', { name: 'ハートのシールを貼る', exact: true }).tap();
  await visitor.touchscreen.tap(160, 190);
  await expect(visitor.locator('[data-pending=true]')).toHaveCount(1);
  await expect(visitor.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  // A swipe that starts on your own sticker scrolls the page and leaves the sticker where it was.
  const writesBeforeSwipe = db.writes;
  const cdp = await visitorContext.newCDPSession(visitor);
  const finger = (type, y) =>
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
  if (db.writes !== writesBeforeSwipe) throw Error('A swipe over your sticker moved it');
  // A tapped sticker can be put back without a keyboard.
  await visitor.touchscreen.tap(160, 190);
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(1);
  await visitor.getByRole('button', { name: 'やめる' }).tap();
  await expect(visitor.locator('.stamp-overlay')).toHaveCount(0);
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(0, { timeout: 3000 });
  if (db.writes !== writesBeforeSwipe) throw Error('Putting a tapped sticker back saved it');
  await visitor.touchscreen.tap(160, 190);
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(1);
  const backing = await visitor.locator('.sticker-sheet').boundingBox();
  await visitor.touchscreen.tap(backing.x + 6, backing.y + backing.height / 2);
  await expect(visitor.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await expect(visitor.locator('.placed-stamp')).toHaveCount(0);
  await visitor.getByRole('button', { name: 'シール帳を閉じる' }).tap();
  await expect(visitor.locator('.sticker-sheet')).toBeHidden();
  await expect(visitor.locator('.sticker-tab')).toBeVisible();
  if (Object.keys(db.pages.get('home') || {}).length) throw Error('Test stickers left in the mock database');
  // With all five stickers placed, moving one keeps the other four (the oldest included), and
  // two tabs of one account placing at once both keep their sticker.
  await page.goto(origin + '/about');
  await settle();
  const second = await context.newPage();
  await second.goto(origin + '/about');
  const stick = async (tab, fx) => {
    if (!(await tab.locator('.sticker-sheet').isVisible())) await tab.locator('.sticker-tab').click();
    const box = await tab.locator('[data-stamp-anchor=profile]').boundingBox();
    await tab.getByRole('button', { name: 'しーぴーのシールを貼る', exact: true }).click();
    await tab.mouse.click(box.x + box.width * fx, box.y + Math.min(box.height, 400) * 0.5);
  };
  for (const fx of [0.1, 0.25, 0.4, 0.55, 0.7]) await stick(page, fx);
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  const five = () => db.pages.get('about')?.[user.uid]?.stamps || {};
  const beforeMove = structuredClone(five());
  if (Object.keys(beforeMove).length !== 5) throw Error('Five stickers not saved');
  const lift = await page.locator(`[data-stamp-id="${user.uid}-3"]`).boundingBox();
  await page.mouse.click(lift.x + lift.width / 2, lift.y + lift.height / 2);
  await page.mouse.move(lift.x + 40, lift.y + 140, { steps: 6 });
  await page.mouse.click(lift.x + 40, lift.y + 140);
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(5);
  const afterMove = five();
  if (
    Object.keys(afterMove).length !== 5 ||
    ['0', '1', '2', '4'].some(
      (slot) => JSON.stringify(afterMove[slot]) !== JSON.stringify(beforeMove[slot]),
    ) ||
    afterMove[3].createdAt !== beforeMove[3].createdAt ||
    afterMove[3].y === beforeMove[3].y
  )
    throw Error('Moving one of five stickers changed the others');
  db.pages.delete('about');
  await expect(page.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(0);
  await Promise.all([stick(page, 0.3), stick(second, 0.6)]);
  for (const tab of [page, second])
    await expect(tab.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  if (Object.keys(five()).length !== 2) throw Error('Concurrent tabs lost a sticker');
  for (const tab of [page, second]) {
    await expect(tab.locator('.stamp-retry')).toHaveCount(0);
    await expect(tab.locator(`[data-stamp-id^="${user.uid}-"]`)).toHaveCount(2);
  }
  await second.close();
  db.pages.delete('about');
  // Another visitor's stickers aimed at controls (or written onto the index tabs through the REST
  // API) leave every click, modifier click and the tabs to the page under them.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/articles');
  await settle();
  const targets = await page.evaluate(() => {
    const body = document.querySelector('[data-stamp-anchor=page]').getBoundingClientRect();
    const at = (el, fx = 0.5) => {
      const r = el.getBoundingClientRect();
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
  db.pages.set('articles', {
    'other-visitor': {
      avatar: 'b'.repeat(64),
      stamps: Object.fromEntries(
        targets.map((t, i) => [i, { anchor: 'page', ...t, kind: 1, angle: 0, createdAt: 1700000000000 + i }]),
      ),
    },
  });
  await expect(page.locator('.placed-stamp')).toHaveCount(3);
  const covered = await page.evaluate(() =>
    [
      '#article-sort',
      '.site-header a[href="/"]',
      ...[0, 1, 2, 3].map((i) => `.rail nav a:nth-child(${i + 1})`),
    ]
      .map((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return [sel, document.elementFromPoint(r.left + r.width * 0.2, r.top + 30)?.closest('.placed-stamp')];
      })
      .filter(([, hit]) => hit)
      .map(([sel]) => sel),
  );
  if (covered.length) throw Error(`Another visitor's sticker takes the pointer from ${covered}`);
  const rail = await page.locator('.rail').boundingBox(),
    onTab = await page.locator('.placed-stamp').nth(2).boundingBox();
  if (onTab.x + onTab.width > rail.x) throw Error("Another visitor's sticker drawn over the index tabs");
  const logo = await page.locator('.placed-stamp').nth(1).boundingBox();
  await page.mouse.move(logo.x + 23, logo.y + 23, { steps: 3 });
  await expect(page.locator('.sticker-avatar')).toHaveCount(1);
  const opened = context.waitForEvent('page');
  await page.keyboard.down('Control');
  await page.mouse.click(logo.x + 23, logo.y + 23);
  await page.keyboard.up('Control');
  await (await opened).close();
  if (new URL(page.url()).pathname !== '/articles') throw Error('Ctrl+click under a sticker left the page');
  const sort = await page.locator('.placed-stamp').nth(0).boundingBox();
  await page.mouse.click(sort.x + 23, sort.y + 23);
  await expect(page.locator('#article-sort')).toBeFocused();
  await page.keyboard.press('Escape');
  db.pages.delete('articles');
  await expect(page.locator('.placed-stamp')).toHaveCount(0);
  report.interactions.push(
    "other visitors' stickers let clicks, modifier clicks and the select through, keep off the index tabs and show their avatar on hover",
  );
  // On phones the tabs are fixed to the bottom of the screen; stickers scrolling under them
  // (another visitor's or your own) must not be painted over the tab labels.
  await visitor.goto(origin + '/articles');
  await visitor.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
  await visitor.waitForTimeout(200);
  const tabTargets = await visitor.evaluate(() => {
    const body = document.querySelector('[data-stamp-anchor=page]').getBoundingClientRect();
    return [...document.querySelectorAll('.rail nav a')].map((a) => {
      const r = a.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - body.left) / body.width,
        y: (r.top + r.height / 2 - body.top) / body.height,
      };
    });
  });
  const stampsAt = (targets) =>
    Object.fromEntries(
      targets.map((t, i) => [i, { anchor: 'page', ...t, kind: 1, angle: 0, createdAt: 1700000000000 + i }]),
    );
  db.pages.set('articles', {
    'other-visitor': { avatar: 'b'.repeat(64), stamps: stampsAt(tabTargets.slice(0, 2)) },
    'mock-visitor': { avatar: 'c'.repeat(64), stamps: stampsAt(tabTargets.slice(2)) },
  });
  await expect(visitor.locator('.placed-stamp')).toHaveCount(tabTargets.length);
  const overTabs = await visitor.evaluate(() => {
    // Hit testing skips elements without pointer events (other visitors' stickers); turn them on
    // briefly so elementsFromPoint follows paint order.
    const probe = document.head.appendChild(document.createElement('style'));
    probe.textContent = '.placed-stamp, .placed-stamp * { pointer-events: auto !important; }';
    const result = [...document.querySelectorAll('.rail nav a')]
      .map((a, i) => {
        const r = a.getBoundingClientRect(),
          x = r.left + r.width / 2,
          y = r.top + r.height / 2;
        const onStamp = [...document.querySelectorAll('.placed-stamp')].some((s) => {
          const b = s.getBoundingClientRect();
          return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
        });
        if (!onStamp) return `tab ${i + 1} has no sticker under it`;
        const top = document.elementsFromPoint(x, y).find((el) => el.closest('.rail, .placed-stamp'));
        return top?.closest('.rail') ? null : `tab ${i + 1}`;
      })
      .filter(Boolean);
    probe.remove();
    return result;
  });
  if (overTabs.length) throw Error(`Stickers painted over the mobile tabs: ${overTabs}`);
  db.pages.delete('articles');
  await expect(visitor.locator('.placed-stamp')).toHaveCount(0);
  report.interactions.push('stickers scrolling under the fixed mobile tabs stay below them');
  report.interactions.push(
    'signed-out visitors cannot place; click-to-stick placement; Gravatar shown on hover; click to lift and re-place; immediate optimistic render and undo; cross-visitor live sync; touch placement, lift, put back and peel; swipes over your sticker scroll; moving one of five stickers keeps the rest; two tabs placing at once; responsive anchors',
  );
  for (const [width, height] of [
    [390, 844],
    [1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    const suffix = width === 390 ? 'mobile' : 'desktop';
    for (const route of ['/', '/articles', '/about']) {
      await page.goto(origin + route);
      await settle();
      if (width === 390) await axe(`${route}?mobile`);
      const name = route === '/' ? 'home' : route.slice(1);
      await page.screenshot({ path: `${outputDir}/${name}-${suffix}.png`, fullPage: route !== '/articles' });
      if (route === '/') await page.screenshot({ path: `${outputDir}/preview-${suffix}.png` });
    }
  }
  // Every `sizes` is at least the width its image is laid out at, so no smaller candidate is upscaled.
  await page.goto(origin + '/works');
  const workPage = await page.locator('a[href^="/works/"]').first().getAttribute('href');
  for (const width of [360, 380, 450, 600, 760, 761, 900, 901, 1100, 1101, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/', '/works', '/about', workPage]) {
      await page.goto(origin + route);
      const short = await page.evaluate(() =>
        [...document.querySelectorAll('img[sizes]')].flatMap((img) => {
          const rule =
            img
              .getAttribute('sizes')
              .split(/,\s*(?![^()]*\))/)
              .map((part) => part.match(/^(\(.+?\))\s+(.+)$/) || [, , part])
              .find(([, query]) => !query || matchMedia(query).matches) || [];
          const probe = document.body.appendChild(document.createElement('div'));
          probe.style.width = rule[2];
          const slot = probe.getBoundingClientRect().width;
          probe.remove();
          return img.offsetWidth > slot + 0.5
            ? [`${img.getAttribute('sizes')}: ${img.offsetWidth} > ${slot}`]
            : [];
        }),
      );
      if (short.length)
        throw Error(`sizes below the rendered width at ${width}px ${route}: ${short.join('; ')}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/articles');
  const allArticles = await page.locator('[data-article]:not([hidden])').count();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto(origin + '/articles');
  // Without JS every article is listed, as many as the full list with JS.
  await expect(plain.locator('[data-article]')).toHaveCount(allArticles);
  await plain.goto(origin + '/');
  await expect(plain.locator('noscript a')).toHaveCount(3);
  await nojs.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  await page.locator('[data-project-tab="1"]').click();
  if (
    (await page
      .locator('#project-1 .featured-image')
      .evaluate((el) => getComputedStyle(el).animationName)) !== 'none'
  )
    throw Error('Reduced motion');
  await page.route('https://**.firebasedatabase.app/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test outage"}' });
    } else await route.fallback();
  });
  const clover = page.getByRole('button', { name: 'クローバーのシールを貼る', exact: true });
  // Escape puts the sticker back and focus returns to the sheet sticker it came from.
  await clover.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-overlay')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(clover).toBeFocused();
  // Aiming at the desk outside the page is announced as a spot where nothing can go.
  const spoken = page.locator('p.visually-hidden[role=status]');
  await page.keyboard.press('Enter');
  await expect(spoken).toHaveText(/の上$/);
  for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft');
  await expect(spoken).toHaveText('ここには貼れません');
  await page.keyboard.press('Escape');
  await expect(clover).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(clover).toBeFocused();
  await expect(page.locator('p.visually-hidden[role=status]')).toHaveText(
    /^クローバーを貼りました。残り\d枚$/,
  );
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  await expect(page.locator('.stamp-status')).toContainText('保存できませんでした', { timeout: 20000 });
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
  // A second failure while the first is waiting keeps both, and one retry sends both again.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-status')).toContainText('2件保存できませんでした', { timeout: 20000 });
  await page.unroute('https://**.firebasedatabase.app/**');
  const writesBeforeRetry = db.writes;
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.locator('.stamp-retry')).toHaveCount(0);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0, { timeout: 20000 });
  await expect.poll(() => db.writes - writesBeforeRetry, { timeout: 20000 }).toBe(2);
  await expect(page.locator('.stamp-status')).not.toContainText('保存できませんでした');
  // An in-app link to a section moves focus to that section, so the next Tab continues there.
  await page.goto(origin + '/');
  await page.locator('a[href="/about#credits"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#credits h2')).toBeFocused();
  // Back returns focus to the link that was followed with the keyboard, not to an off-screen h1.
  await page.goto(origin + '/works');
  const lastWork = page.locator('main a[href^="/works/"]:not([tabindex="-1"])').last();
  await lastWork.focus();
  const lastHref = await lastWork.getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(origin + lastHref);
  await page.goBack();
  await expect(lastWork).toBeFocused();
  // Opening and closing the sticker sheet from the keyboard keeps focus on the sheet controls.
  if (!(await page.locator('.sticker-tab[data-open]').count()))
    await page.getByRole('button', { name: 'シール帳を閉じる' }).click();
  await expect(page.locator('.sticker-tab')).toBeVisible();
  await page.locator('.sticker-tab').focus();
  await expect(page.locator('.sticker-tab')).toBeFocused();
  await page.keyboard.press('Enter');
  // The avatar, or the first header control while the sign-in is still being restored.
  await expect(page.locator('.sticker-sheet-head :focus')).toHaveCount(1);
  await page.getByRole('button', { name: 'シール帳を閉じる' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sticker-tab')).toBeFocused();
  // Pages swapped out and rows filtered away are released: after a warm-up lap the DOM node
  // count (after GC) stays flat. Chromium kept every client-rendered srcset image, and with it
  // its whole page, while srcset was set during the build (see responsive() in Preview.tsx).
  {
    const leak = await context.newPage();
    const cdp = await context.newCDPSession(leak);
    await cdp.send('Performance.enable');
    const nodes = async () => {
      for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'Nodes').value;
    };
    const follow = async (href) => {
      await leak.evaluate((href) => {
        const a = Object.assign(document.createElement('a'), { href });
        document.querySelector('main').append(a);
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
  report.interactions.push('swapped-out pages and filtered rows are released from memory');
  report.interactions.push(
    'failed saves roll back and expose retry; keyboard placement with focus return and spoken result; section links move focus; reduced motion; complete static content without JS',
  );
  if (errors.length || externalImages.length || report.pages.some((p) => p.violations.length))
    throw Error(
      `Browser QA failed: ${errors.length} exceptions / ${externalImages.length} remote images / ${report.pages.flatMap((p) => p.violations).length} axe violations`,
    );
  console.log(
    JSON.stringify(
      {
        pages: report.pages.length,
        viewports: report.viewports.length,
        layoutChecks: report.layout.length,
        interactions: report.interactions,
        errors,
        externalImages,
      },
      null,
      2,
    ),
  );
} finally {
  releaseWrite();
  await writeFile(`${outputDir}/browser-check.json`, JSON.stringify(report, null, 2));
  await visitorContext?.close();
  await guestContext?.close();
  await browser.close();
}
