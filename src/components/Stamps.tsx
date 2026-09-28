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
type Operation = { id: string; path: string } & (
  | { type: 'add'; stamp: PlacedStamp }
  | { type: 'remove'; target: PlacedStamp }
);
const StampContext = createContext<{
  toggle: () => void;
  count: () => number;
  enabled: () => boolean;
  active: () => boolean;
}>();
function StampFace(props: { kind: number }) {
  return (
    <img
      src={props.kind === 5 ? '/images/avatar.png' : `/stamps/${kinds[props.kind]?.symbol || 'clover'}.svg`}
      alt=""
      width="40"
      height="40"
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
        aria-label="ページにスタンプを置く"
        aria-pressed={stamp.active() ? 'true' : 'false'}
      >
        <img src="/stamps/clover.svg" alt="" width="18" height="18" />
        <span>スタンプ</span>
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
    [active, setActive] = createSignal(false),
    [erasing, setErasing] = createSignal(false),
    [kind, setKind] = createSignal(0),
    [hidden, setHidden] = createSignal(false),
    [message, setMessage] = createSignal(''),
    [failed, setFailed] = createSignal<Operation | null>(null),
    [revision, setRevision] = createSignal(0),
    [owner, setOwner] = createSignal(''),
    [pointer, setPointer] = createSignal({ x: 200, y: 200 });
  const cache = new Map<string, PlacedStamp[]>(),
    resolved = new Map<string, PlacedStamp>();
  let clientPromise: Promise<typeof import('../stamps-client')> | undefined;
  const client = () =>
    (clientPromise ||= import('../stamps-client').catch((e) => {
      clientPromise = undefined;
      throw e;
    }));
  let frame = 0,
    overlay!: HTMLDivElement,
    writes = Promise.resolve(),
    lastWrite = 0;
  const projected = createMemo<PlacedStamp[]>(() =>
    projectStamps(
      remote(),
      operations().filter((op) => op.path === props.path),
      owner(),
    ),
  );
  const own = createMemo(() =>
    projected()
      .filter((s) => s.owner === owner() || s.owner === 'local')
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  const visible = createMemo(() => {
    revision();
    if (hidden()) return [];
    return projected().flatMap((stamp) => {
      const anchor = document.querySelector<HTMLElement>(`[data-stamp-anchor="${CSS.escape(stamp.anchor)}"]`);
      if (!anchor || anchor.closest('[inert]') || getComputedStyle(anchor).visibility === 'hidden') return [];
      const r = anchor.getBoundingClientRect();
      return r.width && r.height
        ? [{ ...stamp, left: r.left + r.width * stamp.x, top: r.top + r.height * stamp.y }]
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
    if (message().startsWith('スタンプに接続')) setMessage('');
    if (props.path === path) {
      setRemote(stamps);
      reposition();
    }
  };
  createEffect(
    () => ({ path: props.path, enabled: props.enabled }),
    ({ path, enabled }) => {
      setActive(false);
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
            () => setMessage('スタンプに接続できません。'),
          );
        } catch {
          setMessage('スタンプに接続できません。');
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
      setOwner(localStorage.getItem('cp20-stamp-owner') || '');
      setKind(Number(localStorage.getItem('cp20-stamp-kind')) || 0);
    } catch {}
    window.addEventListener('scroll', reposition, { passive: true });
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
      if (e.key === 'Escape' && active()) close();
    };
    document.addEventListener('keydown', key);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('keydown', key);
    };
  });
  function close() {
    setActive(false);
    document.querySelector<HTMLButtonElement>('.stamp-trigger')?.focus();
  }
  function toggle() {
    if (active()) {
      close();
      return;
    }
    setActive(true);
    setErasing(false);
    setHidden(false);
    setPointer({ x: innerWidth / 2, y: innerHeight / 2 });
    try {
      localStorage.setItem('cp20-hide-stamps', 'false');
    } catch {}
    flush();
    overlay?.focus();
    void client()
      .then((api) => api.identify())
      .then(setOwner)
      .catch(() => {});
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
  function put(x: number, y: number) {
    const below = document
      .elementsFromPoint(x, y)
      .find((el) => !el.closest('.stamp-ui,.stamp-overlay,.stamp-layer'));
    let anchor =
      below?.closest<HTMLElement>('[data-stamp-anchor]') ||
      document.querySelector<HTMLElement>('[data-stamp-anchor="page"]');
    if (!anchor || below?.closest('.rail') || anchor.closest('[inert]')) return;
    let r = anchor.getBoundingClientRect();
    while (x < r.left || x > r.right || y < r.top || y > r.bottom) {
      anchor = anchor.parentElement?.closest<HTMLElement>('[data-stamp-anchor]') || null;
      if (!anchor) return;
      r = anchor.getBoundingClientRect();
    }
    const id = crypto.randomUUID();
    enqueue({
      type: 'add',
      id,
      path: props.path,
      stamp: {
        id,
        owner: 'local',
        slot: '',
        anchor: anchor.dataset.stampAnchor!,
        x: (x - r.left) / r.width,
        y: (y - r.top) / r.height,
        kind: kind(),
        angle: Math.round(Math.random() * 24 - 12),
        createdAt: Date.now(),
      },
    });
  }
  function erase(target: PlacedStamp) {
    if (target.owner !== owner() && target.owner !== 'local') return;
    enqueue({ type: 'remove', id: crypto.randomUUID(), path: props.path, target });
  }
  function undo() {
    const target = own()[0];
    if (target) erase(target);
  }
  function keyboard(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || erasing()) return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    };
    if (deltas[e.key]) {
      e.preventDefault();
      const [dx, dy] = deltas[e.key];
      setPointer((p) => ({
        x: Math.max(25, Math.min(innerWidth - 25, p.x + dx)),
        y: Math.max(25, Math.min(innerHeight - 25, p.y + dy)),
      }));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      put(pointer().x, pointer().y);
    }
  }
  let down = { x: 0, y: 0, id: -1 };
  return (
    <StampContext value={{ toggle, enabled: () => props.enabled, active, count: () => projected().length }}>
      {props.children}
      <div
        class="stamp-layer"
        data-erasing={active() && erasing() ? 'true' : undefined}
        aria-hidden={active() && erasing() ? undefined : 'true'}
      >
        <For each={visible()} keyed={(s) => s.id}>
          {(s) => (
            <span
              class="placed-stamp"
              data-stamp-id={s().id}
              data-owned={s().owner === owner() || s().owner === 'local' ? 'true' : undefined}
              data-pending={s().owner === 'local' ? 'true' : undefined}
              style={{ translate: `${s().left}px ${s().top}px`, '--angle': `${s().angle}deg` }}
            >
              <StampFace kind={s().kind} />
              <Show when={active() && erasing() && (s().owner === owner() || s().owner === 'local')}>
                <button
                  class="stamp-delete"
                  aria-label={`${kinds[s().kind]?.name || 'しーぴー'}のスタンプを削除`}
                  onClick={() => {
                    erase(s());
                    flush();
                    (
                      document.querySelector<HTMLButtonElement>('.stamp-delete') ||
                      document.querySelector<HTMLButtonElement>(".stamp-modes button[aria-pressed='true']")
                    )?.focus({ preventScroll: true });
                  }}
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
      <Show when={active()}>
        <div
          ref={overlay}
          class={['stamp-overlay', { 'is-erasing': erasing() }]}
          tabindex="0"
          role="group"
          aria-label={
            erasing()
              ? '自分のスタンプを選んで削除。Escapeで終了'
              : 'スタンプ配置。矢印キーで移動、Enterで配置、Escapeで終了'
          }
          onKeyDown={keyboard}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') setPointer({ x: e.clientX, y: e.clientY });
          }}
          onPointerDown={(e) => {
            if (e.isPrimary && e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId };
          }}
          onPointerUp={(e) => {
            if (
              !erasing() &&
              e.pointerId === down.id &&
              Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8
            )
              put(e.clientX, e.clientY);
            down.id = -1;
          }}
          onPointerCancel={() => {
            down.id = -1;
          }}
        >
          <span
            class="stamp-cursor"
            style={{ translate: `${pointer().x}px ${pointer().y}px` }}
            aria-hidden="true"
          >
            <StampFace kind={kind()} />
          </span>
        </div>
        <section class="stamp-ui stamp-tools" aria-label="スタンプの道具">
          <div class="stamp-ui-heading">
            <div>
              <h2>スタンプ</h2>
              <p>
                {erasing()
                  ? own().length
                    ? '自分のスタンプをタップして削除'
                    : '消せるスタンプはありません'
                  : 'クリック・タップで配置'}
              </p>
            </div>
            <button class="icon-button" aria-label="スタンプを閉じる" onClick={close}>
              <Icon name="X" size={18} />
            </button>
          </div>
          <div class="stamp-modes" role="group" aria-label="スタンプの操作">
            <button aria-pressed={erasing() ? 'false' : 'true'} onClick={() => setErasing(false)}>
              <Icon name="Plus" size={15} />
              置く
            </button>
            <button
              aria-pressed={erasing() ? 'true' : 'false'}
              onClick={() => {
                setErasing(true);
                setHidden(false);
                try {
                  localStorage.setItem('cp20-hide-stamps', 'false');
                } catch {}
              }}
            >
              <Icon name="Eraser" size={15} />
              消す
            </button>
          </div>
          <div class="stamp-choices" role="group" aria-label="スタンプの種類">
            <For each={kinds}>
              {(item, i) => (
                <button
                  aria-label={item.name}
                  aria-pressed={kind() === i() ? 'true' : 'false'}
                  onClick={() => {
                    setKind(i());
                    setErasing(false);
                    try {
                      localStorage.setItem('cp20-stamp-kind', String(i()));
                    } catch {}
                    overlay?.focus();
                  }}
                >
                  <StampFace kind={i()} />
                </button>
              )}
            </For>
          </div>
          <div class="stamp-toolbar-bottom">
            <button class="stamp-undo" disabled={!own().length} onClick={undo}>
              <Icon name="RotateCcw" size={16} />
              取り消す
            </button>
            <label class="stamp-hide">
              <input
                type="checkbox"
                checked={hidden()}
                onChange={(e) => {
                  setHidden(e.currentTarget.checked);
                  try {
                    localStorage.setItem('cp20-hide-stamps', String(e.currentTarget.checked));
                  } catch {}
                }}
              />
              スタンプを隠す
            </label>
          </div>
          <p class="stamp-policy">1ページ5個まで · みんなに公開されます</p>
          <p class="stamp-status" role="status">
            {operations().length ? `保存中… ${operations().length}件` : message() || 'Escで終了'}
          </p>
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
      <Show when={!active() && (operations().length || failed())}>
        <div class="stamp-toast" role="status">
          {operations().length ? 'スタンプを保存中…' : message()}
          <Show when={failed()}>
            <button
              onClick={() => {
                const op = failed();
                if (op) enqueue({ ...op, id: crypto.randomUUID() });
              }}
            >
              再試行
            </button>
          </Show>
        </div>
      </Show>
    </StampContext>
  );
}
