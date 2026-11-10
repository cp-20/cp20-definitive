// Browser checks of the built site: what the unit tests cannot see. Start the production preview
// (`npx wrangler dev`, port 8787 by default) and run `node scripts/qa/browser-check.ts`; results and
// screenshots go to .qa/. Stickers run against firebase-mock.ts (a seeded Google sign-in and an
// in-memory database with the same ownership and throttle rules), never the real database.
import { chromium, devices, expect, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { mockFirebase, signInAs } from './firebase-mock.ts';
import profile from '../../src/data/profile.json' with { type: 'json' };
import works from '../../src/data/works.json' with { type: 'json' };
import manual from '../../src/data/manual.json' with { type: 'json' };
import { mergeWorks } from '../../src/site/pages.ts';

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
// Waits for the animations running now to end (the first page's entrance, a page turn): a box
// measured during one is still moving, and its edges fall on fractions of a pixel. Endless ones
// (the saving pip) are left out.
const animationsDone = (tab: Page = page) =>
  tab.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
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
    // Every character on the page, its dialogs included, is in a file of its face and weight: Zen
    // Maru Gothic 500 or 700, or Yusei Magic (scripts/build/fonts.ts subsets bold to what the
    // stylesheet sets in bold, and the hand-written face to what it sets in it).
    const missing = await page.evaluate(() => {
      const covered = (family: string, weight: string, c: string) =>
        [...document.fonts].some(
          (f) =>
            f.family.replaceAll(/["']/g, '') === family &&
            f.weight === weight &&
            f.unicodeRange.split(',').some((r) => {
              const [a, b = a] = r.trim().replace(/^U\+/i, '').split('-');
              const p = c.codePointAt(0)!;
              return p >= parseInt(a, 16) && p <= parseInt(b, 16);
            }),
        );
      const out = new Set<string>();
      const look = () => {
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const el = n.parentElement!;
          const family = getComputedStyle(el).fontFamily.split(',')[0].replaceAll(/["']/g, '');
          if (!el.checkVisibility() || !/^(Zen Maru Gothic|Yusei Magic)$/.test(family)) continue;
          const weight =
            family === 'Yusei Magic'
              ? '400'
              : parseInt(getComputedStyle(el).fontWeight) >= 600
                ? '700'
                : '500';
          // (The zero-width spaces between phrases, scripts/build/phrases.ts, are drawn by no font.)
          for (const c of n.textContent!)
            if (c.trim() && c !== '\u200b' && !covered(family, weight, c))
              out.add(`${family} ${weight}:${c}`);
        }
      };
      look();
      for (const d of document.querySelectorAll('dialog')) {
        d.showModal();
        look();
        d.close();
      }
      return [...out];
    });
    if (missing.length) throw Error(`Characters outside the font subsets on ${path}: ${missing.join(' ')}`);
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/articles', '/works', '/works/dice-spec-v2', '/about']) {
      await page.goto(origin + path);
      await settle();
      if ((await page.evaluate(() => document.documentElement.scrollWidth)) > width)
        throw Error(`Overflow ${path} at ${width}`);
      // On a phone the shared controls are a fingertip (44px) in both directions.
      if (width === 390) {
        const small = await page
          .locator(
            '.footer-links a, .footer-button, .profile-links a, .under-link, .speed-stamps button, .rail nav a, .sticker-tab',
          )
          .evaluateAll((els) =>
            els.flatMap((el) => {
              const r = el.getBoundingClientRect();
              return r.width && (Math.round(r.width) < 44 || Math.round(r.height) < 44)
                ? [
                    `${el.className || el.tagName} ${el.textContent?.trim().slice(0, 12)} ${Math.round(r.width)}×${Math.round(r.height)}`,
                  ]
                : [];
            }),
          );
        if (small.length) throw Error(`Tap targets under 44px on ${path}: ${small.join('; ')}`);
      }
    }
  }
  passed(
    'pages load with no axe violations, broken or remote images, or sideways scroll at 320-1440px; every character in a font subset of its weight; shared controls are 44px on a phone',
  );

  // ── A phone's first screen (iPhone 13, above the tabs at its foot): the name, the facts, the
  // accounts, the three results and the featured works' heading. The sticker tab is in the row of
  // the tabs, so it covers nothing of the page they do not; the first work's name and result are
  // above them. Each result is one line down to a 375px phone, whose shorter first screen
  // (Safari's bars shown) is checked too. In a phone's browser, whose scroll bar takes no width ──
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  await mockFirebase(phone);
  const handset = await phone.newPage();
  for (const [width, height] of [
    [390, 664],
    [375, 667],
    [375, 548],
  ]) {
    const page = handset;
    await page.setViewportSize({ width, height });
    await page.goto(origin + '/');
    await settle(page);
    const fold = (await page.locator('.rail nav').boundingBox())!.y;
    const parts = ['.home-hello h1', '.home-facts', '.home-accounts', '.highlights', '.header-qr'];
    for (const part of height > 600 ? [...parts, '.home-works h2'] : parts) {
      const box = (await page.locator(part).boundingBox())!;
      if (box.y + box.height > fold) throw Error(`${part} is below a ${width}×${height} first screen`);
    }
    const lines = await page
      .locator('.highlight-title')
      .evaluateAll((titles) =>
        titles.filter((t) => t.getClientRects().length > 1 || t.getBoundingClientRect().height > 30),
      );
    if (lines.length) throw Error(`A result takes two lines at ${width}px`);
    const sticker = (await page.locator('.sticker-tab').boundingBox())!;
    const tabs = await page
      .locator('.rail nav a')
      .evaluateAll((links) =>
        links.map((a) => a.getBoundingClientRect()).map((r) => ({ top: r.top, right: r.right })),
      );
    if (sticker.y < fold - 1 || tabs.some((t) => t.right > sticker.x))
      throw Error(`The sticker tab is not beside the tabs at ${width}×${height}`);
    if (height > 600)
      for (const part of ['h3', '.work-outcome']) {
        const box = (await page.locator(`.work-cards-large > :first-child ${part}`).boundingBox())!;
        if (box.y + box.height > fold)
          throw Error(`The first work's ${part} reaches the tabs at ${width}×${height}`);
      }
  }
  await phone.close();
  // Between a phone and a wide desk the sticker tab is the clover alone, in the margin beside the
  // paper: no link or button of the page passes under it, wherever the page is scrolled.
  for (const width of [800, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/works', '/works/dice-spec-v2']) {
      await page.goto(origin + path);
      await settle();
      const under = await page.evaluate(async () => {
        const s = document.querySelector('.sticker-tab')!.getBoundingClientRect();
        const found = new Set<string>();
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
          scrollTo(0, y);
          await new Promise(requestAnimationFrame);
          for (const el of document.querySelectorAll('main :is(a, button)')) {
            const r = el.getBoundingClientRect();
            if (r.width && r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top)
              found.add(el.textContent!.trim().slice(0, 20));
          }
        }
        return [...found];
      });
      if (under.length) throw Error(`Under the sticker tab at ${width}px on ${path}: ${under}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  passed(
    "a phone's first screen holds who, the facts, the accounts, the results, the featured heading and the QR code's button, with the first work's result above the tabs and the sticker tab beside them; no link under the sticker tab at 800-1280px",
  );

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
  // Anywhere on a work's card opens its page, not only its name.
  // (The card's link covers it, so the description is clicked where it is drawn.)
  const description = (await page
    .locator('[data-stamp-anchor="work-minna-no-monosashi"] .work-card-description')
    .boundingBox())!;
  await page.mouse.click(description.x + 20, description.y + description.height / 2);
  await expect(page.locator('main h1')).toHaveText('みんなのものさし');
  await page.goBack();
  await expect(page.locator('main h1')).toContainText('作品一覧');
  await page.goForward();
  await expect(page.locator('main h1')).toHaveText('みんなのものさし');
  await page.locator('.rail nav a[href="/articles"]').click();
  await expect(page.locator('.attendance-tab')).not.toHaveCount(0);
  // The other year with the most, from its tab on the stack of cards.
  const year = await page
    .locator('.attendance-tab[aria-pressed="false"]')
    .evaluateAll(
      (tabs) =>
        tabs
          .map((t) => [t.textContent!.slice(0, 4), parseInt(t.textContent!.slice(4))] as const)
          .sort((a, b) => b[1] - a[1])[0][0],
    );
  await page.locator('.attendance-tab', { hasText: year }).click();
  await expect(page).toHaveURL(new RegExp(`year=${year}`));
  // Another year hides rows instead of rebuilding the list, so only the rows shown are counted.
  const inYear = await page.locator('[data-article]:not([hidden])').count();
  if (inYear !== (await page.locator('.attendance-stamp').count()))
    throw Error("The list and the card disagree on the year's articles");
  const dates = await page
    .locator('[data-article]:not([hidden])')
    .evaluateAll((rows: HTMLElement[]) => rows.map((r) => r.dataset.date));
  if (dates.join() !== [...dates].sort().reverse().join()) throw Error('The articles are not newest first');
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
  // The tabs scroll with the sheet, so they are out of view here: clicked where they are, as a
  // keyboard would, without scrolling to them first.
  await page.locator('.rail nav a[href="/about"]').evaluate((a: HTMLElement) => a.click());
  await expect(page.locator('main h1')).toContainText('しーぴー');
  await page.goBack();
  await expect(page.locator('[data-article]:not([hidden])')).toHaveCount(inYear);
  await expect(page.locator('.attendance-tab[aria-pressed="true"]')).toContainText(year);
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
    // Far down the page (how far depends on the open year's articles).
    const far = await tab.evaluate(() => {
      scrollTo({ top: document.documentElement.scrollHeight - innerHeight - 40, behavior: 'instant' });
      return scrollY;
    });
    if (far < 800) throw Error(`/articles is too short to check scroll restoration (${far}px)`);
    await tab.waitForTimeout(200);
    await tab.reload();
    await tab.waitForTimeout(800);
    if (Math.abs((await tab.evaluate(() => scrollY)) - far) > 2) throw Error('Reload scroll restoration');
    await tab.goto(origin + '/feed.xml');
    await tab.goBack();
    await tab.waitForTimeout(800);
    if (Math.abs((await tab.evaluate(() => scrollY)) - far) > 2) throw Error('Cross-document back scroll');
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
  await expect(page.locator('#isucon2026')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator('#isucon2026')).toBeHidden();
  // A history entry's address opens its dialog over the entry; closing it drops the address and
  // leaves focus on the entry. A speed-up stamp opens the same dialog.
  await page.goto(origin + '/about#m3');
  await expect(page.locator('#m3')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#m3')).toBeHidden();
  await expect(page).toHaveURL(origin + '/about');
  await expect(page.locator('[data-opens="m3"]')).toBeFocused();
  await expect(page.locator('[data-opens="m3"]')).toBeInViewport();
  await page.locator('.speed-stamps button', { hasText: 'LayerX' }).click();
  await expect(page.locator('#layerx')).toBeVisible();
  await page.keyboard.press('Escape');
  // From another page (the home page's achievements), the page turns, then the dialog opens.
  await page.goto(origin + '/');
  await page.locator('.highlights a[href="/about#wsh2024"]').click();
  await expect(page.locator('#wsh2024')).toBeVisible();
  await expect(page.locator('main h1')).toContainText('しーぴー');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(origin + '/about');
  // The QR code: https://cp20.dev/#qr opens it straight away.
  await page.goto(origin + '/#qr');
  await expect(page.locator('#qr')).toBeVisible();
  await expect
    .poll(() => page.locator('#qr .qr-code').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // As drawn in the dialog it reads as the site with the digits that draw its clover, and that
  // address opens the home page as it is: no dialog, no scroll, and the digits gone from it.
  {
    const shot = await sharp(await page.locator('#qr .qr-code').screenshot())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const read = jsQR(new Uint8ClampedArray(shot.data), shot.info.width, shot.info.height);
    if (!/^https:\/\/cp20\.dev\/#\d+$/.test(read?.data ?? ''))
      throw Error(`The QR code in the dialog reads ${read?.data}`);
    await page.keyboard.press('Escape');
    // (From another page: a scan opens the address afresh, not as a jump within the page.)
    await page.goto(origin + '/about');
    await page.goto(read!.data.replace('https://cp20.dev', origin));
    await settle();
    if (
      (await page.locator('dialog[open]').count()) ||
      (await page.evaluate(() => scrollY)) !== 0 ||
      page.url() !== origin + '/'
    )
      throw Error("The QR code's address did not open the home page as it is");
    await page.goto(origin + '/#qr');
    await expect(page.locator('#qr')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(origin + '/');
  if ((await page.evaluate(() => scrollY)) !== 0) throw Error('Closing the QR code moved the page');
  // The footer has no button for it (only a phone's header has one), and on a phone the header's
  // button opens it, and focus comes back to that one.
  if (await page.locator('.site-footer [data-opens="qr"]').count())
    throw Error('The footer opens the QR code');
  await page.setViewportSize({ width: 390, height: 664 });
  await page.locator('.header-qr').click();
  await expect(page.locator('#qr')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.header-qr')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The footer lists the profile's accounts (profile.json) and the feed.
  const footerLinks = await page
    .locator('.footer-links a')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  if (footerLinks.join() !== [...profile.links.map((l) => l.url), '/feed.xml'].join())
    throw Error(`Footer links ${footerLinks} are not profile.json's`);
  // A missing page offers the featured works, or every work for a missing work's address.
  await page.goto(origin + '/works/no-such-work');
  await expect(page.locator('.not-found-all a')).toHaveCount(mergeWorks(works, manual).length);
  await page.goto(origin + '/no-such-page');
  await expect(page.locator('.not-found-featured a')).toHaveCount(3);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const h1 = await page
      .locator('main h1')
      .evaluate((h) => [h.clientHeight, parseFloat(getComputedStyle(h).lineHeight)]);
    if (h1[0] > h1[1] * 1.5) throw Error(`The 404 heading wraps at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
    'navigation keeps the document and header; back/forward, reloads and other documents restore scroll, filters and focus; one sticker stream; history entries and the QR code open from their URLs; the footer is profile.json; a missing page offers the works',
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
  // One line says what signing in is for; once signed in it is gone.
  await expect(guest.locator('.sticker-hint')).toContainText('みんなに見えます');
  await guest.getByRole('button', { name: /^クローバー/ }).click();
  await expect(guest.locator('.stamp-overlay')).toHaveCount(0);
  await page.locator('.sticker-tab').click();
  await expect(page.locator('.account-avatar img')).toHaveAttribute(
    'src',
    /gravatar\.com\/avatar\/[0-9a-f]{64}/,
  );
  await axe('/#sticker-sheet');
  await expect(page.locator('.sticker-hint')).toHaveCount(0);
  // The sticker shows before the save answers.
  db.hold = new Promise<void>((resolve) => (release = resolve));
  await page.getByRole('button', { name: 'しーぴーのシールを貼る', exact: true }).click();
  const anchor = (await page.locator('[data-stamp-anchor=intro]').boundingBox())!;
  await page.mouse.click(anchor.x + anchor.width * 0.6, anchor.y + anchor.height * 0.45);
  await expect(page.locator('[data-pending=true]')).toHaveCount(1);
  release();
  await saved(page);
  await expect(page.locator('[data-pending=true]')).toHaveCount(0);
  db.hold = undefined;
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
  // A finger rested on it before swiping (a thumb while reading) still scrolls: a finger never
  // drags your sticker, so nothing moves or is saved.
  const restingAt = (await visitor.locator('.placed-stamp[data-owned]').boundingBox())!;
  await finger('touchStart', 190);
  await visitor.waitForTimeout(600);
  for (let y = 170; y >= 10; y -= 20) await finger('touchMove', y);
  await visitor.waitForTimeout(300);
  await finger('touchEnd');
  await expect.poll(() => visitor.evaluate(() => scrollY)).toBeGreaterThan(100);
  await expect(visitor.locator('.placed-stamp[data-lifted]')).toHaveCount(0);
  await visitor.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => visitor.evaluate(() => scrollY)).toBe(0);
  const restedAt = (await visitor.locator('.placed-stamp[data-owned]').boundingBox())!;
  if (Math.abs(restedAt.x - restingAt.x) > 1 || Math.abs(restedAt.y - restingAt.y) > 1)
    throw Error('A swipe after resting on your sticker moved it');
  if (db.writes !== writesBefore) throw Error('A swipe after resting on your sticker was saved');
  // A long press let go without moving opens the menu, as a tap does; peeling from it saves.
  await finger('touchStart', 190);
  await visitor.waitForTimeout(600);
  await finger('touchEnd');
  await expect(touchMenu).toBeVisible();
  if (db.writes !== writesBefore) throw Error('A long press without moving was saved');
  await touchMenu.getByRole('button', { name: 'はがす' }).tap();
  await expect(visitor.locator('.placed-stamp')).toHaveCount(0);
  await saved(visitor);
  await expect.poll(() => Object.keys(db.pages.get('home') || {}).length).toBe(0);
  passed(
    'touch: tap to place, swipes over your sticker scroll; its menu (44px, closed by a tap elsewhere or a scroll) moves and peels; a rest then swipe still scrolls; put back without clicking',
  );

  // Your sticker on a card that is a link: a tap opens its menu instead of following the link,
  // and peels it from there; a tap beside it still follows the link.
  await visitor.goto(origin + '/articles');
  await settle(visitor);
  const card = visitor.locator('a.article-row').nth(1);
  await card.scrollIntoViewIfNeeded();
  const cardBox = (await card.boundingBox())!;
  const onCard = { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height * 0.75 };
  // The sheet stays open from the page before.
  const heart = visitor.getByRole('button', { name: 'ハートのシールを貼る', exact: true });
  if (!(await heart.isVisible())) await visitor.locator('.sticker-tab').tap();
  await heart.tap();
  await visitor.touchscreen.tap(onCard.x, onCard.y);
  await saved(visitor);
  const onLink = (await visitor.locator('.placed-stamp[data-owned]').boundingBox())!;
  const articlesUrl = visitor.url();
  await visitor.touchscreen.tap(onLink.x + onLink.width / 2, onLink.y + onLink.height / 2);
  await expect(touchMenu).toBeVisible();
  await visitor.waitForTimeout(400);
  if (visitor.url() !== articlesUrl) throw Error('A tap on your sticker over a link followed the link');
  await touchMenu.getByRole('button', { name: 'はがす' }).tap();
  await expect(visitor.locator('.placed-stamp')).toHaveCount(0);
  await saved(visitor);
  await expect.poll(() => Object.keys(db.pages.get('articles') || {}).length).toBe(0);
  passed('touch: a tap on your sticker over a link card opens its menu and peels it, not the link');

  // ── The attendance card: one Tab stop the arrow keys walk, and taps that find a stamp ──
  {
    await page.goto(origin + '/articles');
    await settle();
    const stamps = page.locator('.attendance-stamp');
    await page.locator('.attendance-tab[aria-pressed="true"]').focus();
    await page.keyboard.press('Tab');
    await expect(stamps.first()).toBeFocused();
    await expect(stamps.first().locator('.attendance-tip')).toHaveCSS('opacity', '1');
    await page.keyboard.press('ArrowRight');
    await expect(stamps.nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement?.matches('.article-row:not([hidden])'))))
      throw Error('The card is more than one Tab stop');
    // The pointer cuts across from a stamp to the far corner of its slip (over the gap and the
    // days beside it) and the slip stays: a safe triangle keeps it on the stamp.
    for (const crowd of [false, true]) {
      const index = await stamps.evaluateAll(
        (all, crowd) => all.findIndex((s) => s.hasAttribute('data-crowd') === crowd),
        crowd,
      );
      if (index < 0) continue;
      const stamp = stamps.nth(index);
      const tip = stamp.locator('.attendance-tip');
      await stamp.evaluate((s) => s.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.mouse.move(10, 10);
      const at = (await stamp.boundingBox())!;
      const from = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
      await page.mouse.move(from.x, from.y, { steps: 2 });
      await expect(tip).toHaveCSS('opacity', '1');
      const slip = (await tip.boundingBox())!;
      const corners = [slip.x + 3, slip.x + slip.width - 3].flatMap((x) =>
        [slip.y + 3, slip.y + slip.height - 3].map((y) => ({ x, y })),
      );
      const far = corners.reduce((a, b) =>
        Math.hypot(b.x - from.x, b.y - from.y) > Math.hypot(a.x - from.x, a.y - from.y) ? b : a,
      );
      await page.mouse.move(far.x, far.y, { steps: 10 });
      await expect(tip).toHaveCSS('opacity', '1');
      if (!(await stamp.evaluate((s) => s.hasAttribute('data-open'))))
        throw Error(`The slip went on the way to its corner (${crowd ? 'a crowded day' : 'a day'})`);
    }
    // But the safe triangle does not hold a slip against the mouse going across to a stamp near
    // by (on the same month or the next, and not under the slip): that stamp's slip opens.
    {
      const near = await stamps.evaluateAll((all) => {
        const at = all.map((s) => s.getBoundingClientRect());
        const pairs: [number, number][] = [];
        at.forEach((a, i) =>
          at.forEach((b, j) => {
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (i !== j && d >= 20 && d <= 45) pairs.push([i, j]);
          }),
        );
        return pairs;
      });
      let tried = 0;
      for (const [i, j] of near) {
        if (tried === 8) break;
        const [from, to] = [stamps.nth(i), stamps.nth(j)];
        await from.evaluate((s) => s.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.mouse.move(10, 10);
        const a = (await from.boundingBox())!,
          b = (await to.boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 2 });
        await expect(from).toHaveAttribute('data-open', '');
        const target = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        if (await from.evaluate((s, t) => s.contains(document.elementFromPoint(t.x, t.y)), target)) continue;
        await page.mouse.move(target.x, target.y, { steps: 8 });
        await expect(to).toHaveAttribute('data-open', '', { timeout: 1000 });
        await expect(to.locator('.attendance-tip')).toHaveCSS('opacity', '1');
        await expect(from).not.toHaveAttribute('data-open');
        tried++;
      }
      if (tried < 3) throw Error(`Only ${tried} pairs of stamps near each other to try`);
    }
    await page.mouse.move(10, 10);
    // A finger a few pixels off a stamp (days are narrower than a fingertip) picks it and shows
    // its slip instead of following the link; a tap on the picked stamp follows it.
    const follows = () =>
      visitor.evaluate(() => {
        window.addEventListener(
          'click',
          (e) => {
            (window as any).__followed = !e.defaultPrevented;
            e.preventDefault();
          },
          { once: true },
        );
      });
    const lone = visitor.locator('.attendance-stamp').nth(
      await visitor.locator('.attendance-stamp').evaluateAll((all) => {
        const at = all.map((s) => s.getBoundingClientRect());
        return at.findIndex((a) => at.every((b) => a === b || Math.hypot(a.x - b.x, a.y - b.y) > 30));
      }),
    );
    await lone.evaluate((s) => s.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const spot = (await lone.boundingBox())!;
    await follows();
    await visitor.touchscreen.tap(spot.x + spot.width / 2 + 7, spot.y + spot.height / 2 + 6);
    await expect(lone).toHaveAttribute('data-picked', '');
    if (await visitor.evaluate(() => (window as any).__followed)) throw Error('A tap by a stamp opened it');
    await follows();
    await visitor.touchscreen.tap(spot.x + spot.width / 2, spot.y + spot.height / 2);
    if (!(await visitor.evaluate(() => (window as any).__followed)))
      throw Error('A tap on the picked stamp did not open it');
    await visitor.locator('main h1').tap();
    await expect(visitor.locator('[data-picked]')).toHaveCount(0);
  }
  passed(
    'the attendance card is one Tab stop walked by arrows; the pointer reaches any corner of a slip, yet going to a stamp near by opens its slip; a tap near a stamp picks it, a second opens it',
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
      at(document.querySelector('.attendance-tab[aria-pressed="false"]')),
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
  // The year's tab under the first sticker, found by its year (it is pressed once clicked).
  const under = (await page.locator('.attendance-tab[aria-pressed="false"]').first().textContent())!;
  const onYear = (await page.locator('.placed-stamp').nth(0).boundingBox())!;
  await page.mouse.click(onYear.x + 23, onYear.y + 23);
  await expect(
    page.locator('.attendance-tab').filter({ hasText: new RegExp(`^${under.slice(0, 4)}`) }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  db.pages.delete('articles');
  await expect(page.locator('.placed-stamp')).toHaveCount(0);
  passed(
    "other visitors' stickers pass clicks and modifier clicks through, keep off the index tabs, and show their avatar",
  );

  // ── Another year cross-fades the rows, and their stickers with them ──
  await page.goto(origin + '/articles');
  await settle();
  // A sticker on the first row, which fades out where it is with its row.
  const first = (await page
    .locator('[data-article]:not([hidden])')
    .first()
    .getAttribute('data-stamp-anchor'))!;
  db.pages.set('articles', {
    'other-visitor': {
      avatar: 'b'.repeat(64),
      stamps: { 0: { anchor: first, x: 0.3, y: 0.3, kind: 1, angle: 0, createdAt: 1700000000000 } },
    },
  });
  await expect(page.locator('.placed-stamp')).toHaveCount(1);
  const fade = page.evaluate(
    (anchor) =>
      new Promise<{ row: boolean; sticker: boolean; drift: number; shifts: number }>((resolve) => {
        const card = document.querySelector<HTMLElement>(`[data-stamp-anchor="${anchor}"]`)!;
        const sticker = document.querySelector<HTMLElement>('.placed-stamp')!;
        const offset = () => {
          const a = sticker.getBoundingClientRect(),
            b = card.getBoundingClientRect();
          return [a.left - b.left, a.top - b.top];
        };
        const [x0, y0] = offset();
        const midway = (el: HTMLElement) => {
          const o = Number(getComputedStyle(el).opacity);
          return o > 0.05 && o < 0.95;
        };
        let row = false,
          faded = false,
          drift = 0,
          shifts = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean })[])
            if (!e.hadRecentInput) shifts++;
        }).observe({ type: 'layout-shift' });
        const t0 = performance.now();
        const step = () => {
          row ||= midway(card);
          faded ||= sticker.isConnected && midway(sticker);
          if (card.classList.contains('leaving') && sticker.isConnected) {
            const [x, y] = offset();
            drift = Math.max(drift, Math.abs(x - x0), Math.abs(y - y0));
          }
          if (performance.now() - t0 < 500) requestAnimationFrame(step);
          else resolve({ row, sticker: faded, drift, shifts });
        };
        requestAnimationFrame(step);
      }),
    first,
  );
  await page.locator('.attendance-tab[aria-pressed="false"]').last().click();
  const result = await fade;
  if (!result.row || !result.sticker)
    throw Error(`Another year did not fade the row and its sticker: ${JSON.stringify(result)}`);
  if (result.drift > 2) throw Error(`A sticker came off its fading row by ${result.drift}px`);
  if (result.shifts) throw Error('Another year shifted the layout');
  if (await page.locator('.article-row.leaving').count()) throw Error('A row was left fading');
  // Years chosen in quick succession carry each row on from where it is: at the moment of a
  // choice no row on screen moves or grows brighter (one caught fading out never flashes back
  // over another), at full speed and on a slow phone's CPU alike.
  const glitches: string[] = [];
  const recent = (await page.locator('.attendance-tab').allTextContents())
    .map((t) => t.slice(0, 4))
    .slice(-3);
  const cpu = await context.newCDPSession(page);
  for (const rate of [1, 4]) {
    await cpu.send('Emulation.setCPUThrottlingRate', { rate });
    for (let i = 0; i < 3; i++)
      for (const year of recent) {
        glitches.push(
          ...(await page.evaluate((year) => {
            const look = () =>
              new Map(
                [...document.querySelectorAll<HTMLElement>('.article-list > .article-row')].map((r) => {
                  const b = r.getBoundingClientRect();
                  const o =
                    r.hidden && !r.classList.contains('leaving') ? 0 : Number(getComputedStyle(r).opacity);
                  return [r, { x: b.left, y: b.top, o, on: b.bottom > 0 && b.top < innerHeight }];
                }),
              );
            const was = look();
            [...document.querySelectorAll<HTMLElement>('.attendance-tab')]
              .find((t) => t.textContent!.startsWith(year))!
              .click();
            const out: string[] = [];
            for (const [row, now] of look()) {
              const then = was.get(row)!;
              if (!now.on && !then.on) continue;
              if (then.o > 0.05 && now.o > 0.05 && Math.hypot(now.x - then.x, now.y - then.y) > 2)
                out.push(
                  `${year}: a row jumped by ${Math.round(Math.hypot(now.x - then.x, now.y - then.y))}px`,
                );
              if (now.o - then.o > 0.05)
                out.push(`${year}: a row brightened ${then.o.toFixed(2)}→${now.o.toFixed(2)}`);
            }
            return out;
          }, year)),
        );
        await page.waitForTimeout(120);
      }
  }
  await cpu.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(600);
  if (glitches.length) throw Error(`Quick choices in a row: ${glitches.slice(0, 5).join('; ')}`);
  if (await page.locator('.article-row.leaving').count()) throw Error('A row was left fading');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.attendance-tab').first().click();
  const scripted = () =>
    document
      .querySelector('.article-list')!
      .getAnimations({ subtree: true })
      .filter((a) => !(a instanceof CSSTransition || a instanceof CSSAnimation)).length;
  if (await page.evaluate(scripted)) throw Error('Another year animated with reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  db.pages.delete('articles');
  await expect(page.locator('.placed-stamp')).toHaveCount(0);
  passed(
    'another year cross-fades the rows with their stickers and shifts nothing, also chosen quickly in a row; reduced motion switches at once',
  );

  // ── The keyboard, and saves that fail ──
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  if (
    (await page.locator('.home-hello .avatar-stamp').evaluate((el) => getComputedStyle(el).animationName)) !==
    'none'
  )
    throw Error('Reduced motion');
  db.down = true;
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
  db.down = false;
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
  db.down = true;
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(page.locator('.stamp-status')).toContainText('保存できませんでした', { timeout: 20000 });
  await expect(own).toHaveCount(1);
  db.down = false;
  await page.getByRole('button', { name: '最後に貼ったシールをはがす', exact: true }).click();
  await expect(own).toHaveCount(0);
  await saved(page);
  await page.emulateMedia({ reducedMotion: null });
  passed(
    'keyboard placement with focus return and spoken results; failed saves and peels are undone and said; reduced motion',
  );

  // ── Without JavaScript every article and the featured works are there ──
  // With JavaScript the list shows one year at a time (the other rows stay in it, hidden);
  // without, the open year cannot change, so every row is shown.
  await page.goto(origin + '/articles');
  const allArticles = await page.locator('[data-article]').count();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await nojs.newPage();
  await plain.goto(origin + '/articles');
  await expect(plain.locator('[data-article]:visible')).toHaveCount(allArticles);
  await plain.goto(origin + '/');
  await expect(plain.locator('.work-cards-large .work-card-link:visible')).toHaveCount(3);
  await expect(plain.locator('.highlights a:visible')).toHaveCount(4);
  await nojs.close();
  passed('complete static content without JavaScript');

  // ── Every `sizes` is at least the width its image is laid out at (src/components/Preview.tsx) ──
  await page.goto(origin + '/works');
  const workPage = (await page.locator('a[href^="/works/"]').first().getAttribute('href'))!;
  for (const width of [360, 380, 450, 600, 760, 761, 900, 901, 1100, 1101, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/', '/articles', '/works', '/about', workPage]) {
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

  // ── Works: a featured card's open button is its own link and names where it goes; the cards
  // show OG images ──
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/works');
  await settle();
  const open = page.locator('[data-stamp-anchor="work-dice-spec-v2"] .work-card-open');
  const openBox = (await open.boundingBox())!;
  const underOpen = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href'),
    [openBox.x + openBox.width / 2, openBox.y + openBox.height / 2],
  );
  if (underOpen !== (await open.getAttribute('href')))
    throw Error(`The open button is covered: ${underOpen}`);
  // The button says where it goes (the site's host, or the repository's path, with its icon); the
  // card's own link, to the work's page, ends in a chevron.
  const destinations = await page
    .locator('.work-cards-large .work-card-open')
    .evaluateAll((links) => links.map((a) => [a.textContent, !!a.querySelector('img')]));
  if (
    JSON.stringify(destinations.slice(0, 2)) !==
    JSON.stringify([
      ['dicespec.app', true],
      ['cp-20/c-compiler', true],
    ])
  )
    throw Error(`The featured cards' buttons say ${JSON.stringify(destinations)}`);
  if (
    (await page.locator('.work-card-link .work-card-chevron').count()) !==
    (await page.locator('.work-card').count())
  )
    throw Error('A card link has no chevron');
  // Every card shows the work's own OG image (from the cache in /media), but the compiler's, whose
  // OG image is only its name, shows the picture committed for it (works.json `image`).
  await page
    .locator('[data-stamp-anchor="work-c-compiler"] .work-card-picture img')
    .evaluate((img: HTMLImageElement) => img.decode());
  if (
    !(await page
      .locator('[data-stamp-anchor="work-c-compiler"] .work-card-picture img')
      .evaluate((img: HTMLImageElement) => img.currentSrc.includes('/images/works/c-compiler')))
  )
    throw Error("The compiler's card does not show its picture");
  const fetched = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => e.name.replace(location.origin, '')),
  );
  if (fetched.some((url) => url.startsWith('/images/screenshots/')))
    throw Error('The works list downloaded a screenshot; its cards show OG images');
  for (const path of ['/works', '/works/dice-spec-v2']) {
    await page.goto(origin + path);
    await animationsDone();
    const small = await page
      .locator('main :is(.work-card-open, .text-button, .repo-link, .back-link, .primary-button)')
      .evaluateAll((links) =>
        links.filter((a) => a.getBoundingClientRect().height < 44).map((a) => a.textContent),
      );
    if (small.length) throw Error(`Links under 44px on ${path}: ${small}`);
  }
  passed(
    'a work card opens its page from anywhere but its open button, which names where it goes; cards show OG images, not screenshots; 44px links',
  );

  // ── Pages swapped out and the rows of other years are released ──
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
          .locator('.attendance-tab')
          .nth(i % 2 ? -1 : -2)
          .click();
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
  passed("swapped-out pages and other years' rows are released from memory");

  for (const [width, height, suffix] of [
    [390, 844, 'mobile'],
    [1440, 1000, 'desktop'],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const route of ['/', '/articles', '/works', '/works/dice-spec-v2', '/about']) {
      await page.goto(origin + route);
      await settle();
      if (width === 390) await axe(`${route}?mobile`);
      const name = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-');
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
