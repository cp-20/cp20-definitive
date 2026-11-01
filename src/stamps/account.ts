// Anyone can see the stickers; placing them needs a Google account. The auth SDK is loaded
// once the visitor reaches for the sheet (or straight away if they signed in before),
// so the sign-in popup can open within the click.
import { createSignal, onSettled } from 'solid-js';
import type { Account } from './types.ts';
import { signInMessage } from './a11y.ts';
import { ACCOUNT_KEY, readPref, writePref } from './prefs.ts';
type Client = typeof import('./client.ts');
// Creates signals: call it synchronously inside the component that owns them.
export function createStampAccount(options: {
  client: () => Promise<Client>;
  onMessage: (text: string) => void;
  beforeSignOut: () => void;
}) {
  const { client, onMessage, beforeSignOut } = options;
  const [account, setAccount] = createSignal<Account | null>(null),
    [signingIn, setSigningIn] = createSignal(false),
    // A visitor who signed in before is being signed back in: the sign-in button waits.
    [restoring, setRestoring] = createSignal(false);
  let watching: Promise<void> | undefined;
  function connect() {
    if (!watching && readPref(ACCOUNT_KEY)) setRestoring(true);
    return (watching ||= client()
      .then((api) =>
        api.watchAccount((next) => {
          setAccount(next);
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
        if (next) setAccount(next);
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
    try {
      await (await client()).signOut();
    } catch {
      onMessage('ログアウトできませんでした');
    }
  }
  return { account, signingIn, restoring, connect, signIn, signOut };
}
