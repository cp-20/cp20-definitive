// The public stream of a page's stickers (Firebase REST streaming): applying its events,
// rendering bursts of them, and keeping it open.

type Tree = Record<string, any>;
// Firebase REST streaming uses replacement (put) and relative multi-path updates (patch).
export function applyStreamEvent(current: Tree, type: string, event: { path: string; data: any }) {
  let root = current;
  const set = (path: string, value: unknown) => {
    const keys = path.split('/').filter(Boolean);
    if (keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
      throw Error('Invalid path');
    if (!keys.length) {
      root = value || {};
      return;
    }
    let node = root;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    const key = keys.at(-1)!;
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
type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};
const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as number),
};
export function coalesce(run: () => void, wait: number, clock = realClock) {
  let timer: unknown = null,
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
type Browser = Omit<Clock, 'now'> & {
  EventSource: { new (url: string | URL): EventSource; readonly CLOSED: number };
  document: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
};
const browser = (): Browser => ({
  EventSource: globalThis.EventSource,
  document: globalThis.document,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as number),
});
export function keepStream(
  url: string | URL,
  {
    restart,
    receive,
    fail,
  }: { restart: () => void; receive: (type: 'put' | 'patch', event: MessageEvent) => void; fail: () => void },
  env = browser(),
) {
  const { EventSource: Source, document: doc } = env;
  let stream: EventSource | undefined, retry: unknown;
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
    source.addEventListener('put', (e) => receive('put', e as MessageEvent));
    source.addEventListener('patch', (e) => receive('patch', e as MessageEvent));
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
