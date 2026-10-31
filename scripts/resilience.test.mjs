import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  reconnectDelay,
  deadline,
  TimeoutError,
  readPositions,
  writePositions,
} from '../src/data/resilience.mjs';
import { dropWoffFallback, isFontFile } from '../src/data/font-css.mjs';

test('a closed sticker stream is retried with a capped exponential backoff', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelay),
    [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000],
  );
  assert.equal(reconnectDelay(-1), 2000);
});

test('the client reopens streams EventSource gave up on and keeps stream errors apart', async () => {
  const client = await readFile(new URL('../src/stamps-client.ts', import.meta.url), 'utf8');
  assert.match(client, /readyState !== EventSource\.CLOSED/);
  assert.match(client, /setTimeout\(resume, reconnectDelay\(/);
  assert.match(client, /addEventListener\('online'/);
  const stamps = await readFile(new URL('../src/components/Stamps.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(stamps, /setMessage\('シールに接続/);
});

test('a hung step is given up after the deadline, a finished one passes through', async () => {
  await assert.rejects(deadline(new Promise(() => {}), 20), TimeoutError);
  await assert.rejects(deadline(new Promise(() => {}), 20), (e) => e.code === 'timeout');
  assert.equal(await deadline(Promise.resolve(7), 20), 7);
  const failure = Error('denied');
  await assert.rejects(deadline(Promise.reject(failure), 20), (e) => e === failure);
});

test('the deadline stops counting once the popup has opened', async () => {
  let finish;
  const work = new Promise((resolve) => (finish = resolve));
  const result = deadline(work, 20, Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 60));
  finish('signed in');
  assert.equal(await result, 'signed in');
});

test('scroll positions round-trip through storage and drop malformed entries', () => {
  const positions = new Map([
    ['a', [0, 2500]],
    ['b', [10, 20]],
  ]);
  assert.deepEqual(readPositions(writePositions(positions)), positions);
  for (const raw of [null, '', '{', '{}', '"x"', '[[1,[0,0]],["c",[0]],["d",[0,-1]],["e",["1",2]]]'])
    assert.equal(readPositions(raw).size, 0, String(raw));
  const many = new Map(Array.from({ length: 80 }, (_, i) => [`k${i}`, [0, i]]));
  const kept = readPositions(writePositions(many));
  assert.equal(kept.size, 50);
  assert.deepEqual(kept.get('k79'), [0, 79]);
  assert.equal(kept.has('k0'), false);
});

test('font stylesheets keep only WOFF2 and fonts are never inlined', async () => {
  const css = await readFile(
    new URL('../node_modules/@fontsource/zen-maru-gothic/500.css', import.meta.url),
    'utf8',
  );
  const out = dropWoffFallback(css);
  assert.equal(out.match(/@font-face/g).length, css.match(/@font-face/g).length);
  assert.equal(out.match(/format\('woff2'\)/g).length, css.match(/format\('woff2'\)/g).length);
  assert.doesNotMatch(out, /format\('woff'\)/);
  // A WOFF-only rule is left alone.
  const only = "@font-face{src:url(./a.woff) format('woff');}";
  assert.equal(dropWoffFallback(only), only);
  assert.ok(isFontFile('/x/zen-maru-gothic-10-500-normal.woff2'));
  assert.ok(isFontFile('a.woff?v=1'));
  assert.ok(!isFontFile('/images/avatar.png'));
});

test('print and no-script styles reveal content and hide controls that cannot work', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  // The scroll-driven reveal starts transparent, so it must not apply to printed pages.
  const reveal = css.indexOf('animation-timeline: view()');
  const screen = css.lastIndexOf('@media screen', reveal);
  assert.ok(screen > 0 && !css.slice(screen, reveal).includes('\n  }\n'), 'view() reveal is screen-only');
  const print = css.slice(css.indexOf('@media print'));
  for (const selector of ['.skip-link', '.stamp-ui', '.stamp-layer']) assert.ok(print.includes(selector));
  const noScript = css.slice(css.indexOf('@media (scripting: none)'));
  for (const selector of ['.source-filters', '.sort-control', '.featured-selector', '.featured-bottom'])
    assert.ok(noScript.includes(selector));
});
