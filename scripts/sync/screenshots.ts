// npm run screenshots: photographs the public sites of the works whose `screenshots` works.json
// lists, as public/images/screenshots/<id>-<device>.png, then writes their WebP copies (the same
// `<name>-<width>w.webp` copies as the covers, see images.ts). Run by hand when a site changes;
// the scheduled sync does not open a browser. Only reads the sites: it types into a form that is
// computed in the page, and never submits anything.
import { chromium, devices, type Page } from '@playwright/test';
import { readFile, readdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { addCommittedVariants } from './images.ts';

type Shot = { src: string; device: 'pc' | 'mobile'; alt: string };
/** The part of a page a desktop picture shows: from `top` to `bottom`, centred on `centerX`. */
type Frame = { top: number; bottom: number; centerX: number };
/**
 * `width`: the desktop layout photographed, scaled to 1280px (a wider one fits more in).
 * `frame`: the part of it the picture is cut to (16:9), so a card a few hundred pixels wide still
 * shows the work's own figures and words rather than a page of small text.
 * `crop`: for a work with no site to photograph, the part of a published picture of it to keep.
 */
type Recipe =
  | {
      url: string;
      width?: number;
      prepare?: (page: Page) => Promise<void>;
      frame?: (page: Page) => Promise<Frame>;
    }
  | { image: string; crop: { left: number; top: number; width: number; height: number } };

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
    // 3D6 worked out: the formula, its figures and the probability chart.
    pc: {
      url: 'https://dicespec.app/expect',
      width: 1600,
      prepare: (page) => expectation(page),
      frame: async (page) => {
        const input = await box(page.getByPlaceholder('計算式を入力してください'));
        const button = await box(page.getByRole('button', { name: '計算', exact: true }));
        const chart = await page.evaluate(() => {
          const largest = [...document.querySelectorAll('svg, canvas')]
            .map((e) => e.getBoundingClientRect())
            .sort((a, b) => b.width * b.height - a.width * a.height)[0];
          return largest?.bottom;
        });
        if (!chart) throw Error('No chart on the dice page');
        return { top: input.y - 28, bottom: chart + 16, centerX: (input.x + button.x + button.width) / 2 };
      },
    },
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
    // The question it asks and the topics under it.
    pc: {
      url: 'https://minna-no-monosashi.lolipop-now.app/',
      frame: async (page) => {
        const heading = await box(page.getByText('あなたなら', { exact: false }).first());
        const more = await box(page.getByText('もっと見る').first());
        return { top: heading.y - 30, bottom: more.y - 10, centerX: heading.x + heading.width / 2 };
      },
    },
    // A topic as it is answered on a phone: with the number pad.
    mobile: { url: 'https://minna-no-monosashi.lolipop-now.app/q/18' },
  },
  // A compiler has no site: the editor in the screenshot that heads its write-up
  // (https://trap.jp/post/2313/), the code that turns a for statement into LLVM IR, without the
  // post around it.
  'c-compiler': {
    pc: {
      image: 'https://trap.jp/content/images/2024/08/1000015504.png',
      crop: { left: 160, top: 222, width: 800, height: 450 },
    },
  },
};

const box = async (locator: ReturnType<Page['locator']>) => {
  const b = await locator.boundingBox();
  if (!b) throw Error(`Nothing to frame: ${locator}`);
  return b;
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
        const file = new URL(`../../public${shot.src}`, import.meta.url).pathname;
        const framed = 'url' in recipe && recipe.frame;
        const context = await browser.newContext(
          shot.device === 'mobile'
            ? phone
            : 'image' in recipe
              ? {}
              : // A framed part is taken at twice the size and scaled down to 1280px.
                { ...desktop(recipe.width), ...(framed && { deviceScaleFactor: 2 }) },
        );
        const page = await context.newPage();
        if ('image' in recipe) {
          // Through the browser, which goes through the proxy like the sites do.
          const response = await page.goto(recipe.image, { timeout: 60000 });
          if (!response?.ok()) throw Error(`${recipe.image}: ${response?.status()}`);
          await sharp(await response.body())
            .extract(recipe.crop)
            .png()
            .toFile(file);
        } else {
          await page.goto(recipe.url, { waitUntil: 'networkidle', timeout: 60000 });
          await recipe.prepare?.(page);
          await page.evaluate(() => document.fonts.ready);
          // Entrance animations and lazy images settle.
          await page.waitForTimeout(1500);
          if (recipe.frame) {
            const { top, bottom, centerX } = await recipe.frame(page);
            const width = Math.round(((bottom - top) * 16) / 9);
            const clip = {
              x: Math.round(centerX - width / 2),
              y: Math.round(top),
              width,
              height: (width * 9) / 16,
            };
            await sharp(await page.screenshot({ clip }))
              .resize(1280, 720)
              .png()
              .toFile(file);
          } else await page.screenshot({ path: file });
        }
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
