import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  createEffect,
  onSettled,
  flush,
  For,
  Show,
} from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { PlacedStamp } from '../stamps-client';
import { projectStamps } from '../data/stamp-optimistic.mjs';
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
const StampContext = createContext<{
  toggle: () => void;
  count: () => number;
  enabled: () => boolean;
  open: () => boolean;
}>();
const visualKey = (s: Pick<PlacedStamp, 'anchor' | 'x' | 'y' | 'kind' | 'angle'>) =>
  `${s.anchor}|${s.x}|${s.y}|${s.kind}|${s.angle}`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      src={props.kind === 5 ? '/images/avatar.png' : `/stamps/${kinds[props.kind]?.symbol || 'clover'}.svg`}
      alt=""
      width="40"
      height="40"
      draggable={false}
    />
  );
}
export function StampButton() {
  const stamp = useContext(StampContext);
  return (
    <Show when={stamp.enabled()}>
      <button
        class="stamp-trigger"
        onClick={stamp.toggle}
        aria-label="シール帳を開く"
        aria-pressed={stamp.open() ? 'true' : 'false'}
      >
        <img src="/stamps/clover.svg" alt="" width="20" height="20" />
        <span class="stamp-trigger-label">シール</span>
        <span class="stamp-count" aria-hidden="true">
          {stamp.count() || '+'}
        </span>
      </button>
    </Show>
  );
}
export function StampProvider(props: { path: string; enabled: boolean; children: JSX.Element }) {
  const [remote, setRemote] = createSignal<PlacedStamp[]>([]),
    [operations, setOperations] = createSignal<Operation[]>([]),
    [open, setOpen] = createSignal(true),
    [kind, setKind] = createSignal(0),
    [hidden, setHidden] = createSignal(false),
    [message, setMessage] = createSignal(''),
    [failed, setFailed] = createSignal<Operation | null>(null),
    [revision, setRevision] = createSignal(0),
    [owner, setOwner] = createSignal(''),
    [held, setHeld] = createSignal<Held | null>(null),
    [ghostKind, setGhostKind] = createSignal(-1),
    [selected, setSelected] = createSignal(''),
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
    overlay: HTMLDivElement | undefined,
    sheet: HTMLElement | undefined,
    ghost: HTMLDivElement | undefined,
    writes = Promise.resolve(),
    lastWrite = 0;
  const projected = createMemo<PlacedStamp[]>(() =>
    projectStamps(
      remote(),
      operations().filter((op) => op.path === props.path),
      owner(),
    ),
  );
  const isOwn = (s: PlacedStamp) => s.owner === owner() || s.owner === 'local';
  const own = createMemo(() =>
    projected()
      .filter(isOwn)
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  const visible = createMemo(() => {
    revision();
    if (hidden()) return [];
    return projected().flatMap((stamp) => {
      const anchor = document.querySelector<HTMLElement>(`[data-stamp-anchor="${CSS.escape(stamp.anchor)}"]`);
      if (!anchor || anchor.closest('[inert]') || getComputedStyle(anchor).visibility === 'hidden') return [];
      const box = layoutBox(anchor);
      return box.w && box.h
        ? [{ ...stamp, key: visualKey(stamp), left: box.x + box.w * stamp.x, top: box.y + box.h * stamp.y }]
        : [];
    });
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
    if (message().startsWith('シールに接続')) setMessage('');
    if (props.path === path) {
      setRemote(stamps);
      reposition();
    }
  };
  createEffect(
    () => ({ path: props.path, enabled: props.enabled }),
    ({ path, enabled }) => {
      cancelHeld(false);
      setSelected('');
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
            () => setMessage('シールに接続できません。'),
          );
        } catch {
          setMessage('シールに接続できません。');
        }
      }, 200);
      return () => {
        disposed = true;
        clearTimeout(timer);
        stop?.();
      };
    },
  );
  onSettled(() => {
    try {
      setHidden(localStorage.getItem('cp20-hide-stamps') === 'true');
      setOpen(localStorage.getItem('cp20-sticker-sheet') !== 'closed');
      setOwner(localStorage.getItem('cp20-stamp-owner') || '');
      setKind(Number(localStorage.getItem('cp20-stamp-kind')) || 0);
    } catch {}
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
      if (e.key === 'Escape') {
        if (held()) cancelHeld(true);
        else setSelected('');
      }
    };
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.placed-stamp')) setSelected('');
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(motion.raf);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  });
  function toggle() {
    const next = !open();
    setOpen(next);
    if (!next) cancelHeld(false);
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
        setOwner(await api.identify());
        let result: { owner: string; stamps: PlacedStamp[] };
        if (op.type === 'add') {
          const { anchor, x, y, kind, angle } = op.stamp;
          const added = await api.place(op.path, { anchor, x, y, kind, angle });
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
          result = await api.remove(op.path, target);
        }
        receive(op.path, [
          ...(cache.get(op.path) || []).filter((s) => s.owner !== result.owner),
          ...result.stamps,
        ]);
        setOperations((list) => list.filter((item) => item.id !== op.id));
        lastWrite = Date.now();
        setMessage(op.type === 'add' ? '保存しました' : '取り消しました');
      })
      .catch(() => {
        setOperations((list) => list.filter((item) => item.id !== op.id));
        setFailed(op);
        setMessage('保存できませんでした。表示を元に戻しました。');
      });
  }
  // Where a point on screen lands on the page: the innermost anchor that contains it.
  function locate(x: number, y: number) {
    const below = document
      .elementsFromPoint(x, y)
      .find((el) => !el.closest('.sticker-sheet,.stamp-overlay,.stamp-layer,.sticker-ghost'));
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
  function erase(target: PlacedStamp, animate = true) {
    if (!isOwn(target)) return;
    const key = visualKey(target);
    if (leaving().has(key)) return;
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
    if (target) erase(target);
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
    const slot = sheet
      ?.querySelector<HTMLElement>(`[data-sticker-kind="${stickerKind}"]`)
      ?.getBoundingClientRect();
    return slot
      ? { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 }
      : { x: innerWidth - 80, y: innerHeight - 80 };
  }
  function begin(next: Held, start: { x: number; y: number }, pointer: { x: number; y: number }) {
    setSelected('');
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
    if (next.from === 'sheet') {
      setKind(next.kind);
      try {
        localStorage.setItem('cp20-stamp-kind', String(next.kind));
      } catch {}
    }
    flush();
    paint();
    animate();
    void client()
      .then((api) => api.identify())
      .then(setOwner)
      .catch(() => {});
  }
  function track(x: number, y: number) {
    const h = held();
    if (!h) return;
    if (h.mode === 'press' && Math.hypot(x - press.x, y - press.y) > 6) {
      setHeld({ ...h, mode: 'drag' });
      motion.ts = 1.18;
      if (h.from === 'page' && h.target) setLifted(visualKey(h.target));
    }
    motion.tx = x;
    motion.ty = y;
  }
  // Let go of the sticker: it flies back to the sheet (or to where it was) and disappears.
  function returnHeld(h: Held) {
    const home =
      h.from === 'page' && h.target
        ? (document.querySelector(`[data-stamp-id="${CSS.escape(h.target.id)}"]`)?.getBoundingClientRect() ??
          null)
        : null;
    const point = home
      ? { x: home.left + home.width / 2, y: home.top + home.height / 2 }
      : slotCenter(h.kind);
    setHeld(null);
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
      setHeld(null);
      finish();
    }
  }
  function drop(x: number, y: number) {
    const h = held();
    if (!h) return;
    const overSheet = document.elementsFromPoint(x, y).some((el) => el.closest('.sticker-sheet'));
    if (overSheet) {
      // Dropping one of your stickers on the sheet peels it off the page.
      if (h.from === 'page' && h.target) erase(h.target, false);
      setHeld(null);
      motion.tx = slotCenter(h.kind).x;
      motion.ty = slotCenter(h.kind).y;
      motion.ts = 0.6;
      motion.home = finish;
      return animate();
    }
    const lean = Math.round(clamp(motion.tilt, -14, 14));
    const angle = Math.abs(lean) > 2 ? lean : Math.round(Math.random() * 16 - 8);
    const from = { x: motion.x, y: motion.y };
    if (!put(x, y, h.kind, angle, from)) return returnHeld(h);
    if (h.from === 'page' && h.target) erase(h.target, false);
    if (h.pointer === 'touch') navigator.vibrate?.(10);
    setHeld(null);
    finish();
    cancelAnimationFrame(motion.raf);
  }
  function aimWithKeys(stickerKind: number) {
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
    // A sticker already aimed with a click: picking another one swaps it.
    if (held()?.mode === 'aim') setHeld(null);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    begin({ ...next, mode: 'press', pointer: e.pointerType }, center(el), { x: e.clientX, y: e.clientY });
  }
  const follow = (e: PointerEvent) => track(e.clientX, e.clientY);
  const release = (e: PointerEvent) => {
    const h = held();
    if (!h) return;
    if (h.mode === 'drag') return drop(e.clientX, e.clientY);
    if (h.mode !== 'press') return;
    if (h.from === 'page' && h.target) {
      // A tap on your own sticker shows its remove button.
      setSelected(h.target.id);
      setHeld(null);
      finish();
      cancelAnimationFrame(motion.raf);
      return;
    }
    // A click on a sheet sticker keeps it in hand; the next click on the page sticks it.
    setHeld({ ...h, mode: 'aim' });
    motion.ts = 1.18;
    if (h.pointer !== 'mouse') {
      motion.tx = motion.x;
      motion.ty = motion.y - 70;
    }
  };
  let aimDown = { x: 0, y: 0, id: -1 };
  return (
    <StampContext value={{ toggle, enabled: () => props.enabled, open, count: () => projected().length }}>
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
              data-selected={selected() === s().id ? 'true' : undefined}
              aria-hidden={isOwn(s()) ? undefined : 'true'}
              style={{
                translate: `${s().left}px ${s().top}px`,
                '--angle': `${s().angle}deg`,
                '--delay': `${(i() % 8) * 35}ms`,
                '--from-x': `${fresh().get(s().key)?.x ?? 0}px`,
                '--from-y': `${fresh().get(s().key)?.y ?? 0}px`,
              }}
              onPointerDown={(e) => {
                if (isOwn(s())) grab(e, { kind: s().kind, from: 'page', target: s() });
              }}
              onPointerMove={follow}
              onPointerUp={release}
              onPointerCancel={() => cancelHeld(true)}
            >
              <span class="sticker" data-kind={s().kind}>
                <StickerFace kind={s().kind} />
              </span>
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
          role="group"
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
        <section
          ref={sheet}
          class="sticker-sheet stamp-ui"
          data-open={open() ? 'true' : undefined}
          inert={!open()}
          aria-label="シール帳"
        >
          <header class="sticker-sheet-head">
            <h2>シール</h2>
            <span class="sticker-left">
              {own().length < LIMIT ? `あと${LIMIT - own().length}枚` : '古い順に入れ替え'}
            </span>
            <button
              class="sheet-tool stamp-undo"
              disabled={!own().length}
              onClick={undo}
              aria-label="取り消す"
            >
              <Icon name="RotateCcw" size={15} />
            </button>
            <button
              class="sheet-tool stamp-hide"
              aria-pressed={hidden() ? 'true' : 'false'}
              aria-label="シールを隠す"
              onClick={() => setHide(!hidden())}
            >
              <Icon name={hidden() ? 'EyeOff' : 'Eye'} size={15} />
            </button>
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
                  aria-label={item.name}
                  aria-pressed={kind() === i() ? 'true' : 'false'}
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
          <p
            class="stamp-status"
            role="status"
            data-idle={!operations().length && !message() && held()?.mode !== 'aim' ? 'true' : undefined}
          >
            {operations().length
              ? `保存中… ${operations().length}件`
              : message() ||
                (held()?.mode === 'aim'
                  ? '貼りたい場所をクリック・タップ'
                  : 'ドラッグして好きな場所に貼れます')}
          </p>
          <p class="stamp-policy">1ページ5枚まで · みんなに公開されます</p>
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
        </section>
      </Show>
    </StampContext>
  );
}
