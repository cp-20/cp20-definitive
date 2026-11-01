// The stickers on the current page: subscribed from the database, with your own changes laid
// over them at once (optimistic updates) and saved one at a time (src/data/stamp-optimistic.mjs).
// A change that fails to save goes away, which puts the page back as it was.
import { createEffect, createMemo, createSignal } from 'solid-js';
import type { Account, Change, Operation, PlacedStamp } from '../../data/stamp-types';
import { createPendingSaves, projectStamps } from '../../data/stamp-optimistic.mjs';
type Client = typeof import('../../stamps-client');
type Saved = { owner: string; stamps: PlacedStamp[]; placed?: PlacedStamp };
// Creates signals: call it synchronously inside the component that owns them.
export function createStampStore(options: {
  path: () => string;
  enabled: () => boolean;
  account: () => Account | null;
  client: () => Promise<Client>;
  // Called whenever the stickers to draw change.
  changed: () => void;
  // A change that could not be saved (and has been undone).
  failed: (op: Operation) => void;
}) {
  const { path, account, client } = options;
  const [remote, setRemote] = createSignal<PlacedStamp[]>([]),
    [operations, setOperations] = createSignal<readonly Operation[]>([]),
    // The sticker stream's state, kept apart so it never hides a sign-in or saving message.
    [connection, setConnection] = createSignal('');
  const cache = new Map<string, PlacedStamp[]>();
  const owner = () => account()?.uid || '';
  const projected = createMemo<PlacedStamp[]>(() =>
    projectStamps(
      remote(),
      operations().filter((op) => op.path === path()),
      owner(),
    ),
  );
  const isOwn = (s: PlacedStamp) => s.owner === 'local' || (!!owner() && s.owner === owner());
  // Yours, newest first.
  const own = createMemo(() =>
    projected()
      .filter(isOwn)
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  function receive(at: string, stamps: PlacedStamp[]) {
    cache.set(at, stamps);
    setConnection('');
    if (path() !== at) return;
    setRemote(stamps);
    options.changed();
  }
  createEffect(
    () => ({ at: path(), enabled: options.enabled() }),
    ({ at, enabled }) => {
      setRemote(cache.get(at) || []);
      options.changed();
      let stop: (() => void) | undefined,
        disposed = false;
      const lost = () => setConnection('シールに接続できません');
      // Navigating quickly through pages opens no stream for the ones passed through.
      const timer = setTimeout(async () => {
        if (!enabled) return;
        try {
          const api = await client();
          if (!disposed) stop = api.subscribe(at, (stamps) => receive(at, stamps), lost);
        } catch {
          lost();
        }
      }, 200);
      return () => {
        disposed = true;
        clearTimeout(timer);
        stop?.();
      };
    },
  );
  // Each request is made for the account the change was made with, and dropped if that account
  // has signed out since. The saved record replaces yours in the page's stickers.
  const request = async (op: Operation, call: (api: Client, who: Account) => Promise<Saved>) => {
    const who = account();
    if (!who || who.uid !== op.uid) return null;
    const saved = await call(await client(), who);
    receive(op.path, [...(cache.get(op.path) || []).filter((s) => s.owner !== saved.owner), ...saved.stamps]);
    return saved;
  };
  const pending = createPendingSaves({
    send: {
      place: (op) => request(op, (api, who) => api.place(op.path, op.stamp, who)),
      move: (op, target) => request(op, (api, who) => api.move(op.path, target, op.stamp, who)),
      remove: (op, target) => request(op, (api, who) => api.remove(op.path, target, who)),
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    changed: setOperations,
  });
  /** Shows a change at once and saves it, or undoes it if it cannot be saved. */
  function apply(change: Change) {
    const op: Operation = { ...change, uid: owner() };
    // A failure after signing out (or into another account) is no longer the visitor's concern.
    pending.add(op).catch(() => {
      if (op.uid === owner()) options.failed(op);
    });
  }
  return {
    projected,
    own,
    isOwn,
    connection,
    saving: () => operations().length > 0,
    apply,
  };
}
