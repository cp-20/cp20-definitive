// The public sticker stream: applying Firebase's events, rendering bursts, and keeping it open.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { applyStreamEvent, coalesce, keepStream, RETRY_MS } from './stream.ts';

describe('applyStreamEvent', () => {
  test('ルートへの put は全体を置き換える', () => {
    const rows = applyStreamEvent({ stale: {} }, 'put', { path: '/', data: { alice: { n: 1 } } });
    assert.deepEqual(rows, { alice: { n: 1 } });
  });

  test('ルートへの null の put は空にする', () => {
    assert.deepEqual(applyStreamEvent({ stale: {} }, 'put', { path: '/', data: null }), {});
  });

  test('深いパスへの put はその値だけを置き換える', () => {
    const rows = applyStreamEvent({ alice: { stamps: { 0: 'a', 1: 'b' } } }, 'put', {
      path: '/alice/stamps/0',
      data: 'c',
    });
    assert.deepEqual(rows, { alice: { stamps: { 0: 'c', 1: 'b' } } });
  });

  test('null の put はそのキーを消す', () => {
    const rows = applyStreamEvent({ alice: { n: 1 }, bob: { n: 2 } }, 'put', { path: '/alice', data: null });
    assert.deepEqual(rows, { bob: { n: 2 } });
  });

  test('patch は相対パスごとに書き換える', () => {
    const rows = applyStreamEvent({ alice: { stamps: { 0: { x: 0.2 } } } }, 'patch', {
      path: '/alice',
      data: { 'stamps/0/x': 0.4, 'stamps/1': { x: 0.8 } },
    });
    assert.deepEqual(rows, { alice: { stamps: { 0: { x: 0.4 }, 1: { x: 0.8 } } } });
  });

  test('__proto__ を含むパスは拒み、プロトタイプを汚さない', () => {
    assert.throws(() => applyStreamEvent({}, 'patch', { path: '/', data: { '__proto__/polluted': true } }));
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

// Timers and the monotonic clock only move when a test moves them.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const advance = (ms: number) => vi.advanceTimersByTime(ms);

describe('coalesce', () => {
  test('静かなあとの最初のイベントは、次のティックで描く', () => {
    const run = vi.fn();
    coalesce(run, 250).schedule();
    advance(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('間隔内に何度呼ばれても、描くのは1回', () => {
    const run = vi.fn();
    const render = coalesce(run, 250);
    advance(1000);
    render.schedule();
    render.schedule();
    render.schedule();
    advance(250);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('続けて届くイベントは、間隔ごとに1回描く', () => {
    const run = vi.fn();
    const render = coalesce(run, 250);
    render.schedule();
    advance(0);
    render.schedule();
    advance(249);
    expect(run).toHaveBeenCalledTimes(1);
    advance(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('取り消した描画は実行しない', () => {
    const run = vi.fn();
    const render = coalesce(run, 250);
    render.schedule();
    render.cancel();
    advance(1000);
    expect(run).not.toHaveBeenCalled();
  });

  test('時計が巻き戻っても、待つのは最大で1間隔', () => {
    const run = vi.fn();
    const render = coalesce(run, 250);
    render.schedule();
    advance(0);
    vi.spyOn(performance, 'now').mockReturnValue(-3600000);
    render.schedule();
    advance(250);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

// A fake EventSource that the test errors and closes by hand, and a document whose visibility
// the test changes; keepStream finds both as globals, as in the browser.
function fakeBrowser() {
  const sources: FakeSource[] = [];
  class FakeSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    readyState = 0;
    listeners: Record<string, ((e: { data: string }) => void)[]> = {};
    onerror: () => void = () => {};
    url: string;
    constructor(url: string) {
      this.url = url;
      sources.push(this);
    }
    addEventListener(type: string, fn: (e: { data: string }) => void) {
      (this.listeners[type] ||= []).push(fn);
    }
    emit(type: string, data: unknown) {
      for (const fn of this.listeners[type] || []) fn({ data: JSON.stringify(data) });
    }
    close() {
      this.readyState = 2;
    }
    // The browser gives up on this stream (an HTTP error, a wrong content type).
    fail() {
      this.close();
      this.onerror();
    }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('EventSource', FakeSource);
  vi.stubGlobal('document', doc);
  const seen = { restarts: 0, events: [] as unknown[], failures: 0 };
  const stop = keepStream('https://db.example/pages/home.json', {
    restart: () => seen.restarts++,
    receive: (type, e) => seen.events.push([type, JSON.parse(e.data)]),
    fail: () => seen.failures++,
  });
  const open = () => sources.filter((s) => s.readyState !== 2);
  const latest = () => sources.at(-1)!;
  const setHidden = (hidden: boolean) => {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { sources, open, latest, advance, seen, stop, setHidden };
}

describe('keepStream', () => {
  test('開くとすぐにストリームを1本開く', () => {
    const browser = fakeBrowser();
    assert.equal(browser.open().length, 1);
  });

  test('届いたイベントを種類つきで渡す', () => {
    const browser = fakeBrowser();
    browser.latest().emit('put', { path: '/', data: {} });
    assert.deepEqual(browser.seen.events, [['put', { path: '/', data: {} }]]);
  });

  test('ブラウザが諦めたストリームは、失敗を伝える', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    assert.equal(browser.seen.failures, 1);
  });

  test(`ブラウザが諦めたストリームは、${RETRY_MS}ms たってから開き直す`, () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.advance(RETRY_MS - 1);
    assert.equal(browser.open().length, 0);
    browser.advance(1);
    assert.equal(browser.open().length, 1);
  });

  test('cancel されたストリームも、閉じて失敗を伝える', () => {
    const browser = fakeBrowser();
    browser.latest().emit('cancel', null);
    assert.deepEqual([browser.open().length, browser.seen.failures], [0, 1]);
  });

  test('ブラウザが自分でつなぎ直している間は、失敗を伝えず開き直しもしない', () => {
    const browser = fakeBrowser();
    browser.latest().onerror();
    browser.advance(RETRY_MS * 10);
    assert.deepEqual([browser.seen.failures, browser.sources.length], [0, 1]);
  });

  test('ページが隠れている間はストリームを閉じ、見えたら開き直す', () => {
    const browser = fakeBrowser();
    browser.setHidden(true);
    assert.equal(browser.open().length, 0);
    browser.setHidden(false);
    assert.equal(browser.open().length, 1);
  });

  test('開き直したあとに古いストリームから届いたエラーは無視する', () => {
    const browser = fakeBrowser();
    const first = browser.latest();
    browser.setHidden(true);
    browser.setHidden(false);
    first.fail();
    browser.advance(RETRY_MS);
    assert.deepEqual([browser.seen.failures, browser.open().length, browser.sources.length], [0, 1, 2]);
  });

  test('隠れている間は、待っていた開き直しもしない', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.setHidden(true);
    browser.advance(RETRY_MS);
    assert.equal(browser.sources.length, 1);
  });

  test('止めたら閉じて、restart を1回呼ぶ（待っている描画を取り消すため）', () => {
    const browser = fakeBrowser();
    const restarts = browser.seen.restarts;
    browser.stop();
    assert.deepEqual([browser.open().length, browser.seen.restarts], [0, restarts + 1]);
  });

  test('止めたあとは、何があっても開き直さない', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.stop();
    browser.setHidden(false);
    browser.advance(RETRY_MS * 10);
    assert.equal(browser.open().length, 0);
  });
});
