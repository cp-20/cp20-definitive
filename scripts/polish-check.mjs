import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { mockFirebase, signInAs } from './firebase-mock.mjs';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
// Stickers run against an in-memory database with a seeded Google sign-in (see firebase-mock.mjs).
await mockFirebase(context);
await signInAs(context);
const page = await context.newPage();
page.on('response', (r) => {
  if (r.url().includes('firebasedatabase.app') && r.status() >= 400)
    console.log('Database response', r.status(), r.request().method());
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { viewports: [], errors, accessibility: [] };
let release = () => {};
try {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://localhost:4321/about#manga');
    await page.locator('#manga').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const frames = await page.locator('.book-cover').evaluateAll((xs) =>
      xs.map((el) => ({
        width: el.clientWidth,
        height: el.clientHeight,
        fit: getComputedStyle(el).objectFit,
        position: getComputedStyle(el).objectPosition,
      })),
    );
    if (
      frames.some(
        (f) =>
          Math.abs(f.width / f.height - 480 / 682) > 0.04 || f.fit !== 'cover' || f.position !== '50% 50%',
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
  await page.getByRole('button', { name: 'クローバー', exact: true }).click();
  await page.mouse.click(500, 195);
  await expect(page.locator('.stamp-status')).toContainText('保存しました', { timeout: 20000 });
  await page.getByRole('button', { name: 'クローバー', exact: true }).click();
  await page.mouse.click(650, 205);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('.sticker-count')).toHaveText('2');
  await page.reload();
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
    await route.fallback();
  };
  await page.route('https://**.firebasedatabase.app/**', handler);
  // The × appears while the pointer is over your own sticker.
  await page.locator(`[data-stamp-id="${first}"]`).hover();
  await page.locator('.stamp-delete').first().click();
  await expect(page.locator('.stamp-delete')).toHaveCount(1);
  await expect(page.locator(`[data-stamp-id="${first}"]`)).toHaveCount(0);
  release();
  await expect(page.locator('.stamp-status')).toContainText('はがしました', { timeout: 20000 });
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
  await expect(page.locator('.stamp-status')).toContainText('はがしました', { timeout: 20000 });
  await expect(page.locator('.sticker-left')).toContainText('あと5枚');
  if (errors.length || report.accessibility.length)
    throw Error(JSON.stringify({ errors, violations: report.accessibility }));
  report.deletion =
    'passed: persisted stamps, selected deletion, optimistic removal, no accidental placement, keyboard deletion';
  console.log(JSON.stringify(report));
} finally {
  release();
  await writeFile('.qa/polish-check.json', JSON.stringify(report, null, 2));
  await browser.close();
}
