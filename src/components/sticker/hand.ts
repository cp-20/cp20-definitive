// The sticker in hand, drawn outside Solid on every frame so dragging stays smooth.
import { springStep } from '../../data/stamp-motion.mjs';
export function createHand(ghost: () => HTMLElement | undefined, keepRunning: () => boolean) {
  const m = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    tilt: 0,
    scale: 1,
    ts: 1,
    raf: 0,
    // Called once the sticker has flown to where it was sent.
    home: null as null | (() => void),
  };
  function paint() {
    const el = ghost();
    if (!el) return;
    el.style.transform = `translate(${m.x}px, ${m.y}px) rotate(${m.tilt}deg) scale(${m.scale})`;
  }
  function animate() {
    cancelAnimationFrame(m.raf);
    const step = () => {
      const settled = springStep(m);
      paint();
      if (m.home && settled) {
        const done = m.home;
        m.home = null;
        done();
        return;
      }
      if (keepRunning() || m.home) m.raf = requestAnimationFrame(step);
    };
    m.raf = requestAnimationFrame(step);
  }
  const stop = () => cancelAnimationFrame(m.raf);
  // Send the sticker to a point on screen at a scale, then call `done`.
  function flyTo(point: { x: number; y: number }, scale: number, done: () => void) {
    m.tx = point.x;
    m.ty = point.y;
    m.ts = scale;
    m.home = done;
    animate();
  }
  return { m, paint, animate, stop, flyTo };
}
