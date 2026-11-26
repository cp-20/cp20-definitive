// The sticker sheet: sign-in, the stickers to take, your remaining count and the sheet's tools,
// with the tab it folds into.
import { createSignal, For, Show } from 'solid-js';
import type { Account } from './types.ts';
import { STAMPS_PER_PAGE as LIMIT } from './limits.ts';
import Icon from '../components/Icon.tsx';
import { SHEET_KINDS, STICKER_KINDS, StickerFace } from './kinds.tsx';
import { Avatar, type OwnAvatar } from './Avatar.tsx';
import { AVATAR_SHOWN_MAX, type AvatarSource } from './avatar.ts';
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
      aria-label={`シール帳を開く (このページのシール${props.count}枚)`}
      title={`シール帳を開く (このページのシール${props.count}枚)`}
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
  own: OwnAvatar;
  avatarBusy: boolean;
  avatarStatus: { text: string; error?: boolean };
  avatarSource: AvatarSource | null | undefined;
  uploadAvatar: (file: File) => void;
  resetAvatar: () => void;
  undo: () => void;
  setHidden: (hidden: boolean) => void;
  close: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  const { input } = props;
  // The icon editor under the header, opened from your icon.
  const [editing, setEditing] = createSignal(false);
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
          <button
            class="account-avatar"
            aria-expanded={editing() ? 'true' : 'false'}
            aria-controls="avatar-editor"
            aria-label="アイコンを変える"
            title="アイコンを変える"
            onClick={() => setEditing(!editing())}
          >
            <Avatar uid={props.account!.uid} own={props.own} size={28} />
          </button>
          {/* One pip per sticker you can place on this page. */}
          <span
            class="sticker-pips"
            role="img"
            aria-label={`このページに貼れるシール 残り${Math.max(0, LIMIT - props.owned)}枚`}
            title={`このページに貼れるシール：あと${Math.max(0, LIMIT - props.owned)}枚 (最大${LIMIT}枚)`}
          >
            <For each={Array.from({ length: LIMIT }, (_, n) => n)}>
              {(n) => <span data-used={n < props.owned ? 'true' : undefined} />}
            </For>
          </span>
          <span class="sticker-remaining" aria-hidden="true">
            あと{Math.max(0, LIMIT - props.owned)}枚
          </span>
        </Show>
        <span class="sticker-head-space" />
        <Show when={props.account}>
          <button
            class="sheet-tool stamp-undo"
            disabled={!props.owned}
            onClick={props.undo}
            aria-label="最後に貼ったシールをはがす"
            title="最後に貼ったシールをはがす"
          >
            <Icon name="RotateCcw" size={15} />
          </button>
        </Show>
        <button
          class="sheet-tool stamp-hide"
          aria-pressed={props.hidden ? 'true' : 'false'}
          aria-label="シールを隠す"
          title={props.hidden ? 'ページ上のシールを再表示する' : 'ページ上のシールを一時的に隠す'}
          onClick={() => props.setHidden(!props.hidden)}
        >
          <Icon name={props.hidden ? 'EyeOff' : 'Eye'} size={15} />
        </button>
        <Show when={props.account}>
          <button class="sheet-tool" aria-label="ログアウト" title="ログアウト" onClick={props.signOut}>
            <Icon name="LogOut" size={15} />
          </button>
        </Show>
        <button
          class="sheet-tool"
          aria-label="シール帳を閉じる"
          title="シール帳を閉じる"
          onClick={props.close}
        >
          <Icon name="ChevronDown" size={16} />
        </button>
      </header>
      {/* Your icon, shown as it peeks out from behind your stickers, with what you can do to it.
          Only a problem is put in words. */}
      <Show when={props.account && editing()}>
        <div
          id="avatar-editor"
          class="avatar-editor"
          role="group"
          aria-label="シールに添えるアイコン"
          aria-busy={props.avatarBusy ? 'true' : undefined}
        >
          <span class="avatar-editor-preview" aria-hidden="true">
            <span class="sticker" data-kind={0}>
              <StickerFace kind={0} />
            </span>
            <Avatar
              class="avatar-editor-icon"
              uid={props.account!.uid}
              own={props.own}
              size={AVATAR_SHOWN_MAX}
            />
          </span>
          <div class="avatar-editor-actions">
            <label class="sheet-button" data-disabled={props.avatarBusy || undefined}>
              <Icon name="ImageUp" size={14} />
              画像を選ぶ
              <input
                class="visually-hidden"
                type="file"
                accept="image/*"
                disabled={props.avatarBusy}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) props.uploadAvatar(file);
                }}
              />
            </label>
            {/* From a picture you chose, back to your Google account's picture (or, without one,
                to your pattern). */}
            <Show when={props.avatarSource === 'upload'}>
              <button class="sheet-button" disabled={props.avatarBusy} onClick={props.resetAvatar}>
                <Icon name="RotateCcw" size={14} />
                {props.account?.photo ? 'Google のアイコンに戻す' : '模様に戻す'}
              </button>
            </Show>
          </div>
          <p class="avatar-editor-status" role="status">
            {props.avatarStatus.text}
          </p>
        </div>
      </Show>
      {/* Before signing in, one line says what signing in is for and who sees what you place. */}
      <Show when={!props.account}>
        <p class="sticker-hint">ログインすると貼れます。貼ったシールはみんなに見えます。</p>
      </Show>
      <div class="stamp-choices" role="group" aria-label="シールの種類">
        <For each={SHEET_KINDS}>
          {(kind) => (
            <button
              class="sheet-sticker"
              data-sticker-kind={kind}
              title={
                props.account
                  ? `${STICKER_KINDS[kind].name}のシール`
                  : `${STICKER_KINDS[kind].name}のシール (ログインすると貼れます)`
              }
              aria-label={
                props.account
                  ? `${STICKER_KINDS[kind].name}のシールを貼る${props.remaining > 0 ? '' : ' (一番古いシールと入れ替わります)'}`
                  : `${STICKER_KINDS[kind].name}のシール (ログインすると貼れます)`
              }
              data-taken={props.taken === kind ? 'true' : undefined}
              onPointerDown={(e) => input.grab(e, { kind, from: 'sheet' })}
              onPointerMove={input.follow}
              onPointerUp={input.release}
              onPointerCancel={() => input.cancel(true)}
              onClick={(e) => {
                if (e.detail === 0) input.aimWithKeys(kind);
              }}
            >
              <span class="sticker" data-kind={kind}>
                <StickerFace kind={kind} />
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
