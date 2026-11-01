// Visitors can put stickers on any page of the site. This puts the pieces together: the account
// (account.ts), the stickers and their saving (store.ts), where they are drawn (placement.ts),
// your changes (edits.ts), the sticker in hand and its input (hand.ts, input.ts), and the sheet
// they are taken from (sheet.ts).
import { createEffect, createSignal, onSettled, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { PlacedStamp } from './types.ts';
import { stampAnnouncement } from './a11y.ts';
import { visualKey } from './layout.ts';
import { createStampAccount } from './account.ts';
import { createStampStore } from './store.ts';
import { createPlacement } from './placement.ts';
import { createEdits } from './edits.ts';
import { createHand } from './hand.ts';
import { createInput } from './input.ts';
import { createSheet } from './sheet.ts';
import { stickerName } from './kinds.tsx';
import { HIDE_KEY, readPref, writePref } from './prefs.ts';
import { StampLayer } from './StampLayer.tsx';
import { InHand } from './InHand.tsx';
import { StickerSheet, StickerTab } from './StickerSheet.tsx';
// The sticker client is only loaded once the page needs stickers (and again after a failed load).
let clientPromise: Promise<typeof import('./client.ts')> | undefined;
const client = () =>
  (clientPromise ||= import('./client.ts').catch((e) => {
    clientPromise = undefined;
    throw e;
  }));
export function StampProvider(props: { path: string; enabled: boolean; children: JSX.Element }) {
  const [hidden, setHidden] = createSignal(false),
    // A sign-in problem, shown on the sheet.
    [message, setMessage] = createSignal(''),
    // The last change could not be saved (and was undone).
    [failed, setFailed] = createSignal(false),
    // Spoken only: where the sticker in hand is, and what placing or peeling it did.
    [spoken, setSpoken] = createSignal(''),
    [nudge, setNudge] = createSignal(0);
  function say(text: string) {
    // Clearing first makes a repeated sentence count as a change for screen readers.
    setSpoken('');
    queueMicrotask(() => setSpoken(text));
  }
  const account = createStampAccount({
    client,
    onMessage: setMessage,
    beforeSignOut: () => hand.cancel(false),
  });
  const connect = () => void account.connect();
  const store = createStampStore({
    path: () => props.path,
    enabled: () => props.enabled,
    account: account.account,
    client,
    changed: () => placement.reposition(),
    failed: (op) => {
      setFailed(true);
      // Said from outside the sheet (inert while closed), naming the sticker that went back.
      say(stampAnnouncement('failed', stickerName(op.type === 'remove' ? op.target.kind : op.stamp.kind), 0));
    },
  });
  const placement = createPlacement(store.projected, hidden);
  const sheet = createSheet({
    enabled: () => props.enabled,
    signedIn: () => !!account.account(),
    busy: () => account.signingIn() || account.restoring(),
    connect,
    remaining: (without) => edits.remaining(without),
    closing: () => {
      if (hand.held()?.from === 'sheet') hand.cancel(false);
    },
  });
  const edits = createEdits({
    path: () => props.path,
    own: store.own,
    isOwn: store.isOwn,
    apply: (change) => {
      setMessage('');
      setFailed(false);
      store.apply(change);
    },
    say,
    focusPastDeleteButton: sheet.focusPastDeleteButton,
    sheet: sheet.sheet,
  });
  const hand = createHand({
    isOwn: store.isOwn,
    own: edits.kept,
    remaining: () => edits.remaining(),
    put: edits.put,
    erase: edits.erase,
    say,
    open: sheet.open,
    sheet: sheet.sheet,
    tab: sheet.tab,
    sheetFocus: () => sheet.sheetFocus(),
    slotCenter: sheet.slotCenter,
  });
  // A locked sticker was reached for: point at the sign-in button instead.
  function askToSignIn() {
    setMessage('');
    setNudge((n) => n + 1);
    say('シールを貼るには Google でログインしてください');
    if (!sheet.open()) sheet.toggle();
    connect();
  }
  const input = createInput(hand, {
    signedIn: () => !!account.account(),
    askToSignIn,
    isOwn: store.isOwn,
    isLeaving: (s) => edits.isLeaving(visualKey(s)),
  });
  createEffect(
    () => props.path,
    () => hand.cancel(false),
  );
  onSettled(() => {
    setHidden(readPref(HIDE_KEY) === 'true');
    return () => hand.stop();
  });
  const avatarOf = (s: PlacedStamp) => s.avatar || (store.isOwn(s) ? account.account()?.avatar : undefined);
  // A sticker of yours in hand from the page is put back (peeled off) by a click on the sheet.
  const dropOnSheet = (e: MouseEvent) => {
    const h = hand.held();
    if (h?.mode === 'aim' && h.from === 'page') hand.drop(e.clientX, e.clientY);
  };
  return (
    <>
      {props.children}
      <StampLayer
        stamps={placement.visible()}
        path={props.path}
        held={hand.held()}
        isOwn={store.isOwn}
        avatarOf={avatarOf}
        isFresh={edits.isFresh}
        settlesFrom={edits.settlesFrom}
        isLeaving={edits.isLeaving}
        lifted={hand.lifted()}
        stickerAt={placement.stickerAt}
        input={input}
        erase={(s) => edits.erase(s)}
      />
      <InHand held={hand.held()} ghostKind={hand.ghostKind()} setGhost={hand.setGhost} input={input} />
      <Show when={props.enabled}>
        <p class="visually-hidden" role="status">
          {spoken()}
        </p>
        <StickerTab
          ref={sheet.setTab}
          open={sheet.open()}
          count={store.projected().length}
          failed={failed()}
          connect={connect}
          onClick={(e) => {
            const h = hand.held();
            if (h?.mode === 'aim' && h.from === 'page') dropOnSheet(e);
            else sheet.toggle();
          }}
        />
        <StickerSheet
          ref={sheet.setSheet}
          open={sheet.open()}
          account={account.account()}
          busy={account.signingIn() || account.restoring()}
          restoring={account.restoring()}
          nudge={nudge()}
          saving={store.saving()}
          owned={store.own().length}
          remaining={edits.remaining()}
          hidden={hidden()}
          taken={hand.taken()}
          message={message()}
          failed={failed()}
          connection={store.connection()}
          input={input}
          connect={connect}
          signIn={account.signIn}
          signOut={account.signOut}
          undo={edits.undo}
          setHidden={(value) => {
            setHidden(value);
            writePref(HIDE_KEY, String(value));
          }}
          close={sheet.toggle}
          onClick={(e) => {
            if (!(e.target as Element).closest('button, a')) dropOnSheet(e);
          }}
        />
      </Show>
    </>
  );
}
