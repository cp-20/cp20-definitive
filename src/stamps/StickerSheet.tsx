// The sticker sheet: sign-in, the stickers to take, your remaining count and the sheet's tools,
// with the tab it folds into.
import { For, Show } from 'solid-js';
import type { Account } from './types.ts';
import { STAMPS_PER_PAGE as LIMIT } from './limits.ts';
import Icon from '../components/Icon.tsx';
import { STICKER_KINDS, StickerFace, gravatarUrl } from './kinds.tsx';
import type { createInput } from './input.ts';
export function StickerTab(props: {
  ref: (el: HTMLButtonElement) => void;
  open: boolean | null;
  count: number;
  failed: boolean;
  connect: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      ref={props.ref}
      class="sticker-tab stamp-ui"
      data-open={props.open === false ? 'true' : undefined}
      data-failed={props.failed ? 'true' : undefined}
      inert={props.open !== false}
      aria-label={`シール帳を開く（このページのシール${props.count}枚）`}
      onPointerEnter={props.connect}
      onClick={props.onClick}
    >
      <img src="/stamps/clover.svg" alt="" width="24" height="24" />
      <span class="sticker-tab-label">シール</span>
      <Show when={props.count}>
        <span class="sticker-count" aria-hidden="true">
          {props.count}
        </span>
      </Show>
    </button>
  );
}
export function StickerSheet(props: {
  ref: (el: HTMLElement) => void;
  open: boolean | null;
  account: Account | null;
  busy: boolean;
  restoring: boolean;
  // Bumped to shake the sign-in button when a locked sticker is reached for.
  nudge: number;
  saving: boolean;
  owned: number;
  remaining: number;
  hidden: boolean;
  // The sticker taken from the sheet, faded in its slot until it lands.
  taken: number;
  message: string;
  failed: boolean;
  connection: string;
  input: ReturnType<typeof createInput>;
  connect: () => void;
  signIn: () => void;
  signOut: () => void;
  undo: () => void;
  setHidden: (hidden: boolean) => void;
  close: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  const { input } = props;
  return (
    <section
      ref={props.ref}
      class="sticker-sheet stamp-ui"
      data-open={props.open ? 'true' : undefined}
      data-locked={props.account ? undefined : 'true'}
      data-saving={props.saving ? 'true' : undefined}
      inert={!props.open}
      aria-label="シール帳"
      onPointerEnter={props.connect}
      onFocusIn={props.connect}
      onClick={props.onClick}
    >
      <h2 class="visually-hidden">シール</h2>
      <header class="sticker-sheet-head">
        <Show
          when={props.account}
          fallback={
            <button
              class="sticker-login"
              data-nudge={props.nudge % 2 ? 'a' : props.nudge ? 'b' : undefined}
              disabled={props.busy}
              onPointerDown={props.connect}
              onClick={props.signIn}
            >
              <Icon name="LogIn" size={15} />
              {props.restoring ? 'ログインしています…' : 'Google でログイン'}
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
              src={gravatarUrl(props.account!.avatar, 64)}
              alt="Gravatar でアイコンを変更"
              width="28"
              height="28"
            />
          </a>
          {/* One pip per sticker you can place on this page. */}
          <span
            class="sticker-pips"
            role="img"
            aria-label={`このページに貼れるシール 残り${Math.max(0, LIMIT - props.owned)}枚`}
          >
            <For each={Array.from({ length: LIMIT }, (_, n) => n)}>
              {(n) => <span data-used={n < props.owned ? 'true' : undefined} />}
            </For>
          </span>
        </Show>
        <span class="sticker-head-space" />
        <Show when={props.account}>
          <button
            class="sheet-tool stamp-undo"
            disabled={!props.owned}
            onClick={props.undo}
            aria-label="最後に貼ったシールをはがす"
          >
            <Icon name="RotateCcw" size={15} />
          </button>
        </Show>
        <button
          class="sheet-tool stamp-hide"
          aria-pressed={props.hidden ? 'true' : 'false'}
          aria-label="シールを隠す"
          onClick={() => props.setHidden(!props.hidden)}
        >
          <Icon name={props.hidden ? 'EyeOff' : 'Eye'} size={15} />
        </button>
        <Show when={props.account}>
          <button class="sheet-tool" aria-label="ログアウト" onClick={props.signOut}>
            <Icon name="LogOut" size={15} />
          </button>
        </Show>
        <button class="sheet-tool" aria-label="シール帳を閉じる" onClick={props.close}>
          <Icon name="ChevronDown" size={16} />
        </button>
      </header>
      <div class="stamp-choices" role="group" aria-label="シールの種類">
        <For each={STICKER_KINDS}>
          {(item, i) => (
            <button
              class="sheet-sticker"
              data-sticker-kind={i()}
              aria-label={
                props.account
                  ? `${item.name}のシールを貼る${props.remaining > 0 ? '' : '（一番古いシールと入れ替わります）'}`
                  : `${item.name}のシール（ログインすると貼れます）`
              }
              data-taken={props.taken === i() ? 'true' : undefined}
              onPointerDown={(e) => input.grab(e, { kind: i(), from: 'sheet' })}
              onPointerMove={input.follow}
              onPointerUp={input.release}
              onPointerCancel={() => input.cancel(true)}
              onClick={(e) => {
                if (e.detail === 0) input.aimWithKeys(i());
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
          and placing or peeling is spoken through the status line outside the sheet. */}
      <div
        class="stamp-status"
        data-idle={props.message || props.failed || props.connection ? undefined : 'true'}
      >
        <p role="status">
          {props.message || (props.failed ? '' : props.connection)}
          {/* A failure is spoken from the live line outside the sheet, naming the sticker. */}
          <Show when={!props.message && props.failed}>
            <span aria-hidden="true">保存できませんでした</span>
          </Show>
        </p>
      </div>
    </section>
  );
}
