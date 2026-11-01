// Anyone can see the stickers; placing them needs a Google account. The auth SDK is loaded
// once the visitor reaches for the sheet (or straight away if they signed in before),
// so the sign-in popup can open within the click.
import { createSignal } from 'solid-js';
import type { Account } from '../../data/stamp-types';
import { deadline } from '../../data/resilience.mjs';
import { signInMessage } from '../../data/stamp-a11y.mjs';
import { SIGN_IN_TIMEOUT_MS } from '../../data/stamp-limits.mjs';
import { ACCOUNT_KEY, writePref } from './prefs';
type Client = typeof import('../../stamps-client');
// Creates signals: call it synchronously inside the component that owns them.
export function createStampAccount(options: {
  client: () => Promise<Client>;
  onMessage: (text: string) => void;
  beforeSignOut: () => void;
}) {
  const { client, onMessage, beforeSignOut } = options;
  const [account, setAccount] = createSignal<Account | null>(null),
    [signingIn, setSigningIn] = createSignal(false);
  let watching: Promise<void> | undefined;
  function connect() {
    return (watching ||= client()
      .then((api) =>
        api.watchAccount((next) => {
          setAccount(next);
          writePref(ACCOUNT_KEY, next ? '1' : null);
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
    onMessage('');
    try {
      const api = await deadline(client(), SIGN_IN_TIMEOUT_MS);
      await deadline(connect(), SIGN_IN_TIMEOUT_MS);
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
  return { account, signingIn, connect, signIn, signOut };
}
