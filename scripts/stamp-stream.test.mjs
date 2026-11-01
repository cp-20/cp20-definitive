// The public sticker stream: applying Firebase's events, rendering bursts, and keeping it open.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStreamEvent, coalesce, keepStream } from '../src/data/stamp-stream.mjs';

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
    assert.equal({}.polluted, undefined);
  });
});

// A clock whose timers only run when the test moves it forward.
function fakeClock() {
  const timers = new Map();
  let now = 0,
    nextId = 1;
  const clock = {
    now: () => now,
    setTimeout: (fn, ms) => (timers.set(nextId, { fn, at: now + ms }), nextId++),
    clearTimeout: (id) => timers.delete(id),
  };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  const setNow = (value) => (now = value);
  return { clock, advance, timers, setNow };
}

describe('coalesce', () => {
  test('静かなあとの最初のイベントは、次のティックで描く', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    coalesce(() => runs++, 250, clock).schedule();
    advance(0);
    assert.equal(runs, 1);
  });

  test('間隔内に何度呼ばれても、描くのは1回', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const render = coalesce(() => runs++, 250, clock);
    advance(1000);
    render.schedule();
    render.schedule();
    render.schedule();
    advance(250);
    assert.equal(runs, 1);
  });

  test('続けて届くイベントは、間隔ごとに1回描く', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const render = coalesce(() => runs++, 250, clock);
    render.schedule();
    advance(0);
    render.schedule();
    advance(249);
    assert.equal(runs, 1);
    advance(1);
    assert.equal(runs, 2);
  });

  test('取り消した描画は実行しない', () => {
    const { clock, advance } = fakeClock();
    let runs = 0;
    const render = coalesce(() => runs++, 250, clock);
    render.schedule();
    render.cancel();
    advance(1000);
    assert.equal(runs, 0);
  });

  test('時計が巻き戻っても、待つのは最大で1間隔', () => {
    const { clock, advance, timers, setNow } = fakeClock();
    const render = coalesce(() => {}, 250, clock);
    render.schedule();
    advance(0);
    setNow(-3600000);
    render.schedule();
    assert.deepEqual(
      [...timers.values()].map((t) => t.at),
      [-3600000 + 250],
    );
  });
});

// A fake browser for keepStream: EventSources that the test opens, errors and closes by hand,
// and timers that only run when the test moves the clock.
function fakeBrowser() {
  const sources = [];
  const { clock, advance } = fakeClock();
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
    // The browser gives up on this stream (an HTTP error, a wrong content type).
    fail() {
      this.close();
      this.onerror();
    }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  const env = { EventSource: FakeSource, document: doc, window: win, ...clock };
  const seen = { restarts: 0, events: [], failures: 0 };
  const stop = keepStream(
    'https://db.example/pages/home.json',
    {
      restart: () => seen.restarts++,
      receive: (type, e) => seen.events.push([type, JSON.parse(e.data)]),
      fail: () => seen.failures++,
    },
    env,
  );
  const open = () => sources.filter((s) => s.readyState !== 2);
  const latest = () => sources.at(-1);
  const setHidden = (hidden) => {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const goOnline = () => win.dispatchEvent(new Event('online'));
  return { sources, open, latest, advance, seen, stop, setHidden, goOnline };
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

  test('ブラウザが諦めたストリームは失敗を伝え、2秒後に開き直す', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.advance(1999);
    assert.deepEqual([browser.seen.failures, browser.open().length], [1, 0]);
    browser.advance(1);
    assert.equal(browser.open().length, 1);
  });

  test('続けて失敗すると、開き直すまでの間隔が延びる', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.advance(2000);
    browser.latest().fail();
    browser.advance(3999);
    assert.equal(browser.open().length, 0);
    browser.advance(1);
    assert.equal(browser.open().length, 1);
  });

  test('put が届けば、次の失敗の間隔は2秒に戻る', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.advance(2000);
    browser.latest().emit('put', { path: '/', data: {} });
    browser.latest().fail();
    browser.advance(2000);
    assert.equal(browser.open().length, 1);
  });

  test('cancel されたストリームも閉じて開き直す', () => {
    const browser = fakeBrowser();
    browser.latest().emit('cancel', null);
    assert.equal(browser.open().length, 0);
    browser.advance(2000);
    assert.equal(browser.open().length, 1);
  });

  test('ブラウザが自分でつなぎ直している間は、8秒たつまで失敗を伝えない', () => {
    const browser = fakeBrowser();
    browser.latest().onerror();
    browser.advance(7999);
    assert.equal(browser.seen.failures, 0);
    browser.advance(1);
    assert.equal(browser.seen.failures, 1);
  });

  test('つなぎ直しが間に合えば、失敗を伝えない', () => {
    const browser = fakeBrowser();
    const source = browser.latest();
    source.onerror();
    source.readyState = 1;
    source.onopen();
    browser.advance(10000);
    assert.equal(browser.seen.failures, 0);
  });

  test('オンラインに戻ったら、待たずに開き直す', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.goOnline();
    assert.equal(browser.open().length, 1);
  });

  test('オンラインで開き直したら、待っていた再接続は取り消す', () => {
    const browser = fakeBrowser();
    browser.latest().fail();
    browser.goOnline();
    browser.advance(60000);
    assert.equal(browser.sources.length, 2);
  });

  test('ページが隠れている間はストリームを閉じ、見えたら開き直す', () => {
    const browser = fakeBrowser();
    browser.setHidden(true);
    assert.equal(browser.open().length, 0);
    browser.setHidden(false);
    assert.equal(browser.open().length, 1);
  });

  test('止めたら閉じて、待っている描画を取り消す', () => {
    const browser = fakeBrowser();
    const restarts = browser.seen.restarts;
    browser.stop();
    assert.deepEqual([browser.open().length, browser.seen.restarts], [0, restarts + 1]);
  });

  test('止めたあとは、何があっても開き直さない', () => {
    const browser = fakeBrowser();
    browser.stop();
    browser.goOnline();
    browser.setHidden(false);
    browser.advance(60000);
    assert.equal(browser.open().length, 0);
  });
});
