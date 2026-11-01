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

// Keeps a Firebase REST stream open while the page is visible: closed while it is hidden and
// opened afresh when it shows again. EventSource retries network drops by itself, but closes for
// good on an HTTP error or a wrong content type (a captive portal's page); that, and a cancelled
// listener, is reported to `fail` and retried after RETRY_MS. `restart` runs before each new
// stream (its first event replaces everything) and `receive` gets each put/patch event.
// Returns a function that stops it for good.
export const RETRY_MS = 5000;
const browser = () => ({
  EventSource: globalThis.EventSource,
  document: globalThis.document,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});
export function keepStream(url, { restart, receive, fail }, env = browser()) {
  const { EventSource: Source, document: doc } = env;
  let stream, retry;
  const close = () => {
    env.clearTimeout(retry);
    restart();
    stream?.close();
    stream = undefined;
  };
  const open = () => {
    close();
    if (doc.hidden) return;
    const source = (stream = new Source(url));
    const lost = () => {
      source.close();
      // A stream already replaced is no longer this one's concern.
      if (source !== stream) return;
      stream = undefined;
      fail();
      retry = env.setTimeout(open, RETRY_MS);
    };
    source.addEventListener('put', (e) => receive('put', e));
    source.addEventListener('patch', (e) => receive('patch', e));
    source.addEventListener('cancel', lost);
    source.onerror = () => {
      if (source.readyState === Source.CLOSED) lost();
    };
  };
  open();
  doc.addEventListener('visibilitychange', open);
  return () => {
    close();
    doc.removeEventListener('visibilitychange', open);
  };
}
