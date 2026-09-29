import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.CHECK_ORIGIN || 'http://127.0.0.1:8787';
const outputDir = process.env.CHECK_OUTPUT_DIR || '.qa';
await mkdir(outputDir, { recursive: true });
const config = JSON.parse(await readFile(new URL('../src/data/firebase.json', import.meta.url)));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  if (r.resourceType() === 'image' && new URL(r.url()).origin !== origin) externalImages.push(r.url());
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
async function cleanupTestUser(p) {
  if (!p || p.isClosed()) return;
  const user = await p.evaluate(async () => {
    if (!localStorage.getItem('cp20-stamp-owner')) return null;
    return new Promise((resolve) => {
      const request = indexedDB.open('firebaseLocalStorageDb');
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
          db.close();
          resolve(null);
          return;
        }
        const get = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
        get.onsuccess = () => {
          const row = get.result.find((x) => x.fbase_key?.endsWith(':cp20-portfolio'));
          db.close();
          resolve(row?.value ? { uid: row.value.uid, token: row.value.stsTokenManager.accessToken } : null);
        };
      };
    });
  });
  if (!user) return;
  for (const path of ['home', 'about']) {
    const u = new URL(`${config.databaseURL}/pages/${path}/${user.uid}.json`);
    u.searchParams.set('auth', user.token);
    const response = await fetch(u, { method: 'DELETE' });
    if (!response.ok) throw Error('Temporary test stamp cleanup failed');
  }
  const removed = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: user.token }),
    },
  );
  if (!removed.ok) throw Error('Temporary test account cleanup failed');
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
  await expect(page.locator('[data-article]')).toHaveCount(11);
  await page.locator('#article-sort').selectOption('oldest');
  const dates = await page.locator('[data-article]').evaluateAll((rows) => rows.map((r) => r.dataset.date));
  if (dates.join() !== [...dates].sort().join()) throw Error('Sort order');
  await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const scroll = await page.evaluate(() => scrollY);
  await page.locator('.rail nav a[href="/about"]').click();
  await expect(page.locator('main h1')).toContainText('しーぴー');
  await page.goBack();
  await expect(page.locator('[data-article]')).toHaveCount(11);
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
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + '/');
    await settle();
    for (const tab of [1, 2, 0]) {
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
  visitor = await visitorContext.newPage();
  await visitor.goto(origin + '/');
  await beginLayout('main,.site-header,.site-footer');
  await page.locator('.stamp-trigger').click();
  await expect(page.locator('.stamp-overlay')).toBeVisible();
  await endLayout('stamp tools open');
  await axe('/#stamp-tools');
  let unblock;
  const gate = new Promise((resolve) => (unblock = resolve));
  releaseWrite = unblock;
  let held = false;
  const hold = async (route) => {
    if (route.request().method() === 'PUT' && !held) {
      held = true;
      await gate;
    }
    await route.continue();
  };
  await page.route('https://**.firebasedatabase.app/**', hold);
  await page.getByRole('button', { name: 'しーぴー', exact: true }).click();
  const anchor = await page.locator('[data-stamp-anchor=intro]').boundingBox();
  await beginLayout('main,.site-header,.site-footer');
  await page.mouse.click(anchor.x + anchor.width * 0.6, anchor.y + anchor.height * 0.45);
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  await endLayout('optimistic stamp placement before network response');
  unblock();
  await expect(page.locator('.stamp-status')).toContainText('保存しました', { timeout: 20000 });
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  const uid = await page.evaluate(() => localStorage.getItem('cp20-stamp-owner'));
  const own = page.locator(`[data-stamp-id^="${uid}-"]`);
  await expect(own).toHaveCount(1);
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
  await beginLayout('main,.site-header,.site-footer');
  await page.getByRole('button', { name: '取り消す', exact: true }).click();
  await expect(own).toHaveCount(0);
  await endLayout('optimistic undo');
  await expect(page.locator('.stamp-status')).toContainText('取り消しました', { timeout: 20000 });
  await expect(visitor.locator(`[data-stamp-id="${stampId}"]`)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.stamp-trigger')).toBeFocused();
  await page.unroute('https://**.firebasedatabase.app/**', hold);
  // A second visitor places and removes a stamp using actual touch events.
  await visitor.locator('.stamp-trigger').tap();
  await visitor.getByRole('button', { name: 'ハート', exact: true }).tap();
  await visitor.touchscreen.tap(160, 190);
  await expect(visitor.locator('[data-pending=true]')).toHaveCount(1);
  await expect(visitor.locator('.stamp-status')).toContainText('保存しました', { timeout: 20000 });
  await visitor.getByRole('button', { name: '取り消す', exact: true }).tap();
  await expect(visitor.locator('.stamp-status')).toContainText('取り消しました', { timeout: 20000 });
  await visitor.getByRole('button', { name: 'スタンプを閉じる' }).tap();
  report.interactions.push(
    'two-click stamp placement; immediate optimistic render and undo; cross-visitor live sync; touch placement; responsive anchors; test stamps removed',
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
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto(origin + '/articles');
  await expect(plain.locator('[data-article]')).toHaveCount(54);
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
    if (route.request().method() === 'PUT') {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test outage"}' });
    } else await route.continue();
  });
  await page.locator('.stamp-trigger').click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  await expect(page.locator('.stamp-status')).toContainText('元に戻しました', { timeout: 20000 });
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
  report.interactions.push(
    'failed saves roll back and expose retry; keyboard placement; reduced motion; complete static content without JS',
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
  try {
    await cleanupTestUser(page);
    await cleanupTestUser(visitor);
    report.temporaryDataCleanup = 'passed';
  } finally {
    await writeFile(`${outputDir}/browser-check.json`, JSON.stringify(report, null, 2));
    await visitorContext?.close();
    await browser.close();
  }
}
