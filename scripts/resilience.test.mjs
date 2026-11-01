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
import { keepStream } from '../src/data/stamp-stream.mjs';

test('a closed sticker stream is retried with a capped exponential backoff', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelay),
    [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000],
  );
  assert.equal(reconnectDelay(-1), 2000);
});

// A fake browser for keepStream: EventSources that the test opens, errors and closes by hand,
// and timers that only run when the test moves the clock.
function fakeBrowser() {
  const sources = [],
    timers = new Map();
  let now = 0,
    nextTimer = 0;
  class FakeSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    listeners = {};
    constructor(url) {
      this.url = url;
      sources.push(this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    emit(type, data) {
      for (const fn of this.listeners[type] || []) fn({ data: JSON.stringify(data) });
    }
    close() {
      this.readyState = 2;
    }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const env = {
    EventSource: FakeSource,
    document: doc,
    window: new EventTarget(),
    setTimeout: (fn, ms) => (timers.set(++nextTimer, { fn, at: now + ms }), nextTimer),
    clearTimeout: (id) => timers.delete(id),
  };
  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      const [id, due] =
        [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0] || [];
      if (!due) break;
      timers.delete(id);
      now = due.at;
      due.fn();
    }
    now = until;
  };
  const open = () => sources.filter((s) => s.readyState !== 2);
  return { env, sources, open, advance, doc };
}
function watch(browser) {
  const seen = { restarts: 0, events: [], failures: 0 };
  const stop = keepStream(
    'https://db.example/pages/home.json',
    {
      restart: () => seen.restarts++,
      receive: (type, e) => seen.events.push([type, JSON.parse(e.data)]),
      fail: () => seen.failures++,
    },
    browser.env,
  );
  return { seen, stop };
}

test('a stream EventSource closed for good is reopened with a backoff, and put resets it', () => {
  const browser = fakeBrowser();
  const { seen } = watch(browser);
  assert.equal(browser.sources.length, 1);
  const first = browser.sources[0];
  first.close();
  first.onerror();
  assert.equal(seen.failures, 1);
  assert.equal(browser.open().length, 0);
  browser.advance(1999);
  assert.equal(browser.sources.length, 1, 'not before the first delay');
  browser.advance(1);
  assert.equal(browser.sources.length, 2, 'reopened after 2s');
  browser.sources[1].close();
  browser.sources[1].onerror();
  browser.advance(3999);
  assert.equal(browser.sources.length, 2, 'the second delay is longer');
  browser.advance(1);
  assert.equal(browser.sources.length, 3);
  // A delivered snapshot means the stream works again: the next loss waits 2s, not 8s.
  browser.sources[2].emit('put', { path: '/', data: {} });
  assert.deepEqual(seen.events, [['put', { path: '/', data: {} }]]);
  browser.sources[2].close();
  browser.sources[2].onerror();
  browser.advance(2000);
  assert.equal(browser.sources.length, 4);
  // A cancelled listener closes the stream and is retried the same way (no put since: 4s).
  browser.sources[3].emit('cancel', null);
  assert.equal(browser.open().length, 0);
  browser.advance(3999);
  assert.equal(browser.open().length, 0);
  browser.advance(1);
  assert.equal(browser.open().length, 1);
});

test('a stream the browser is still reconnecting is only reported once it stalls', () => {
  const browser = fakeBrowser();
  const { seen } = watch(browser);
  const source = browser.sources[0];
  source.readyState = 0;
  source.onerror();
  assert.equal(seen.failures, 0, 'a transient drop is not reported');
  browser.advance(7999);
  assert.equal(seen.failures, 0);
  browser.advance(1);
  assert.equal(seen.failures, 1, 'reported after the stall timeout');
  assert.equal(browser.sources.length, 1, 'the browser keeps reconnecting by itself');
  source.onerror();
  source.readyState = 1;
  source.onopen();
  browser.advance(10000);
  assert.equal(seen.failures, 1, 'an opened stream clears the stall timer');
});

test('coming back online reconnects at once, hiding closes the stream and stop cleans up', () => {
  const browser = fakeBrowser();
  const { seen, stop } = watch(browser);
  browser.sources[0].close();
  browser.sources[0].onerror();
  browser.env.window.dispatchEvent(new Event('online'));
  assert.equal(browser.open().length, 1, 'reopened without waiting for the backoff');
  browser.advance(60000);
  assert.equal(browser.sources.length, 2, 'the pending retry was cancelled');
  browser.doc.hidden = true;
  browser.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(browser.open().length, 0, 'a hidden page holds no stream');
  browser.doc.hidden = false;
  browser.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(browser.open().length, 1);
  const restarts = seen.restarts;
  stop();
  assert.equal(browser.open().length, 0);
  assert.equal(seen.restarts, restarts + 1, 'stop drops a pending render');
  browser.env.window.dispatchEvent(new Event('online'));
  browser.doc.dispatchEvent(new Event('visibilitychange'));
  browser.advance(60000);
  assert.equal(browser.open().length, 0, 'nothing reopens after stop');
});

test('stream errors are not shown as a connection message', async () => {
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
  for (const selector of [
    '.skip-link',
    '.stamp-ui',
    '.stamp-layer',
    '.featured-selector',
    '.featured-bottom',
  ])
    assert.ok(print.includes(selector));
  // Every featured work is printed, not only the one selected on screen.
  assert.match(print, /\.featured-project \{[^}]*visibility: visible;[^}]*opacity: 1;/);
  const noScript = css.slice(css.indexOf('@media (scripting: none)'));
  for (const selector of ['.source-filters', '.sort-control', '.featured-selector', '.featured-bottom'])
    assert.ok(noScript.includes(selector));
});
