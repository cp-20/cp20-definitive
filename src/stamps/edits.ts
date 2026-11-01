// Placing, moving and peeling your stickers: each change shows at once (see store.ts), with the
// short animation of a sticker settling onto the paper or peeling off it, and is announced.
import { createSignal, flush } from 'solid-js';
import type { Change, PlacedStamp } from './types.ts';
import { stampAnnouncement } from './a11y.ts';
import { STAMPS_PER_PAGE as LIMIT } from './limits.ts';
import { visualKey } from './layout.ts';
import { locate } from './placement.ts';
import { stickerName } from './kinds.tsx';
import { reducedMotion } from './prefs.ts';
// How long the peel-off and settle animations in app.css take, a little rounded up.
const PEEL_MS = 220,
  SETTLE_MS = 300;
// Creates signals: call it synchronously inside the component that owns them.
export function createEdits(options: {
  path: () => string;
  own: () => PlacedStamp[];
  isOwn: (s: PlacedStamp) => boolean;
  apply: (change: Change) => void;
  say: (text: string) => void;
  focusPastDeleteButton: (target: PlacedStamp) => void;
  sheet: () => HTMLElement | undefined;
}) {
  const { own, say } = options;
  // Stickers just set down, by visual key: how far from their spot they start settling.
  const [fresh, setFresh] = createSignal<ReadonlyMap<string, { x: number; y: number }>>(new Map()),
    // Stickers peeling off, by visual key, until they are taken out of the layer.
    [leaving, setLeaving] = createSignal<ReadonlySet<string>>(new Set());
  // The removals of stickers still peeling off. They are applied before a new sticker is set
  // down, so it is counted against the stickers you really have left.
  const peeling = new Set<() => void>();
  // Yours that are not peeling off, newest first.
  const kept = () => own().filter((s) => !leaving().has(visualKey(s)));
  // Stickers you could still place here once `without` is gone.
  const remaining = (without?: PlacedStamp) => LIMIT - kept().filter((s) => s.id !== without?.id).length;
  /**
   * Sets a sticker down at a point on screen, moving `target` (one of yours) if given. It settles
   * from `from`, where the sticker in hand was. Returns the new sticker's id, or '' where no
   * sticker can go.
   */
  function put(
    x: number,
    y: number,
    kind: number,
    angle: number,
    from?: { x: number; y: number },
    target?: PlacedStamp,
  ) {
    const spot = locate(x, y);
    if (!spot) return '';
    for (const commit of [...peeling]) commit();
    const id = crypto.randomUUID();
    const stamp: PlacedStamp = {
      id,
      owner: 'local',
      slot: '',
      ...spot,
      kind,
      angle,
      createdAt: target?.createdAt ?? Date.now(),
    };
    const key = visualKey(stamp);
    setFresh((map) => new Map(map).set(key, { x: (from?.x ?? x) - x, y: (from?.y ?? y) - y }));
    setTimeout(
      () =>
        setFresh((map) => {
          const next = new Map(map);
          next.delete(key);
          return next;
        }),
      SETTLE_MS,
    );
    // Moving one of your stickers rewrites it in place, so it never pushes out another one.
    if (target) options.apply({ type: 'move', id, path: options.path(), target, stamp });
    else options.apply({ type: 'add', id, path: options.path(), stamp });
    return id;
  }
  function erase(target: PlacedStamp, animate = true) {
    if (!options.isOwn(target)) return;
    const key = visualKey(target);
    if (leaving().has(key)) return;
    options.focusPastDeleteButton(target);
    say(stampAnnouncement('removed', stickerName(target.kind), remaining(target)));
    // The page may change while the sticker peels off; the removal belongs to this one.
    const path = options.path();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      peeling.delete(commit);
      setLeaving((set) => {
        const next = new Set(set);
        next.delete(key);
        return next;
      });
      options.apply({ type: 'remove', id: crypto.randomUUID(), path, target });
      flush();
    };
    if (!animate || reducedMotion()) return commit();
    // The sticker peels off before the optimistic removal takes it out of the layer.
    setLeaving((set) => new Set(set).add(key));
    peeling.add(commit);
    setTimeout(commit, PEEL_MS);
  }
  // Peels off your newest sticker.
  function undo() {
    const target = kept()[0];
    if (!target) return;
    const undoButton = document.activeElement;
    erase(target);
    // The button turns disabled with the last sticker gone; keep focus on the sheet.
    const sheet = options.sheet();
    if (remaining() >= LIMIT && undoButton?.matches('.stamp-undo') && sheet) {
      sheet.tabIndex = -1;
      sheet.focus();
    }
  }
  return {
    isFresh: (key: string) => fresh().has(key),
    settlesFrom: (key: string) => fresh().get(key),
    isLeaving: (key: string) => leaving().has(key),
    kept,
    remaining,
    put,
    erase,
    undo,
  };
}
