// The stickers on the current page: subscribed from the database, with your own changes laid
// over them at once (optimistic updates) and saved one at a time (optimistic.ts).
// A change that fails to save goes away, which puts the page back as it was.
import { createEffect, createMemo, createSignal } from 'solid-js';
import type { Account, Change, Operation, PlacedStamp } from './types.ts';
import { createPendingSaves, projectStamps } from './optimistic.ts';
type Client = typeof import('./client.ts');
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
  const pending = createPendingSaves({
    // Each change is saved for the account it was made with, and dropped if that account has
    // signed out since. The saved record replaces yours in the page's stickers.
    send: async (op, target) => {
      const who = account();
      if (!who || who.uid !== op.uid) return null;
      const saved = await (await client()).save(op, target, who);
      receive(op.path, [
        ...(cache.get(op.path) || []).filter((s) => s.owner !== saved.owner),
        ...saved.stamps,
      ]);
      return saved;
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
