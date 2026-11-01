import { createSignal, createMemo, createEffect, onSettled, flush, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { Operation, PlacedStamp } from '../data/stamp-types';
import { projectStamps } from '../data/stamp-optimistic.mjs';
import { sheetStartsOpen } from '../data/sheet-start.mjs';
import { focusAfterRemoval, stampAnnouncement, stampPlace } from '../data/stamp-a11y.mjs';
import { STAMPS_PER_PAGE as LIMIT } from '../data/stamp-limits.mjs';
import { saveOperation, writeDelay } from '../data/stamp-save.mjs';
import Icon from './Icon';
import { STICKER_KINDS as kinds, StickerFace, gravatarUrl as gravatar, stickerName } from './sticker/kinds';
import { anchorAt, centerOf as center, createAnchorMeasure, locate } from './sticker/dom';
import { createHand } from './sticker/hand';
import { createStampAccount } from './sticker/account';
import { ACCOUNT_KEY, HIDE_KEY, SHEET_KEY, readPref, writePref } from './sticker/prefs';
// A sticker in hand: pressed (not moved yet), dragged, or aimed (click-to-place / keyboard).
type Held = {
  kind: number;
  from: 'sheet' | 'page';
  target?: PlacedStamp;
  mode: 'press' | 'drag' | 'aim';
  pointer: string;
};
const visualKey = (s: Pick<PlacedStamp, 'anchor' | 'x' | 'y' | 'kind' | 'angle'>) =>
  `${s.anchor}|${s.x}|${s.y}|${s.kind}|${s.angle}`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// Half of a placed sticker's 46px box (.placed-stamp in app.css).
const STICKER_RADIUS = 23;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// A copy of a map or set without one key.
function withoutKey<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V>;
function withoutKey(set: ReadonlySet<string>, key: string): ReadonlySet<string>;
function withoutKey(
  items: ReadonlyMap<string, unknown> | ReadonlySet<string>,
  key: string,
): ReadonlyMap<string, unknown> | ReadonlySet<string> {
  const next = items instanceof Map ? new Map(items) : new Set(items as ReadonlySet<string>);
  next.delete(key);
  return next;
}
export function StampProvider(props: { path: string; enabled: boolean; children: JSX.Element }) {
  const [remote, setRemote] = createSignal<PlacedStamp[]>([]),
    [operations, setOperations] = createSignal<Operation[]>([]),
    // null until the stored preference is read, so neither the sheet nor its tab flashes.
    [open, setOpen] = createSignal<boolean | null>(null),
    [hidden, setHidden] = createSignal(false),
    [message, setMessage] = createSignal(''),
    // Spoken only: where the sticker in hand is, and what placing or peeling it did.
    [spoken, setSpoken] = createSignal(''),
    // The sticker stream's state, kept apart so it never hides a sign-in or saving message.
    [connection, setConnection] = createSignal(''),
    // Saves that failed, oldest first; one retry sends them all again in order.
    [failed, setFailed] = createSignal<readonly Operation[]>([]),
    [revision, setRevision] = createSignal(0),
    [nudge, setNudge] = createSignal(0),
    [held, setHeld] = createSignal<Held | null>(null),
    [ghostKind, setGhostKind] = createSignal(-1),
    [peek, setPeek] = createSignal(''),
    [lifted, setLifted] = createSignal(''),
    [fresh, setFresh] = createSignal<ReadonlyMap<string, { x: number; y: number; r: number }>>(new Map()),
    [leaving, setLeaving] = createSignal<ReadonlySet<string>>(new Set());
  const cache = new Map<string, PlacedStamp[]>(),
    resolved = new Map<string, PlacedStamp>();
  let clientPromise: Promise<typeof import('../stamps-client')> | undefined;
  const client = () =>
    (clientPromise ||= import('../stamps-client').catch((e) => {
      clientPromise = undefined;
      throw e;
    }));
  let frame = 0,
    peekTimer = 0,
    overlay: HTMLDivElement | undefined,
    sheet: HTMLElement | undefined,
    tab: HTMLButtonElement | undefined,
    ghost: HTMLDivElement | undefined,
    writes = Promise.resolve(),
    lastWrite = 0;
  // ── Account ── (see sticker/account.ts)
  const {
    account,
    signingIn,
    restoring,
    connect: connectAccount,
    signIn,
    signOut,
  } = createStampAccount({
    client,
    onMessage: setMessage,
    beforeSignOut: () => cancelHeld(false),
  });
  const owner = () => account()?.uid || '';
  const projected = createMemo<PlacedStamp[]>(() =>
    projectStamps(
      remote(),
      operations().filter((op) => op.path === props.path),
      owner(),
    ),
  );
  const isOwn = (s: PlacedStamp) => s.owner === 'local' || (!!owner() && s.owner === owner());
  const avatarOf = (s: PlacedStamp) => s.avatar || (isOwn(s) ? account()?.avatar : undefined);
  const own = createMemo(() =>
    projected()
      .filter(isOwn)
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  // Anchor boxes are measured once per anchor (not per sticker), and unchanged stickers keep
  // their previous object so a remote update only touches the stickers that actually moved.
  type Shown = PlacedStamp & { key: string; left: number; top: number };
  let shown = new Map<string, Shown>();
  const visible = createMemo(() => {
    revision();
    if (hidden()) return ((shown = new Map()), []);
    const boxOf = createAnchorMeasure();
    // The index tabs hang off the page's right edge; a sticker written there directly (the UI never
    // places one on them) is pulled back so it cannot cover them.
    const right = () => {
      const page = boxOf('page');
      // A tilted sticker reaches a little past its box; keep its corners off the tabs as well.
      return page ? page.x + page.w - STICKER_RADIUS - 8 : Infinity;
    };
    const next = new Map<string, Shown>();
    const list = projected().flatMap((stamp) => {
      const box = boxOf(stamp.anchor);
      if (!box) return [];
      const key = visualKey(stamp),
        left = Math.min(box.x + box.w * stamp.x, right()),
        top = box.y + box.h * stamp.y,
        before = shown.get(key);
      const item =
        before &&
        before.left === left &&
        before.top === top &&
        before.id === stamp.id &&
        before.owner === stamp.owner &&
        before.slot === stamp.slot &&
        before.avatar === stamp.avatar &&
        before.createdAt === stamp.createdAt
          ? before
          : { ...stamp, key, left, top };
      next.set(key, item);
      return [item];
    });
    shown = next;
    return list;
  });
  const reposition = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRevision((n) => n + 1);
      });
  };
  const receive = (path: string, stamps: PlacedStamp[]) => {
    cache.set(path, stamps);
    setConnection('');
    if (props.path === path) {
      setRemote(stamps);
      reposition();
    }
  };
  createEffect(
    () => ({ path: props.path, enabled: props.enabled }),
    ({ path, enabled }) => {
      cancelHeld(false);
      setPeek('');
      setRemote(cache.get(path) || []);
      reposition();
      let stop: (() => void) | undefined,
        disposed = false;
      const timer = setTimeout(async () => {
        if (!enabled) return;
        try {
          const api = await client();
          if (disposed) return;
          stop = api.subscribe(
            path,
            (stamps) => receive(path, stamps),
            () => setConnection('シールに接続できません'),
          );
        } catch {
          setConnection('シールに接続できません');
        }
      }, 200);
      return () => {
        disposed = true;
        clearTimeout(timer);
        stop?.();
      };
    },
  );

  // A locked sticker was reached for: point at the sign-in button instead.
  function askToSignIn() {
    setMessage('');
    setNudge((n) => n + 1);
    say('シールを貼るには Google でログインしてください');
    if (!open()) toggle();
    void connectAccount();
  }

  onSettled(() => {
    setHidden(readPref(HIDE_KEY) === 'true');
    const stored = readPref(SHEET_KEY);
    if (readPref(ACCOUNT_KEY)) void connectAccount();
    // Start with the sheet tucked away unless it fits on the desk beside the page, so it never covers content.
    const page = document.querySelector('.site-body')?.getBoundingClientRect();
    setOpen(sheetStartsOpen(stored, document.documentElement.clientWidth, page ? page.right : Infinity));
    window.addEventListener('resize', reposition);
    const resize = new ResizeObserver(reposition);
    resize.observe(document.querySelector('.site-body')!);
    const mutations = new MutationObserver(reposition);
    mutations.observe(document.querySelector('main')!, {
      attributes: true,
      attributeFilter: ['class', 'inert'],
      childList: true,
      subtree: true,
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && held()) cancelHeld(true);
    };
    // Other visitors' stickers let the pointer through, so their avatar is found by position:
    // shown while a mouse is over one, and for a moment after a tap on one.
    let hovered = '';
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const id = held() ? '' : othersAt(e.clientX, e.clientY)?.id || '';
      if (id === hovered) return;
      if (hovered && peek() === hovered) setPeek('');
      hovered = id;
      if (id) showAvatar(id);
    };
    const tap = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || held()) return;
      const other = othersAt(e.clientX, e.clientY);
      if (other) showAvatar(other.id, 2400);
    };
    document.addEventListener('pointermove', hover, { passive: true });
    document.addEventListener('pointerdown', tap, { passive: true });
    document.addEventListener('keydown', key);
    // Saves lost to a dropped connection are sent again as soon as it is back.
    const online = () => {
      if (failed().length && account()) retryFailed();
    };
    window.addEventListener('online', online);
    window.addEventListener('resize', measureCover);
    const covered = new ResizeObserver(measureCover);
    if (sheet) covered.observe(sheet);
    if (tab) covered.observe(tab);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      hand.stop();
      clearTimeout(peekTimer);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('keydown', key);
      window.removeEventListener('online', online);
      document.removeEventListener('pointermove', hover);
      document.removeEventListener('pointerdown', tap);
      window.removeEventListener('resize', measureCover);
      covered.disconnect();
      document.documentElement.style.removeProperty('--stamp-cover');
    };
  });
  // The sheet (or its tab) is pinned over the bottom of the screen. Its height feeds
  // scroll-padding-bottom, so whatever gets keyboard focus is scrolled clear of it.
  function measureCover() {
    const el = open() ? sheet : open() === false ? tab : undefined;
    const px =
      el?.isConnected && props.enabled ? el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0) : 0;
    document.documentElement.style.setProperty('--stamp-cover', `${Math.round(px)}px`);
  }
  createEffect(
    () => [open(), props.enabled] as const,
    () => measureCover(),
  );
  // The first control the sheet offers, for focus to land on when it opens or its header changes.
  const sheetStart = () =>
    sheet?.querySelector<HTMLElement>('.sticker-sheet-head :is(a[href], button:not(:disabled))');
  function toggle() {
    const next = !open();
    // The tab and the sheet each turn inert as the other appears; focus follows to the other one.
    const active = document.activeElement;
    const hadFocus = !!active && (!!tab?.contains(active) || !!sheet?.contains(active));
    setOpen(next);
    if (!next && held()?.from === 'sheet') cancelHeld(false);
    if (next) void connectAccount();
    writePref(SHEET_KEY, next ? 'open' : 'closed');
    if (!hadFocus) return;
    flush();
    focusOnceShown(next ? sheetStart() || sheetFocus() : tab);
  }
  // The sheet and the tab turn visible through a transition (a very short one with reduced
  // motion), and focus() does nothing until they are: try again over the next few frames.
  // A newer call replaces one still waiting.
  let focusFrame = 0;
  function focusOnceShown(el: HTMLElement | undefined, tries = 10) {
    cancelAnimationFrame(focusFrame);
    if (!el?.isConnected) return;
    el.focus({ preventScroll: true });
    const active = document.activeElement;
    // Focus still on the control that just turned inert (or already dropped to the page).
    const lost = !active || active === document.body || !!active.closest('[inert]');
    if (active !== el && lost && tries > 0)
      focusFrame = requestAnimationFrame(() => focusOnceShown(el, tries - 1));
  }
  // Signing in or out swaps the sheet's header (the sign-in button for the avatar and back), and a
  // sign-in disables its button while it waits. Focus that was on one of them would fall to the page.
  let focusInSheet = false;
  onSettled(() => {
    const track = (e: FocusEvent) => {
      focusInSheet = !!sheet?.contains(e.target as Node);
    };
    document.addEventListener('focusin', track);
    return () => document.removeEventListener('focusin', track);
  });
  // While a sign-in is pending, focus waits on the sheet itself, then moves on to what it brought.
  let parked: HTMLElement | undefined;
  createEffect(
    () => [!!account(), signingIn() || restoring()] as const,
    ([, busy]) => {
      queueMicrotask(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || !active.isConnected;
        if (!focusInSheet || !open() || !(lost || (parked && active === parked))) return;
        const target = busy ? sheetFocus() : sheetStart() || sheetFocus();
        parked = busy ? target : undefined;
        focusOnceShown(target);
      });
    },
  );
  function setHide(value: boolean) {
    setHidden(value);
    writePref(HIDE_KEY, String(value));
  }
  function enqueue(op: Operation) {
    setOperations((list) => [...list, op]);
    setMessage('');
    writes = writes
      .then(async () => {
        const delay = writeDelay(lastWrite);
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const api = await client();
        const who = account();
        if (!who) throw Error('Signed out');
        const { result, placed } = await saveOperation(api, op, who, (s) => resolved.get(s.id) || s);
        if (placed && op.type !== 'remove') {
          resolved.set(op.stamp.id, placed);
          setOperations((list) =>
            list.map((item) =>
              item.type !== 'add' && item.target.id === op.stamp.id ? { ...item, target: placed } : item,
            ),
          );
        }
        if (!result) {
          // Removing a sticker that never saved needs no request.
          setOperations((list) => list.filter((item) => item.id !== op.id));
          return;
        }
        receive(op.path, [
          ...(cache.get(op.path) || []).filter((s) => s.owner !== result.owner),
          ...result.stamps,
        ]);
        setOperations((list) => list.filter((item) => item.id !== op.id));
        lastWrite = Date.now();
      })
      .catch(() => {
        setOperations((list) => list.filter((item) => item.id !== op.id));
        setFailed((list) => [...list, op]);
        // The status line sits in the sheet, which is inert while closed: say it from outside.
        if (!open())
          say(stampAnnouncement('failed', nameOf(op.type === 'remove' ? op.target.kind : op.stamp.kind), 0));
      });
  }
  function retryFailed() {
    const list = failed();
    setFailed([]);
    for (const op of list) enqueue({ ...op, id: crypto.randomUUID() });
  }
  // Failed saves belong to the account that made them.
  createEffect(owner, () => {
    setFailed([]);
  });
  const failure = () => {
    const count = failed().length;
    return count > 1 ? `${count}件保存できませんでした` : count ? '保存できませんでした' : '';
  };
  function put(
    x: number,
    y: number,
    stickerKind: number,
    angle: number,
    from?: { x: number; y: number },
    target?: PlacedStamp,
  ) {
    const spot = locate(x, y);
    if (!spot) return false;
    const id = crypto.randomUUID();
    const stamp: PlacedStamp = {
      id,
      owner: 'local',
      slot: '',
      ...spot,
      kind: stickerKind,
      angle,
      createdAt: target?.createdAt ?? Date.now(),
    };
    // The new sticker starts where the one in hand was, then settles onto the paper.
    const key = visualKey(stamp);
    setFresh((map) => new Map(map).set(key, { x: (from?.x ?? x) - x, y: (from?.y ?? y) - y, r: 0 }));
    setTimeout(() => setFresh((map) => withoutKey(map, key)), 700);
    // Moving one of your stickers rewrites it in place, so it never pushes out another one.
    if (target) enqueue({ type: 'move', id, path: props.path, target, stamp });
    else enqueue({ type: 'add', id, path: props.path, stamp });
    return true;
  }
  const nameOf = stickerName;
  // Stickers you could still place here once `without` is gone.
  const remainingWithout = (without?: PlacedStamp) =>
    LIMIT - own().filter((s) => s.id !== without?.id && !leaving().has(visualKey(s))).length;
  function say(text: string) {
    // Clearing first makes a repeated sentence count as a change for screen readers.
    setSpoken('');
    queueMicrotask(() => setSpoken(text));
  }
  // Somewhere on the sheet that stays put, for when the focused control goes away.
  function sheetFocus() {
    if (!open()) return tab;
    const undoButton = sheet?.querySelector<HTMLButtonElement>('.stamp-undo');
    if (undoButton && !undoButton.disabled) return undoButton;
    if (sheet) sheet.tabIndex = -1;
    return sheet;
  }
  // A sticker's "peel off" button disappears with it: move on to the next one of yours.
  function focusPastDeleteButton(target: PlacedStamp) {
    const buttons = [...document.querySelectorAll<HTMLElement>('.stamp-layer .stamp-delete')];
    const mine = buttons.find(
      (b) => b.closest<HTMLElement>('[data-stamp-id]')?.dataset.stampId === target.id,
    );
    if (!mine || document.activeElement !== mine) return;
    const next = focusAfterRemoval(buttons, mine);
    (next || sheetFocus())?.focus({ preventScroll: !next });
  }
  function erase(target: PlacedStamp, animate = true) {
    if (!isOwn(target)) return;
    const key = visualKey(target);
    if (leaving().has(key)) return;
    focusPastDeleteButton(target);
    say(stampAnnouncement('removed', nameOf(target.kind), remainingWithout(target)));
    const commit = () => {
      setLeaving((set) => withoutKey(set, key));
      enqueue({ type: 'remove', id: crypto.randomUUID(), path: props.path, target });
      flush();
    };
    if (!animate || reducedMotion()) return commit();
    // The sticker peels off before the optimistic removal takes it out of the layer.
    setLeaving((set) => new Set(set).add(key));
    setTimeout(commit, 220);
  }
  function undo() {
    const target = own().find((s) => !leaving().has(visualKey(s)));
    if (!target) return;
    const undoButton = document.activeElement;
    erase(target);
    // The button turns disabled with the last sticker gone; keep focus on the sheet.
    if (remainingWithout() >= LIMIT && undoButton?.matches('.stamp-undo') && sheet) {
      sheet.tabIndex = -1;
      sheet.focus();
    }
  }
  // Stickers by other visitors take no pointer events, so every click, modifier click, middle
  // click and context menu reaches the page under them. Their avatar shows from a hit test instead.
  function othersAt(x: number, y: number) {
    const page = document.body.getBoundingClientRect(),
      px = x - page.left,
      py = y - page.top;
    const list = visible();
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!isOwn(s) && Math.hypot(s.left - px, s.top - py) <= STICKER_RADIUS) return s;
    }
  }
  function showAvatar(id: string, linger = 0) {
    clearTimeout(peekTimer);
    setPeek(id);
    if (linger) peekTimer = window.setTimeout(() => setPeek(''), linger);
  }

  // ── The sticker in hand ──
  // Its position follows the pointer with a spring and leans into the direction of travel.
  const hand = createHand(
    () => ghost,
    () => !!held(),
  );
  const { m: motion, paint, animate } = hand;
  let press = { x: 0, y: 0 };
  function slotCenter(stickerKind: number) {
    const slot = (
      open() ? sheet?.querySelector(`[data-sticker-kind="${stickerKind}"]`) : null
    )?.getBoundingClientRect();
    if (slot) return { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
    const tab = document.querySelector('.sticker-tab img')?.getBoundingClientRect();
    return tab
      ? { x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }
      : { x: innerWidth - 80, y: innerHeight - 80 };
  }
  function homeOf(h: Held) {
    const box =
      h.from === 'page' && h.target
        ? document.querySelector(`[data-stamp-id="${CSS.escape(h.target.id)}"]`)?.getBoundingClientRect()
        : undefined;
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : slotCenter(h.kind);
  }
  function begin(next: Held, start: { x: number; y: number }, pointer: { x: number; y: number }) {
    setPeek('');
    setHeld(next);
    setGhostKind(next.kind);
    motion.home = null;
    motion.x = start.x;
    motion.y = start.y;
    motion.tx = pointer.x;
    motion.ty = pointer.y;
    motion.tilt = next.target?.angle ?? 0;
    motion.scale = 1;
    motion.ts = next.mode === 'press' ? 1.08 : 1.18;
    press = pointer;
    flush();
    paint();
    animate();
  }
  function lift(h: Held) {
    if (h.from === 'page' && h.target) setLifted(visualKey(h.target));
  }
  function track(x: number, y: number) {
    const h = held();
    if (!h) return;
    if (h.mode === 'press' && Math.hypot(x - press.x, y - press.y) > 6) {
      setHeld({ ...h, mode: 'drag' });
      motion.ts = 1.18;
      lift(h);
    }
    motion.tx = x;
    motion.ty = y;
  }
  // Put the sticker in hand down. The keyboard overlay goes with it, so focus returns to the
  // sheet sticker it was taken from (or the tab when the sheet has been closed).
  function letGo(h: Held) {
    const hadFocus = !!overlay?.isConnected && document.activeElement === overlay;
    setHeld(null);
    if (!hadFocus) return;
    flush();
    const origin = open() ? sheet?.querySelector<HTMLElement>(`[data-sticker-kind="${h.kind}"]`) : tab;
    origin?.focus({ preventScroll: true });
  }
  // Let go of the sticker: it flies back to the sheet (or to where it was) and disappears.
  function returnHeld(h: Held, blocked = false) {
    const point = homeOf(h);
    if (h.pointer === 'keys' || blocked)
      say(stampAnnouncement(blocked ? 'blocked' : 'returned', nameOf(h.kind), remainingWithout()));
    letGo(h);
    if (reducedMotion()) return finish();
    hand.flyTo(point, 1, finish);
  }
  function finish() {
    setGhostKind(-1);
    setLifted('');
  }
  function cancelHeld(animate: boolean) {
    const h = held();
    if (!h) return;
    if (animate) returnHeld(h);
    else {
      letGo(h);
      finish();
    }
  }
  function drop(x: number, y: number) {
    const h = held();
    if (!h) return;
    const overSheet = document
      .elementsFromPoint(x, y)
      .some((el) => el.closest('.sticker-sheet[data-open], .sticker-tab[data-open]'));
    if (overSheet) {
      // Putting one of your stickers back on the sheet peels it off the page.
      if (h.from === 'page' && h.target) erase(h.target, false);
      letGo(h);
      return hand.flyTo(slotCenter(h.kind), 0.6, finish);
    }
    // Set down where it was picked up: nothing changes.
    if (h.from === 'page') {
      const home = homeOf(h);
      if (Math.hypot(x - home.x, y - home.y) < 6) return returnHeld(h);
    }
    const lean = Math.round(clamp(motion.tilt, -14, 14));
    const angle =
      h.from === 'page' && h.target && Math.abs(lean) <= 2
        ? h.target.angle
        : Math.abs(lean) > 2
          ? lean
          : Math.round(Math.random() * 16 - 8);
    const from = { x: motion.x, y: motion.y };
    const moving = h.from === 'page' && h.target && isOwn(h.target) ? h.target : undefined;
    const before = own();
    if (!put(x, y, h.kind, angle, from, moving)) return returnHeld(h, true);
    if (h.pointer === 'touch') navigator.vibrate?.(10);
    letGo(h);
    finish();
    flush();
    // A sticker over the limit pushes your oldest one off the page.
    const pushedOut = before.find((s) => s.id !== moving?.id && !own().some((o) => o.id === s.id));
    say(
      stampAnnouncement(
        'placed',
        nameOf(h.kind),
        remainingWithout(),
        pushedOut ? nameOf(pushedOut.kind) : undefined,
      ),
    );
    hand.stop();
  }
  // While aiming with the keyboard, say what the sticker is over once it stops moving.
  let placeTimer = 0,
    lastPlace = '';
  function announcePlace() {
    const h = held();
    if (!h || h.mode !== 'aim') return;
    const { below, anchor } = anchorAt(motion.tx, motion.ty);
    if (!anchor) return;
    const labelledBy = anchor.getAttribute('aria-labelledby');
    const label =
      anchor.querySelector('h1, h2, h3')?.textContent ||
      (labelledBy && document.getElementById(labelledBy)?.textContent);
    const place = below?.closest('.rail')
      ? 'ここには貼れません'
      : stampPlace(anchor.dataset.stampAnchor || '', label);
    if (place === lastPlace) return;
    lastPlace = place;
    say(place);
  }
  function aimWithKeys(stickerKind: number) {
    lastPlace = '';
    if (!account()) return askToSignIn();
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    begin(
      { kind: stickerKind, from: 'sheet', mode: 'aim', pointer: 'keys' },
      slotCenter(stickerKind),
      center,
    );
    overlay?.focus();
    // Where it starts, once the overlay's own name has been read.
    clearTimeout(placeTimer);
    placeTimer = window.setTimeout(announcePlace, 450);
  }
  function keyboard(e: KeyboardEvent) {
    const h = held();
    if (!h || h.mode !== 'aim') return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-16, 0],
      ArrowRight: [16, 0],
      ArrowUp: [0, -16],
      ArrowDown: [0, 16],
    };
    if (deltas[e.key]) {
      e.preventDefault();
      const [dx, dy] = deltas[e.key];
      motion.tx = clamp(motion.tx + dx, 25, innerWidth - 25);
      motion.ty = clamp(motion.ty + dy, 25, innerHeight - 25);
      clearTimeout(placeTimer);
      placeTimer = window.setTimeout(announcePlace, 350);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      drop(motion.tx, motion.ty);
    }
  }
  // Pointer handlers shared by sheet stickers and your own stickers on the page.
  function grab(e: PointerEvent, next: Omit<Held, 'mode' | 'pointer'>) {
    if (e.button !== 0 || !e.isPrimary) return;
    if (!account()) return askToSignIn();
    const current = held();
    if (current?.mode === 'aim') {
      // Clicking the sticker you are holding puts it back; another one swaps it.
      if (current.from === 'sheet' && next.from === 'sheet' && current.kind === next.kind)
        return returnHeld(current);
      setHeld(null);
      setLifted('');
    }
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    begin({ ...next, mode: 'press', pointer: e.pointerType }, center(el), { x: e.clientX, y: e.clientY });
  }
  const follow = (e: PointerEvent) => track(e.clientX, e.clientY);
  // A click (press without moving) keeps the sticker in hand; the next click sticks it.
  const release = (e: PointerEvent) => {
    const h = held();
    if (!h) return;
    if (h.mode === 'drag') return drop(e.clientX, e.clientY);
    if (h.mode !== 'press') return;
    setHeld({ ...h, mode: 'aim' });
    lift(h);
    motion.ts = 1.18;
    if (h.pointer !== 'mouse') {
      motion.tx = motion.x;
      motion.ty = motion.y - 70;
    }
  };
  let aimDown = { x: 0, y: 0, id: -1 };
  return (
    <>
      {props.children}
      <div class="stamp-layer" data-holding={held() ? 'true' : undefined}>
        <For each={visible()} keyed={(s) => s.key}>
          {(s, i) => (
            <span
              class="placed-stamp"
              data-stamp-id={s().id}
              data-owned={isOwn(s()) ? 'true' : undefined}
              data-pending={s().owner === 'local' ? 'true' : undefined}
              data-fresh={fresh().has(s().key) ? 'true' : undefined}
              data-leaving={leaving().has(s().key) ? 'true' : undefined}
              data-lifted={lifted() === s().key ? 'true' : undefined}
              aria-hidden={isOwn(s()) ? undefined : 'true'}
              style={{
                translate: `${s().left}px ${s().top}px`,
                '--angle': `${s().angle}deg`,
                '--delay': `${(i() % 8) * 35}ms`,
                '--from-x': `${fresh().get(s().key)?.x ?? 0}px`,
                '--from-y': `${fresh().get(s().key)?.y ?? 0}px`,
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') showAvatar(s().id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse' && peek() === s().id) setPeek('');
              }}
              onPointerDown={(e) => grab(e, { kind: s().kind, from: 'page', target: s() })}
              onPointerMove={follow}
              onPointerUp={release}
              onPointerCancel={() => cancelHeld(true)}
            >
              <span class="sticker" data-kind={s().kind}>
                <StickerFace kind={s().kind} />
              </span>
              <Show when={peek() === s().id && avatarOf(s())}>
                <img
                  class="sticker-avatar"
                  src={gravatar(avatarOf(s())!)}
                  alt=""
                  width="24"
                  height="24"
                  draggable={false}
                />
              </Show>
              <Show when={isOwn(s()) && !leaving().has(s().key)}>
                <button
                  class="stamp-delete"
                  aria-label={`${stickerName(s().kind)}のシールをはがす`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => erase(s())}
                >
                  <span aria-hidden="true">
                    <Icon name="X" size={12} />
                  </span>
                </button>
              </Show>
            </span>
          )}
        </For>
      </div>
      <Show when={held()?.mode === 'aim'}>
        <div
          ref={overlay}
          class="stamp-overlay"
          tabindex="0"
          role="application"
          aria-roledescription="シールの配置"
          aria-label="シールを貼る場所を選択。矢印キーで移動、Enterで貼る、EscapeかTabでやめる"
          onKeyDown={keyboard}
          onFocusOut={(e) => {
            // Tabbing away puts the sticker back. Focus that just leaves the window keeps it.
            if (!e.relatedTarget) return;
            queueMicrotask(() => {
              const h = held();
              if (h?.mode === 'aim' && h.pointer === 'keys' && document.activeElement !== overlay)
                cancelHeld(true);
            });
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') track(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            if (e.isPrimary && e.button === 0) aimDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
          }}
          onPointerUp={(e) => {
            if (e.pointerId === aimDown.id && Math.hypot(e.clientX - aimDown.x, e.clientY - aimDown.y) < 8) {
              motion.tx = e.clientX;
              motion.ty = e.clientY;
              drop(e.clientX, e.clientY);
            }
            aimDown.id = -1;
          }}
          onPointerCancel={() => (aimDown.id = -1)}
        />
      </Show>
      <div
        ref={ghost}
        class="sticker-ghost"
        data-active={ghostKind() >= 0 ? 'true' : undefined}
        data-dragging={held()?.mode === 'drag' || held()?.mode === 'aim' ? 'true' : undefined}
        aria-hidden="true"
      >
        <Show when={ghostKind() >= 0}>
          <span class="sticker" data-kind={ghostKind()}>
            <StickerFace kind={ghostKind()} />
          </span>
        </Show>
      </div>
      <Show when={props.enabled}>
        <p class="visually-hidden" role="status">
          {spoken()}
        </p>
        <button
          ref={tab}
          class="sticker-tab stamp-ui"
          data-open={open() === false ? 'true' : undefined}
          data-failed={failed().length ? 'true' : undefined}
          inert={open() !== false}
          aria-label={`シール帳を開く（このページのシール${projected().length}枚${failure() ? `、${failure()}` : ''}）`}
          onPointerEnter={() => void connectAccount()}
          onClick={(e) => {
            const h = held();
            if (h?.mode === 'aim' && h.from === 'page') drop(e.clientX, e.clientY);
            else toggle();
          }}
        >
          <img src="/stamps/clover.svg" alt="" width="24" height="24" />
          <span class="sticker-tab-label">シール</span>
          <Show when={projected().length}>
            <span class="sticker-count" aria-hidden="true">
              {projected().length}
            </span>
          </Show>
        </button>
        <section
          ref={sheet}
          class="sticker-sheet stamp-ui"
          data-open={open() ? 'true' : undefined}
          data-locked={account() ? undefined : 'true'}
          data-saving={operations().length ? 'true' : undefined}
          inert={!open()}
          aria-label="シール帳"
          onPointerEnter={() => void connectAccount()}
          onFocusIn={() => void connectAccount()}
          onClick={(e) => {
            // Clicking the sheet with one of your stickers in hand puts it back (peels it off).
            const h = held();
            if (h?.mode === 'aim' && h.from === 'page' && !(e.target as Element).closest('button, a'))
              drop(e.clientX, e.clientY);
          }}
        >
          <h2 class="visually-hidden">シール</h2>
          <header class="sticker-sheet-head">
            <Show
              when={account()}
              fallback={
                <button
                  class="sticker-login"
                  data-nudge={nudge() % 2 ? 'a' : nudge() ? 'b' : undefined}
                  disabled={signingIn() || restoring()}
                  onPointerDown={() => void connectAccount()}
                  onClick={signIn}
                >
                  <Icon name="LogIn" size={15} />
                  {restoring() ? 'ログインしています…' : 'Google でログイン'}
                </button>
              }
            >
              <a
                class="account-avatar"
                href="https://gravatar.com/profile"
                target="_blank"
                rel="noreferrer"
                title="Gravatar でアイコンを変更"
              >
                <img
                  src={gravatar(account()!.avatar, 64)}
                  alt="Gravatar でアイコンを変更"
                  width="28"
                  height="28"
                />
              </a>
              {/* One pip per sticker you can place on this page. */}
              <span
                class="sticker-pips"
                role="img"
                aria-label={`このページに貼れるシール 残り${Math.max(0, LIMIT - own().length)}枚`}
              >
                <For each={Array.from({ length: LIMIT }, (_, n) => n)}>
                  {(n) => <span data-used={n < own().length ? 'true' : undefined} />}
                </For>
              </span>
            </Show>
            <span class="sticker-head-space" />
            <Show when={account()}>
              <button
                class="sheet-tool stamp-undo"
                disabled={!own().length}
                onClick={undo}
                aria-label="最後に貼ったシールをはがす"
              >
                <Icon name="RotateCcw" size={15} />
              </button>
            </Show>
            <button
              class="sheet-tool stamp-hide"
              aria-pressed={hidden() ? 'true' : 'false'}
              aria-label="シールを隠す"
              onClick={() => setHide(!hidden())}
            >
              <Icon name={hidden() ? 'EyeOff' : 'Eye'} size={15} />
            </button>
            <Show when={account()}>
              <button class="sheet-tool" aria-label="ログアウト" onClick={signOut}>
                <Icon name="LogOut" size={15} />
              </button>
            </Show>
            <button class="sheet-tool" aria-label="シール帳を閉じる" onClick={toggle}>
              <Icon name="ChevronDown" size={16} />
            </button>
          </header>
          <div class="stamp-choices" role="group" aria-label="シールの種類">
            <For each={kinds}>
              {(item, i) => (
                <button
                  class="sheet-sticker"
                  data-sticker-kind={i()}
                  aria-label={
                    account()
                      ? `${item.name}のシールを貼る${remainingWithout() > 0 ? '' : '（一番古いシールと入れ替わります）'}`
                      : `${item.name}のシール（ログインすると貼れます）`
                  }
                  data-taken={held()?.from === 'sheet' && ghostKind() === i() ? 'true' : undefined}
                  onPointerDown={(e) => grab(e, { kind: i(), from: 'sheet' })}
                  onPointerMove={follow}
                  onPointerUp={release}
                  onPointerCancel={() => cancelHeld(true)}
                  onClick={(e) => {
                    if (e.detail === 0) aimWithKeys(i());
                  }}
                >
                  <span class="sticker" data-kind={i()}>
                    <StickerFace kind={i()} />
                  </span>
                </button>
              )}
            </For>
          </div>
          {/* Only problems are spelled out here; saving shows on the pips and the sticker itself,
              and placing or peeling is spoken through the status line next to the overlay. */}
          <p
            class="stamp-status"
            role="status"
            data-idle={message() || failure() || connection() ? undefined : 'true'}
          >
            {message() || failure() || connection()}
            <Show when={failed().length}>
              <button class="stamp-retry" onClick={retryFailed}>
                再試行
              </button>
            </Show>
          </p>
        </section>
      </Show>
    </>
  );
}
