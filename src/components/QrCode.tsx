import Modal from './Modal.tsx';
// The site's address for someone in front of you: the QR code to point a phone at, and the
// address in large letters to type. Opened from the footer, or straight away at /#qr.
// The code is a static file drawn by scripts/build/qr.ts.
export default function QrCode() {
  return (
    <Modal
      id="qr"
      class="qr-modal"
      title={
        <>
          <img src="/stamps/clover.svg" alt="" width="34" height="34" />
          cp20.dev
        </>
      }
    >
      <img
        class="qr-code"
        src="/images/qr-cp20.svg"
        alt="https://cp20.dev を開く QR コード"
        width="264"
        height="264"
        fetchpriority="low"
      />
    </Modal>
  );
}
