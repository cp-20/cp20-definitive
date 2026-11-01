import type { JSX } from '@solidjs/web';
import Icon from './Icon.tsx';
/** Opens the <Modal> with this id. */
export const openModal = (id: string) =>
  (document.getElementById(id) as HTMLDialogElement | null)?.showModal();
/**
 * A native modal <dialog>: Esc closes it and focus returns to what opened it. A click on the
 * backdrop also closes it; the sheet fills the dialog, so only the backdrop targets the dialog itself.
 */
export default function Modal(props: { id: string; title: JSX.Element; children: JSX.Element }) {
  return (
    <dialog
      id={props.id}
      class="modal"
      aria-labelledby={`${props.id}-title`}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div class="modal-sheet">
        <div class="modal-head">
          <h2 id={`${props.id}-title`}>{props.title}</h2>
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
