// The stickers placed on the page. Yours can be dragged, or clicked, tapped or reached with the
// keys to open a small menu that moves or peels it; other visitors' stickers let every click
// through to the page under them, and show who placed them while a mouse is over one or for a
// moment after a tap on one.
import { createEffect, createSignal, For, onSettled, Show } from 'solid-js';
import type { PlacedStamp } from './types.ts';
import Icon from '../components/Icon.tsx';
import { StickerFace, gravatarUrl, stickerName } from './kinds.tsx';
import type { ShownStamp } from './placement.ts';
import type { Held } from './hand.ts';
import type { createInput } from './input.ts';
export function StampLayer(props: {
  stamps: ShownStamp[];
  path: string;
  held: Held | null;
  isOwn: (s: PlacedStamp) => boolean;
  avatarOf: (s: PlacedStamp) => string | undefined;
  isFresh: (key: string) => boolean;
  settlesFrom: (key: string) => { x: number; y: number; t?: number } | undefined;
  isLeaving: (key: string) => boolean;
  lifted: string;
  stickerAt: (x: number, y: number, accept: (s: ShownStamp) => boolean) => ShownStamp | undefined;
  input: ReturnType<typeof createInput>;
}) {
  const { input } = props;
  // The sticker whose avatar shows.
  const [peek, setPeek] = createSignal('');
  let peekTimer = 0;
  function showAvatar(id: string, linger = 0) {
    clearTimeout(peekTimer);
    setPeek(id);
    if (linger) peekTimer = window.setTimeout(() => setPeek(''), linger);
  }
  // Hidden as the page changes or a sticker is taken.
  createEffect(
    () => [props.path, !!props.held] as const,
    () => void setPeek(''),
  );
  // Other visitors' stickers let the pointer through, so their avatar is found by position.
  const othersAt = (x: number, y: number) => props.stickerAt(x, y, (s) => !props.isOwn(s));
  onSettled(() => {
    let hovered = '';
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const id = props.held ? '' : othersAt(e.clientX, e.clientY)?.id || '';
      if (id === hovered) return;
      if (hovered && peek() === hovered) setPeek('');
      hovered = id;
      if (id) showAvatar(id);
    };
    const tap = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || props.held) return;
      const other = othersAt(e.clientX, e.clientY);
      if (other) showAvatar(other.id, 2400);
    };
    document.addEventListener('pointermove', hover, { passive: true });
    document.addEventListener('pointerdown', tap, { passive: true });
    return () => {
      document.removeEventListener('pointermove', hover);
      document.removeEventListener('pointerdown', tap);
      clearTimeout(peekTimer);
    };
  });
  // The menu shows while its sticker is still there and not peeling off.
  const menu = () => {
    const m = input.menu();
    return m && props.stamps.some((s) => s.key === m.key && !props.isLeaving(s.key)) ? m : null;
  };
  return (
    <>
      <div class="stamp-layer" data-holding={props.held ? 'true' : undefined}>
        <For each={props.stamps} keyed={(s) => s.key}>
          {(s) => (
            <span
              ref={input.pinScroll}
              class="placed-stamp"
              data-stamp-id={s().id}
              data-owned={props.isOwn(s()) ? 'true' : undefined}
              data-pending={s().owner === 'local' ? 'true' : undefined}
              data-fresh={props.isFresh(s().key) ? 'true' : undefined}
              data-leaving={props.isLeaving(s().key) ? 'true' : undefined}
              data-lifted={props.lifted === s().key ? 'true' : undefined}
              data-menu={menu()?.key === s().key ? 'true' : undefined}
              aria-hidden={props.isOwn(s()) ? undefined : 'true'}
              style={{
                translate: `${s().left}px ${s().top}px`,
                '--angle': `${s().angle}deg`,
                '--from-x': `${props.settlesFrom(s().key)?.x ?? 0}px`,
                '--from-y': `${props.settlesFrom(s().key)?.y ?? 0}px`,
                '--slide-time': props.settlesFrom(s().key)?.t
                  ? `${props.settlesFrom(s().key)!.t}ms`
                  : undefined,
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') showAvatar(s().id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse' && peek() === s().id) setPeek('');
              }}
              onPointerDown={(e) => input.grab(e, { kind: s().kind, from: 'page', target: s() })}
              onPointerMove={input.follow}
              onPointerUp={input.release}
              // The page started to scroll under a finger that had not picked the sticker up yet.
              onPointerCancel={() => input.cancel(props.held?.mode !== 'press')}
              onContextMenu={(e) => {
                if (props.held && props.held.pointer !== 'mouse') e.preventDefault();
              }}
            >
              <span class="sticker" data-kind={s().kind}>
                <StickerFace kind={s().kind} />
              </span>
              <Show when={peek() === s().id && props.avatarOf(s())}>
                <img
                  class="sticker-avatar"
                  src={gravatarUrl(props.avatarOf(s())!)}
                  alt=""
                  width="24"
                  height="24"
                  draggable={false}
                />
              </Show>
              <Show when={props.isOwn(s()) && !props.isLeaving(s().key)}>
                {/* The keys' way in to the menu a click or tap opens: only seen while focused. */}
                <button
                  class="stamp-open"
                  aria-label={`${stickerName(s().kind)}のシール`}
                  aria-expanded={menu()?.key === s().key ? 'true' : 'false'}
                  aria-controls={menu()?.key === s().key ? 'stamp-menu' : undefined}
                  onClick={() => input.openMenu(s(), true)}
                />
              </Show>
            </span>
          )}
        </For>
      </div>
      <Show when={menu()}>
        {(m) => (
          <div
            id="stamp-menu"
            class="stamp-menu stamp-ui"
            role="group"
            aria-label={`${stickerName(input.menuTarget()?.kind ?? 0)}のシール`}
            data-below={m().below ? 'true' : undefined}
            style={{ left: `${m().x}px`, top: `${m().y}px` }}
            onPointerDown={input.menuHandlers.onPointerDown}
            onMouseDown={input.menuHandlers.onMouseDown}
            onKeyDown={input.menuHandlers.onKeyDown}
            onFocusOut={input.menuHandlers.onFocusOut}
          >
            <button type="button" aria-label="動かす" onClick={input.menuHandlers.move}>
              <Icon name="Move" size={22} />
            </button>
            <button type="button" class="stamp-peel" aria-label="はがす" onClick={input.menuHandlers.peel}>
              <Icon name="Trash2" size={22} />
            </button>
          </div>
        )}
      </Show>
    </>
  );
}
