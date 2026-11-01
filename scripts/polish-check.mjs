import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { mockFirebase, signInAs } from './firebase-mock.mjs';
const origin = process.env.CHECK_ORIGIN || 'http://localhost:4321';
const outputDir = process.env.CHECK_OUTPUT_DIR || '.qa';
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
  // Work titles fit the paper on phones: a long word wraps instead of being clipped, and the
  // highlighter stops at the end of each line's text.
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of [
      'no-log-chat',
      'titech-lecture-list',
      'wsh-scoring-tool',
      'trap-conference',
      'dice-spec-v2',
    ]) {
      await page.goto(`${origin}/works/${id}`);
      const heading = await page.locator('.work-heading h1').evaluate((h1) => {
        const title = h1.querySelector('.work-title');
        const range = document.createRange();
        range.selectNodeContents(title);
        const text = [...range.getClientRects()];
        const band = [...title.getClientRects()];
        return {
          textRight: Math.max(...text.map((r) => r.right)),
          main: document.querySelector('main').getBoundingClientRect().right,
          bandPastText: Math.max(
            ...band.map(
              (b) =>
                b.right -
                Math.max(...text.filter((t) => Math.abs(t.top - b.top) < b.height / 2).map((t) => t.right)),
            ),
          ),
        };
      });
      if (heading.textRight > heading.main - 2 || heading.bandPastText > 2)
        throw Error(`Work title ${id} at ${width}: ${JSON.stringify(heading)}`);
    }
  }
  // A wrapped source or related-article link keeps its ↗ right after the end of its last line.
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['dice-spec-v1', 'read-stack', 'trap-mission']) {
      await page.goto(`${origin}/works/${id}`);
      const gaps = await page.$$eval(
        '.work-facts dd a, .work-detail-copy > p > a:not(.inline-link)',
        (links) =>
          links.map((a) => {
            const range = document.createRange();
            range.selectNodeContents(a);
            range.setEndBefore(a.querySelector('svg'));
            const lines = [...range.getClientRects()].filter((r) => r.width > 0);
            const last = lines[lines.length - 1];
            const arrow = a.querySelector('svg').getBoundingClientRect();
            return { gap: arrow.left - last.right, below: arrow.top - last.top, height: last.height };
          }),
      );
      for (const g of gaps)
        if (g.gap < 0 || g.gap > 10 || g.below < -2 || g.below > g.height)
          throw Error(`Link arrow on ${id} at ${width}: ${JSON.stringify(g)}`);
    }
  }
  // The NEW badge on the third checkpoint stays inside the paper's frame.
  for (const width of [300, 320, 360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/');
    const badge = await page.locator('.featured-tab small').evaluate((s) => ({
      right: s.getBoundingClientRect().right,
      paper: document.querySelector('.site-body').getBoundingClientRect().right,
    }));
    if (badge.right > badge.paper - 4) throw Error(`NEW badge at ${width}: ${JSON.stringify(badge)}`);
  }
  // Repository descriptions are never squeezed to a few characters next to the name.
  for (const width of [761, 768, 900, 1000, 1101]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/works');
    const squeezed = await page.$$eval('.repo-description', (els) =>
      els
        .filter((e) => e.textContent && e.clientWidth < Math.min(e.scrollWidth, 240))
        .map((e) => e.textContent),
    );
    if (squeezed.length) throw Error(`Repository descriptions squeezed at ${width}: ${squeezed}`);
  }
  // Works without a site icon keep the title where the others start it.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/works');
  const titleStarts = await page.$$eval('.work-index-item h2 a', (links) =>
    links.map((a) => {
      const text = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange();
      range.selectNodeContents(text);
      return Math.round(range.getClientRects()[0].left - a.getBoundingClientRect().left);
    }),
  );
  if (new Set(titleStarts).size !== 1) throw Error(`Work title starts ${titleStarts}`);
  // Spines that give way (761-833px) are not cut at their edges.
  for (const width of [761, 768, 800, 834]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + '/about#manga');
    await page.waitForTimeout(700);
    const clipped = await page.$$eval('.book:not([aria-expanded=true])', (books) =>
      books.flatMap((book) => {
        const box = book.getBoundingClientRect();
        return [...book.querySelectorAll('.book-spine > *')]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.left < box.left + 2 || r.right > box.right - 2)
          .map((r) => `${Math.round(r.left - box.left)}..${Math.round(box.right - r.right)}`);
      }),
    );
    if (clipped.length) throw Error(`Spine text clipped at ${width}: ${clipped}`);
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + '/about#manga');
    await page.locator('#manga').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    // Choosing a spine pulls that book out; on wide screens its cover keeps the book's proportions.
    const frames = [];
    for (let i = 0; i < 6; i++) {
      await page.locator('.book').nth(i).click();
      await page.waitForTimeout(700);
      frames.push(
        await page.locator('.book[aria-expanded=true]').evaluate((el) => ({
          width: el.clientWidth,
          height: el.clientHeight,
          fit: getComputedStyle(el.querySelector('img')).objectFit,
          opacity: getComputedStyle(el.querySelector('img')).opacity,
        })),
      );
    }
    if (
      frames.some(
        (f) =>
          (width > 760 && Math.abs(f.width / f.height - 480 / 682) > 0.04) ||
          f.fit !== 'cover' ||
          f.opacity !== '1',
      )
    )
      throw Error('Manga shelf ' + JSON.stringify(frames));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Overflow');
    await page.locator('#manga').screenshot({ path: `${outputDir}/manga-${width}.png` });
    report.viewports.push({ width, frames });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/works');
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
  await page.screenshot({ path: `${outputDir}/works-hover.png` });
  await page.goto(origin + '/');
  // At 1440px the sheet starts as the closed tab so it never covers the page (sheet-start.mjs).
  await page.locator('.sticker-tab').click();
  await page.getByRole('button', { name: 'クローバーのシールを貼る', exact: true }).click();
  await page.mouse.click(500, 195);
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await page.getByRole('button', { name: 'クローバーのシールを貼る', exact: true }).click();
  await page.mouse.click(650, 205);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('.sticker-count')).toHaveText('2');
  await page.reload();
  await expect(page.locator('.stamp-delete')).toHaveCount(2, { timeout: 10000 });
  const first = await page.locator('.stamp-delete').first().locator('..').getAttribute('data-stamp-id');
  await page.screenshot({ path: `${outputDir}/stamp-delete-desktop.png` });
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
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await page.mouse.click(500, 250);
  await expect(page.locator('.stamp-delete')).toHaveCount(1);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${outputDir}/stamp-delete-mobile.png` });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  report.accessibility = result.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => n.failureSummary),
  }));
  await page.locator('.stamp-delete').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stamp-delete')).toHaveCount(0);
  await expect(page.locator('.sticker-sheet[data-saving]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('.sticker-pips > [data-used]')).toHaveCount(0);
  if (errors.length || report.accessibility.length)
    throw Error(JSON.stringify({ errors, violations: report.accessibility }));
  report.deletion =
    'passed: persisted stamps, selected deletion, optimistic removal, no accidental placement, keyboard deletion';
  console.log(JSON.stringify(report));
} finally {
  release();
  await writeFile(`${outputDir}/polish-check.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
