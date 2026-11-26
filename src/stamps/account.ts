// Anyone can see the stickers; placing them needs a Google account. The auth SDK is loaded
// once the visitor reaches for the sheet (or straight away if they signed in before),
// so the sign-in popup can open within the click.
import { createSignal, onSettled } from 'solid-js';
import type { Account } from './types.ts';
import { signInMessage } from './a11y.ts';
import { ACCOUNT_KEY, readPref, writePref } from './prefs.ts';
import { AvatarError, compressAvatar, type AvatarSource } from './avatar.ts';
import type { OwnAvatar } from './Avatar.tsx';
type Client = typeof import('./client.ts');
export function createStampAccount(options: {
  client: () => Promise<Client>;
  onMessage: (text: string) => void;
  beforeSignOut: () => void;
}) {
  const { client, onMessage, beforeSignOut } = options;
  const [account, setAccount] = createSignal<Account | null>(null),
    [signingIn, setSigningIn] = createSignal(false),
    // A visitor who signed in before is being signed back in: the sign-in button waits.
    [restoring, setRestoring] = createSignal(false),
    // Your icon as last changed on this visit, and what changing it is doing.
    [own, setOwn] = createSignal<OwnAvatar>({ version: 0 }),
    [avatarBusy, setAvatarBusy] = createSignal(false),
    [avatarStatus, setAvatarStatus] = createSignal<{ text: string; error?: boolean }>({ text: '' }),
    // Where your stored picture came from (null: none, so the pattern; undefined: not known yet).
    [avatarSource, setAvatarSource] = createSignal<AvatarSource | null | undefined>(undefined);
  const showOwn = (next: OwnAvatar) => {
    const before = own().override;
    if (before) URL.revokeObjectURL(before);
    setOwn(next);
  };
  // The new icon shows for itself; only a failure is put in words, and only for a change you
  // asked for (`quiet` is the first sign-in's own).
  async function changeAvatar(work: () => Promise<OwnAvatar>, quiet = false) {
    if (avatarBusy()) return;
    setAvatarBusy(true);
    setAvatarStatus({ text: '' });
    try {
      showOwn(await work());
    } catch (e) {
      if (!quiet)
        setAvatarStatus({
          text: e instanceof AvatarError ? e.message : 'アイコンを保存できませんでした',
          error: true,
        });
    } finally {
      setAvatarBusy(false);
    }
  }
  const store = async (picture: Blob, source: AvatarSource) => {
    await (await client()).uploadAvatar(picture, source);
    setAvatarSource(source);
    return { version: Date.now(), override: URL.createObjectURL(picture) };
  };
  /** Shrinks `file` and stores it as your icon. */
  const uploadAvatar = (file: File) => changeAvatar(async () => store(await compressAvatar(file), 'upload'));
  /** Stores your Google account's picture as your icon. */
  const useGooglePhoto = (quiet = false) =>
    changeAvatar(
      async () => store(await compressAvatar(await (await client()).fetchGooglePhoto()), 'google'),
      quiet,
    );
  /**
   * Goes back from a picture you chose: to your Google account's picture, or without one, to
   * your pattern (the picture is deleted).
   */
  const resetAvatar = () =>
    account()?.photo
      ? useGooglePhoto()
      : changeAvatar(async () => {
          await (await client()).removeAvatar();
          setAvatarSource(null);
          return { version: Date.now(), override: null };
        });
  // On signing in, find where your picture came from; with none yet (the first sign-in), your
  // Google account's picture becomes your icon.
  let checked = '';
  async function prepareAvatar(next: Account) {
    if (checked === next.uid) return;
    checked = next.uid;
    try {
      const source = await (await client()).avatarSource(next.uid);
      setAvatarSource(source);
      if (source === null && next.photo) await useGooglePhoto(true);
    } catch {
      checked = '';
    }
  }
  const receive = (next: Account | null) => {
    setAccount(next);
    if (next) void prepareAvatar(next);
  };
  let watching: Promise<void> | undefined;
  function connect() {
    if (!watching && readPref(ACCOUNT_KEY)) setRestoring(true);
    return (watching ||= client()
      .then((api) =>
        api.watchAccount((next) => {
          receive(next);
          setRestoring(false);
          writePref(ACCOUNT_KEY, next ? '1' : null);
        }),
      )
      .then(() => {})
      .catch(() => {
        watching = undefined;
        setRestoring(false);
      }));
  }
  // A visitor who signed in before is signed back in straight away.
  onSettled(() => {
    if (readPref(ACCOUNT_KEY)) void connect();
  });
  async function signIn() {
    if (signingIn()) return;
    setSigningIn(true);
    onMessage('');
    try {
      const api = await client();
      await connect();
      if (!account()) {
        const next = await api.signIn();
        if (next) receive(next);
        else onMessage('Google アカウントでログインしてください');
      }
    } catch (e) {
      onMessage(signInMessage((e as { code?: string }).code));
    } finally {
      setSigningIn(false);
    }
  }
  async function signOut() {
    beforeSignOut();
    showOwn({ version: 0 });
    setAvatarStatus({ text: '' });
    setAvatarSource(undefined);
    checked = '';
    try {
      await (await client()).signOut();
    } catch {
      onMessage('ログアウトできませんでした');
    }
  }
  return {
    account,
    signingIn,
    restoring,
    connect,
    signIn,
    signOut,
    own,
    avatarBusy,
    avatarStatus,
    avatarSource,
    uploadAvatar,
    resetAvatar,
  };
}
