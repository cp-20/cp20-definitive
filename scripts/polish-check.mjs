import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('src/data/firebase.json'));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('response', (r) => {
  if (r.url().includes('firebasedatabase.app') && r.status() >= 400)
    console.log('Database response', r.status(), r.request().method());
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { viewports: [], errors, accessibility: [] };
let release = () => {};
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
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:4321/about#manga');
    await page.locator('#manga').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const frames = await page
      .locator('.book-cover')
      .evaluateAll((xs) =>
        xs.map((el) => ({
          width: el.clientWidth,
          height: el.clientHeight,
          fit: getComputedStyle(el.querySelector('img')).objectFit,
          position: getComputedStyle(el.querySelector('img')).objectPosition,
        })),
      );
    if (
      frames.some(
        (f) => Math.abs(f.width / f.height - 1.6) > 0.04 || f.fit !== 'contain' || f.position !== '50% 50%',
      )
    )
      throw Error('Manga frame alignment ' + JSON.stringify(frames));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Overflow');
    await page.locator('#manga').screenshot({ path: '.qa/manga-' + width + '.png' });
    report.viewports.push({ width, frames });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4321/works');
  const card = page.locator('.work-thumbnail').first();
  await card.scrollIntoViewIfNeeded();
  const state = async () =>
    card.evaluate((el) => ({
      outer: getComputedStyle(el).transform,
      rotate: getComputedStyle(el).rotate,
      inner: getComputedStyle(el.querySelector('img')).transform,
    }));
  const before = await state();
  await card.hover();
  await page.waitForTimeout(500);
  const after = await state();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error('OG frame moved ' + JSON.stringify({ before, after }));
  report.hover = { before, after };
  await page.screenshot({ path: '.qa/works-hover.png' });
  await page.goto('http://localhost:4321/');
  await page.locator('.stamp-trigger').click();
  await page.mouse.click(500, 195);
  await expect(page.locator('.stamp-status')).toContainText('保存しました', { timeout: 20000 });
  await page.mouse.click(650, 205);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('.stamp-count')).not.toHaveText('+');
  await page.reload();
  await page.locator('.stamp-trigger').click();
  await page.getByRole('button', { name: '消す', exact: true }).click();
  await expect(page.locator('.stamp-delete')).toHaveCount(2, { timeout: 10000 });
  const first = await page.locator('.stamp-delete').first().locator('..').getAttribute('data-stamp-id');
  await page.screenshot({ path: '.qa/stamp-delete-desktop.png' });
  let held = false;
  const gate = new Promise((r) => (release = r));
  const handler = async (route) => {
    if (route.request().method() === 'PUT' && !held) {
      held = true;
      await gate;
    }
    await route.continue();
  };
  await page.route('https://**.firebasedatabase.app/**', handler);
  await page.locator('.stamp-delete').first().click();
  await expect(page.locator('.stamp-delete')).toHaveCount(1);
  await expect(page.locator(`[data-stamp-id="${first}"]`)).toHaveCount(0);
  release();
  await expect(page.locator('.stamp-status')).toContainText('取り消しました', { timeout: 20000 });
  await page.mouse.click(500, 250);
  await expect(page.locator('.stamp-delete')).toHaveCount(1);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.qa/stamp-delete-mobile.png' });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  report.accessibility = result.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => n.failureSummary),
  }));
  await page.locator('.stamp-delete').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-delete')).toHaveCount(0);
  await expect(page.locator('.stamp-status')).toContainText('取り消しました', { timeout: 20000 });
  await expect(page.locator('.stamp-ui-heading p')).toContainText('消せるスタンプはありません');
  if (errors.length || report.accessibility.length)
    throw Error(JSON.stringify({ errors, violations: report.accessibility }));
  report.deletion =
    'passed: persisted stamps, selected deletion, optimistic removal, no accidental placement, keyboard deletion';
  console.log(JSON.stringify(report));
} finally {
  release();
  await cleanupTestUser(page);
  await writeFile('.qa/polish-check.json', JSON.stringify(report, null, 2));
  await browser.close();
}
