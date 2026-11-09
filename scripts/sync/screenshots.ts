// npm run screenshots: photographs the public sites of the works whose `screenshots` works.json
// lists, as public/images/screenshots/<id>-<device>.png, then writes their WebP copies (the same
// `<name>-<width>w.webp` copies as the covers, see images.ts). Run by hand when a site changes;
// the scheduled sync does not open a browser. Only reads the sites: it types into a form that is
// computed in the page, and never submits anything.
import { chromium, devices, type Page } from '@playwright/test';
import { readFile, readdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { addCommittedVariants } from './images.ts';

type Shot = { src: string; device: 'pc' | 'mobile'; alt: string };
/** `width`: the desktop layout photographed, scaled to 1280px (a wider one fits more in). */
type Recipe = { url: string; width?: number; prepare?: (page: Page) => Promise<void> };

/** A desktop window `width` px wide, saved at 1280×720 (16:9, the frame of the work cards). */
const desktop = (width = 1280) => ({
  viewport: { width, height: Math.round((width * 9) / 16) },
  deviceScaleFactor: 1280 / width,
});
const phone = { ...devices['iPhone 13'], deviceScaleFactor: 2 };
const directory = new URL('../../public/images/screenshots/', import.meta.url);

// What each screenshot shows: the screen that tells what the work does.
const recipes: Record<string, Partial<Record<Shot['device'], Recipe>>> = {
  'dice-spec-v2': {
    pc: { url: 'https://dicespec.app/expect', width: 1600, prepare: (page) => expectation(page) },
    mobile: {
      url: 'https://dicespec.app/expect',
      prepare: async (page) => {
        await expectation(page);
        // The figures and the distribution chart, which fill a phone screen together.
        const figures = await page.getByText('確率', { exact: true }).first().boundingBox();
        if (figures) await page.evaluate((y) => window.scrollTo(0, y), figures.y - 28);
      },
    },
  },
  'minna-no-monosashi': {
    pc: { url: 'https://minna-no-monosashi.lolipop-now.app/' },
    // A topic as it is answered on a phone: with the number pad.
    mobile: { url: 'https://minna-no-monosashi.lolipop-now.app/q/18' },
  },
};

/** The dice expectation page with 3D6 worked out: its figures and probability chart. */
async function expectation(page: Page) {
  await page.getByPlaceholder('計算式を入力してください').fill('3D6');
  await page.getByRole('button', { name: '計算', exact: true }).click();
  // The mean of 3D6 in the figures.
  await page.waitForFunction(() => document.body.innerText.includes('10.5'));
}

async function main() {
  const works: { id: string; screenshots?: Shot[] }[] = JSON.parse(
    await readFile(new URL('../../src/data/works.json', import.meta.url), 'utf8'),
  );
  const proxy = process.env.HTTPS_PROXY;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    for (const work of works)
      for (const shot of work.screenshots ?? []) {
        const recipe = recipes[work.id]?.[shot.device];
        if (!recipe) throw Error(`No recipe for ${work.id} (${shot.device})`);
        if (shot.src !== `/images/screenshots/${work.id}-${shot.device}.png`)
          throw Error(`${work.id}: name the file /images/screenshots/${work.id}-${shot.device}.png`);
        const context = await browser.newContext(shot.device === 'pc' ? desktop(recipe.width) : phone);
        const page = await context.newPage();
        await page.goto(recipe.url, { waitUntil: 'networkidle', timeout: 60000 });
        await recipe.prepare?.(page);
        await page.evaluate(() => document.fonts.ready);
        // Entrance animations and lazy images settle.
        await page.waitForTimeout(1500);
        await page.screenshot({ path: new URL(`../../public${shot.src}`, import.meta.url).pathname });
        // Its copies are named after it, so the old ones are removed to be written again.
        const stem = shot.src
          .split('/')
          .at(-1)!
          .replace(/\.png$/, '');
        for (const name of await readdir(directory))
          if (new RegExp(`^${stem}-\\d+w\\.webp$`).test(name)) await rm(new URL(name, directory));
        await context.close();
        console.log(`Screenshot: ${shot.src}`);
      }
  } finally {
    await browser.close();
  }
  console.log(`Screenshot variants: ${await addCommittedVariants('/images/screenshots/')} written`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
