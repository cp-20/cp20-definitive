import type { JSX } from '@solidjs/web';
import Icon from './Icon.tsx';
/** Opens the <Modal> with this id. */
export const openModal = (id: string) =>
  (document.getElementById(id) as HTMLDialogElement | null)?.showModal();
/** The button that opens a <Modal> (marked `data-opens="<id>"`), if the page has one. */
export const openerOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-opens="${CSS.escape(id)}"]`);
/**
 * Opens a dialog that a URL's #fragment names (/about#isucon2026, /#qr). When it closes, focus
 * goes to the button that opens it, and the fragment is dropped so the URL no longer opens it.
 */
export function openFromHash(dialog: HTMLDialogElement) {
  if (dialog.open) return;
  dialog.dataset.fromHash = '';
  dialog.showModal();
  // Nothing was pressed to open it, so focus starts at its title instead of ringing the close
  // button; the next Tab reaches the button.
  dialog.querySelector<HTMLElement>('.modal-head h2')?.focus();
}
/**
 * A native modal <dialog>: Esc closes it and focus returns to what opened it. A click on the
 * backdrop also closes it; the sheet fills the dialog, so only the backdrop targets the dialog itself.
 * Its id is also a URL fragment that opens it (site/navigation.ts).
 */
export default function Modal(props: {
  id: string;
  title: JSX.Element;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <dialog
      id={props.id}
      class={['modal', props.class]}
      aria-labelledby={`${props.id}-title`}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      onClose={(e) => {
        const dialog = e.currentTarget;
        if (location.hash === `#${dialog.id}`)
          history.replaceState(history.state, '', location.pathname + location.search);
        if (dialog.dataset.fromHash === undefined) return;
        delete dialog.dataset.fromHash;
        openerOf(dialog.id)?.focus({ preventScroll: true });
      }}
    >
      <div class="modal-sheet">
        <div class="modal-head">
          <h2 id={`${props.id}-title`} tabindex="-1">
            {props.title}
          </h2>
          <button
            type="button"
            class="icon-button modal-close"
            aria-label="閉じる"
            onClick={(e) => e.currentTarget.closest('dialog')?.close()}
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        {props.children}
      </div>
    </dialog>
  );
}
