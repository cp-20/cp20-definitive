import { createSignal, createMemo, createEffect, onSettled, flush, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { Account, PlacedStamp } from '../stamps-client';
import { projectStamps } from '../data/stamp-optimistic.mjs';
import { sheetStartsOpen } from '../data/sheet-start.mjs';
import { deadline } from '../data/resilience.mjs';
import { focusAfterRemoval, stampAnnouncement, stampPlace } from '../data/stamp-a11y.mjs';
import Icon from './Icon';
const kinds = [
  { symbol: 'clover', name: 'クローバー' },
  { symbol: 'thumb', name: 'いいね' },
  { symbol: 'sparkles', name: 'きらきら' },
  { symbol: 'eyes', name: '見てる' },
  { symbol: 'heart', name: 'ハート' },
  { symbol: '', name: 'しーぴー' },
];
const LIMIT = 5;
type Operation = { id: string; path: string } & (
  | { type: 'add'; stamp: PlacedStamp }
  | { type: 'remove'; target: PlacedStamp }
);
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
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const gravatar = (hash: string, size = 64) => `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
// Layout position relative to <body>, ignoring transforms and scroll.
function layoutBox(el: HTMLElement) {
  let x = 0,
    y = 0,
    node: HTMLElement | null = el;
  while (node && node !== document.body) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
function StickerFace(props: { kind: number }) {
  return (
    <img
      src={
        props.kind === 5 ? '/images/avatar-384.webp' : `/stamps/${kinds[props.kind]?.symbol || 'clover'}.svg`
      }
      alt=""
      width="40"
      height="40"
      draggable={false}
    />
  );
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
    [failed, setFailed] = createSignal<Operation | null>(null),
    [revision, setRevision] = createSignal(0),
    [account, setAccount] = createSignal<Account | null>(null),
    [signingIn, setSigningIn] = createSignal(false),
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
    const boxes = new Map<string, ReturnType<typeof layoutBox> | null>();
    const boxOf = (name: string) => {
      if (boxes.has(name)) return boxes.get(name)!;
      const anchor = document.querySelector<HTMLElement>(`[data-stamp-anchor="${CSS.escape(name)}"]`);
      const box =
        !anchor || anchor.closest('[inert]') || getComputedStyle(anchor).visibility === 'hidden'
          ? null
          : layoutBox(anchor);
      boxes.set(name, box?.w && box.h ? box : null);
      return boxes.get(name)!;
    };
    const next = new Map<string, Shown>();
    const list = projected().flatMap((stamp) => {
      const box = boxOf(stamp.anchor);
      if (!box) return [];
      const key = visualKey(stamp),
        left = box.x + box.w * stamp.x,
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

  // ── Account ──
  // Anyone can see the stickers; placing them needs a Google account. The auth SDK is loaded
  // once the visitor reaches for the sheet (or straight away if they signed in before),
  // so the sign-in popup can open within the click.
  let watching: Promise<void> | undefined;
  function connectAccount() {
    return (watching ||= client()
      .then((api) =>
        api.watchAccount((next) => {
          setAccount(next);
          try {
            if (next) localStorage.setItem('cp20-sticker-account', '1');
            else localStorage.removeItem('cp20-sticker-account');
          } catch {}
        }),
      )
      .then(() => {})
      .catch(() => {
        watching = undefined;
      }));
  }
  async function signIn() {
    if (signingIn()) return;
    setSigningIn(true);
    setMessage('');
    try {
      const api = await deadline(client(), 20000);
      await deadline(connectAccount(), 20000);
      if (!account()) {
        const next = await api.signIn();
        if (next) setAccount(next);
        else setMessage('Google アカウントでログインしてください');
      }
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      setMessage(
        code.includes('popup-closed') || code.includes('cancelled-popup')
          ? ''
          : code === 'timeout'
            ? '接続できませんでした。もう一度押してください'
            : code.includes('popup-blocked')
              ? 'ポップアップが開けませんでした。もう一度押してください'
              : 'ログインできませんでした',
      );
    } finally {
      setSigningIn(false);
    }
  }
  async function signOut() {
    cancelHeld(false);
    try {
      await (await client()).signOut();
    } catch {
      setMessage('ログアウトできませんでした');
    }
  }
  // A locked sticker was reached for: point at the sign-in button instead.
  function askToSignIn() {
    setMessage('');
    setNudge((n) => n + 1);
    if (!open()) toggle();
    void connectAccount();
  }

  onSettled(() => {
    let stored: string | null = null;
    try {
      setHidden(localStorage.getItem('cp20-hide-stamps') === 'true');
      stored = localStorage.getItem('cp20-sticker-sheet');
      if (localStorage.getItem('cp20-sticker-account')) void connectAccount();
    } catch {}
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
    document.addEventListener('keydown', key);
    window.addEventListener('resize', measureCover);
    const covered = new ResizeObserver(measureCover);
    if (sheet) covered.observe(sheet);
    if (tab) covered.observe(tab);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(motion.raf);
      clearTimeout(peekTimer);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('keydown', key);
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
  function toggle() {
    const next = !open();
    setOpen(next);
    if (!next && held()?.from === 'sheet') cancelHeld(false);
    if (next) void connectAccount();
    try {
      localStorage.setItem('cp20-sticker-sheet', next ? 'open' : 'closed');
    } catch {}
  }
  function setHide(value: boolean) {
    setHidden(value);
    try {
      localStorage.setItem('cp20-hide-stamps', String(value));
    } catch {}
  }
  function enqueue(op: Operation) {
    setOperations((list) => [...list, op]);
    setMessage('');
    setFailed(null);
    writes = writes
      .then(async () => {
        const delay = Math.max(0, 1100 - (Date.now() - lastWrite));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const api = await client();
        const who = account();
        if (!who) throw Error('Signed out');
        let result: { owner: string; stamps: PlacedStamp[] };
        if (op.type === 'add') {
          const { anchor, x, y, kind, angle } = op.stamp;
          const added = await api.place(op.path, { anchor, x, y, kind, angle }, who);
          result = added;
          resolved.set(op.stamp.id, added.placed);
          setOperations((list) =>
            list.map((item) =>
              item.type === 'remove' && item.target.id === op.stamp.id
                ? { ...item, target: added.placed }
                : item,
            ),
          );
        } else {
          const target = resolved.get(op.target.id) || op.target;
          if (target.owner === 'local') {
            setOperations((list) => list.filter((item) => item.id !== op.id));
            return;
          }
          result = await api.remove(op.path, target, who);
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
        setFailed(op);
        setMessage('保存できませんでした');
      });
  }
  // Where a point on screen lands on the page: the innermost anchor that contains it.
  function locate(x: number, y: number) {
    const below = document
      .elementsFromPoint(x, y)
      .find((el) => !el.closest('.sticker-sheet,.sticker-tab,.stamp-overlay,.stamp-layer,.sticker-ghost'));
    let anchor =
      below?.closest<HTMLElement>('[data-stamp-anchor]') ||
      document.querySelector<HTMLElement>('[data-stamp-anchor="page"]');
    if (!anchor || below?.closest('.rail') || anchor.closest('[inert]')) return null;
    // Page coordinates follow the document, so stickers scroll natively with the content.
    const page = document.body.getBoundingClientRect(),
      px = x - page.left,
      py = y - page.top;
    let box = layoutBox(anchor);
    while (px < box.x || px > box.x + box.w || py < box.y || py > box.y + box.h) {
      anchor = anchor.parentElement?.closest<HTMLElement>('[data-stamp-anchor]') || null;
      if (!anchor) return null;
      box = layoutBox(anchor);
    }
    return { anchor: anchor.dataset.stampAnchor!, x: (px - box.x) / box.w, y: (py - box.y) / box.h };
  }
  function put(x: number, y: number, stickerKind: number, angle: number, from?: { x: number; y: number }) {
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
      createdAt: Date.now(),
    };
    // The new sticker starts where the one in hand was, then settles onto the paper.
    const key = visualKey(stamp);
    setFresh((map) => new Map(map).set(key, { x: (from?.x ?? x) - x, y: (from?.y ?? y) - y, r: 0 }));
    setTimeout(
      () =>
        setFresh((map) => {
          const next = new Map(map);
          next.delete(key);
          return next;
        }),
      700,
    );
    enqueue({ type: 'add', id, path: props.path, stamp });
    return true;
  }
  const nameOf = (stickerKind: number) => kinds[stickerKind]?.name || 'しーぴー';
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
      setLeaving((set) => {
        const next = new Set(set);
        next.delete(key);
        return next;
      });
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
  // Stickers by other visitors sit on top of the page; a click goes through to what is under it.
  function passThrough(e: MouseEvent) {
    const below = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest('.stamp-layer'));
    below?.closest<HTMLElement>('a[href], button, summary, label, [role="tab"]')?.click();
  }
  function showAvatar(id: string, linger = 0) {
    clearTimeout(peekTimer);
    setPeek(id);
    if (linger) peekTimer = window.setTimeout(() => setPeek(''), linger);
  }

  // ── The sticker in hand ──
  // Its position follows the pointer with a spring and leans into the direction of travel.
  // Updated outside Solid on every frame so dragging stays smooth.
  const motion = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    tilt: 0,
    scale: 1,
    ts: 1,
    raf: 0,
    home: null as null | (() => void),
  };
  let press = { x: 0, y: 0 };
  function paint() {
    if (!ghost) return;
    ghost.style.transform = `translate(${motion.x}px, ${motion.y}px) rotate(${motion.tilt}deg) scale(${motion.scale})`;
  }
  function animate() {
    cancelAnimationFrame(motion.raf);
    const step = () => {
      const dx = motion.tx - motion.x,
        dy = motion.ty - motion.y;
      motion.x += dx * 0.32;
      motion.y += dy * 0.32;
      motion.tilt += (clamp(dx * 0.5, -22, 22) - motion.tilt) * 0.2;
      motion.scale += (motion.ts - motion.scale) * 0.25;
      paint();
      const settled = Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(motion.tilt) < 0.3;
      if (motion.home && settled) {
        const done = motion.home;
        motion.home = null;
        done();
        return;
      }
      if (held() || motion.home) motion.raf = requestAnimationFrame(step);
    };
    motion.raf = requestAnimationFrame(step);
  }
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
    motion.tx = point.x;
    motion.ty = point.y;
    motion.ts = 1;
    motion.home = finish;
    animate();
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
      const home = slotCenter(h.kind);
      motion.tx = home.x;
      motion.ty = home.y;
      motion.ts = 0.6;
      motion.home = finish;
      return animate();
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
    if (!put(x, y, h.kind, angle, from)) return returnHeld(h, true);
    if (h.from === 'page' && h.target) erase(h.target, false);
    if (h.pointer === 'touch') navigator.vibrate?.(10);
    letGo(h);
    finish();
    flush();
    say(stampAnnouncement('placed', nameOf(h.kind), remainingWithout()));
    cancelAnimationFrame(motion.raf);
  }
  // While aiming with the keyboard, say what the sticker is over once it stops moving.
  let placeTimer = 0,
    lastPlace = '';
  function announcePlace() {
    const h = held();
    if (!h || h.mode !== 'aim') return;
    const below = document
      .elementsFromPoint(motion.tx, motion.ty)
      .find((el) => !el.closest('.sticker-sheet,.sticker-tab,.stamp-overlay,.stamp-layer,.sticker-ghost'));
    const anchor =
      below?.closest<HTMLElement>('[data-stamp-anchor]') ||
      document.querySelector<HTMLElement>('[data-stamp-anchor="page"]');
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
  const center = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
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
              onPointerDown={(e) => {
                if (isOwn(s())) grab(e, { kind: s().kind, from: 'page', target: s() });
                else if (e.pointerType !== 'mouse') showAvatar(s().id, 2400);
              }}
              onPointerMove={follow}
              onPointerUp={release}
              onPointerCancel={() => cancelHeld(true)}
              onClick={(e) => {
                if (!isOwn(s())) passThrough(e);
              }}
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
                  aria-label={`${kinds[s().kind]?.name || 'しーぴー'}のシールをはがす`}
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
          aria-label="シールを貼る場所を選択。矢印キーで移動、Enterで貼る、Escapeでやめる"
          onKeyDown={keyboard}
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
          inert={open() !== false}
          aria-label={`シール帳を開く（このページのシール${projected().length}枚）`}
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
                  disabled={signingIn()}
                  onPointerDown={() => void connectAccount()}
                  onClick={signIn}
                >
                  <Icon name="LogIn" size={15} />
                  Google でログイン
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
                      ? `${item.name}のシールを貼る`
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
          <p class="stamp-status" role="status" data-idle={message() || connection() ? undefined : 'true'}>
            {message() || connection()}
            <Show when={failed()}>
              <button
                class="stamp-retry"
                onClick={() => {
                  const op = failed();
                  if (op) enqueue({ ...op, id: crypto.randomUUID() });
                }}
              >
                再試行
              </button>
            </Show>
          </p>
        </section>
      </Show>
    </>
  );
}
