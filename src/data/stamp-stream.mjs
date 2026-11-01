import { reconnectDelay } from './resilience.mjs';
import { STREAM_STALL_MS } from './stamp-limits.mjs';
// Firebase REST streaming uses replacement (put) and relative multi-path updates (patch).
export function applyStreamEvent(current, type, event) {
  let root = current;
  const set = (path, value) => {
    const keys = path.split('/').filter(Boolean);
    if (keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
      throw Error('Invalid path');
    if (!keys.length) {
      root = value || {};
      return;
    }
    let node = root;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    const key = keys.at(-1);
    if (value === null) delete node[key];
    else node[key] = value;
  };
  if (type === 'put') set(event.path, event.data);
  else for (const [key, value] of Object.entries(event.data || {})) set(`${event.path}/${key}`, value);
  return root;
}
// Runs `run` at most once per `wait` ms however often `schedule` is called, so a burst of
// stream events (a visitor rewriting their stickers quickly) re-renders the page only a few
// times a second. The first call after a quiet period runs on the next tick. The clock is
// monotonic, and the wait never exceeds `wait`, so a system clock set back cannot stall it.
const realClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};
export function coalesce(run, wait, clock = realClock) {
  let timer = null,
    last = -Infinity;
  return {
    schedule() {
      if (timer !== null) return;
      timer = clock.setTimeout(
        () => {
          timer = null;
          last = clock.now();
          run();
        },
        Math.min(wait, Math.max(0, last + wait - clock.now())),
      );
    },
    cancel() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}

// Keeps a Firebase REST stream open while the page is visible. EventSource retries network
// drops by itself, but closes for good on an HTTP error or a wrong content type (a captive
// portal's HTML page). Those, and a cancelled listener, are retried here with a backoff, and
// straight away once the device comes back online. While the browser is reconnecting by
// itself nothing is reported, unless it takes a while. `restart` runs before each new stream
// (its first event replaces everything), `receive` gets each put/patch event and `fail` is
// told about a lost or stalled stream. Returns a function that stops it for good.
const browser = () => ({
  EventSource: globalThis.EventSource,
  document: globalThis.document,
  window: globalThis.window,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});
export function keepStream(url, { restart, receive, fail }, env = browser()) {
  const { EventSource: Source, document: doc, window: win } = env;
  let stream,
    attempts = 0,
    retry,
    stalled;
  const lost = (source) => {
    if (source !== stream) return;
    if (source.readyState !== Source.CLOSED) {
      stalled ??= env.setTimeout(() => {
        stalled = undefined;
        if (source === stream && source.readyState !== Source.OPEN) fail();
      }, STREAM_STALL_MS);
      return;
    }
    fail();
    source.close();
    stream = undefined;
    env.clearTimeout(retry);
    retry = env.setTimeout(resume, reconnectDelay(attempts++));
  };
  const resume = () => {
    env.clearTimeout(retry);
    env.clearTimeout(stalled);
    retry = stalled = undefined;
    restart();
    stream?.close();
    stream = undefined;
    if (doc.hidden) return;
    const source = new Source(url);
    stream = source;
    source.onopen = () => {
      env.clearTimeout(stalled);
      stalled = undefined;
    };
    source.addEventListener('put', (e) => {
      attempts = 0;
      receive('put', e);
    });
    source.addEventListener('patch', (e) => receive('patch', e));
    source.addEventListener('cancel', () => {
      source.close();
      lost(source);
    });
    source.onerror = () => lost(source);
  };
  const online = () => {
    attempts = 0;
    resume();
  };
  resume();
  doc.addEventListener('visibilitychange', resume);
  win.addEventListener('online', online);
  return () => {
    env.clearTimeout(retry);
    env.clearTimeout(stalled);
    restart();
    stream?.close();
    stream = undefined;
    doc.removeEventListener('visibilitychange', resume);
    win.removeEventListener('online', online);
  };
}
