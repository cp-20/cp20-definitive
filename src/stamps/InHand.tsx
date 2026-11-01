// The sticker in hand as drawn: the sticker itself (moved by hand.ts on every frame), and while
// it waits for its spot, the overlay it is aimed from and the hint bar for a pointer.
import { Show } from 'solid-js';
import { StickerFace } from './kinds.tsx';
import { aimHint, type createInput } from './input.ts';
import type { Held } from './hand.ts';
export function InHand(props: {
  held: Held | null;
  ghostKind: number;
  setGhost: (el: HTMLElement) => void;
  input: ReturnType<typeof createInput>;
}) {
  const { input } = props;
  const aiming = () => props.held?.mode === 'aim';
  return (
    <>
      <Show when={aiming()}>
        <div
          ref={input.overlay.ref}
          class="stamp-overlay"
          // Only the keys aim from the overlay itself; a pointer is guided by the hint bar.
          tabindex={input.byKeys() ? 0 : undefined}
          role={input.byKeys() ? 'application' : undefined}
          aria-roledescription={input.byKeys() ? 'シールの配置' : undefined}
          aria-label={
            input.byKeys()
              ? `シールを${props.held!.from === 'page' ? '動かす' : '貼る'}場所を選択。矢印キーで移動（Shiftを押しながらで大きく移動）、Enterで貼る、EscapeかTabでやめる`
              : undefined
          }
          aria-hidden={input.byKeys() ? undefined : 'true'}
          onKeyDown={input.overlay.onKeyDown}
          onFocusOut={input.overlay.onFocusOut}
          onPointerMove={input.overlay.onPointerMove}
          onPointerDown={input.overlay.onPointerDown}
          onPointerUp={input.overlay.onPointerUp}
          onPointerCancel={input.overlay.onPointerCancel}
        />
      </Show>
      {/* A pointer has no Escape key: say what the next tap does, and offer a way out. */}
      <Show when={aiming() && !input.byKeys()}>
        <div class="stamp-aim-bar stamp-ui">
          <span>{aimHint(props.held!)}</span>
          <button type="button" onClick={() => input.cancel(true)}>
            やめる
          </button>
        </div>
      </Show>
      <div
        ref={props.setGhost}
        class="sticker-ghost"
        data-active={props.ghostKind >= 0 ? 'true' : undefined}
        data-dragging={props.held?.mode === 'drag' || aiming() ? 'true' : undefined}
        aria-hidden="true"
      >
        <Show when={props.ghostKind >= 0}>
          <span class="sticker" data-kind={props.ghostKind}>
            <StickerFace kind={props.ghostKind} />
          </span>
        </Show>
      </div>
    </>
  );
}
