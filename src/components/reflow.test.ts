import { describe, expect, it } from 'vitest';
import { motionFor } from './reflow.ts';

const at = (left: number, top: number) => ({ left, top, bottom: top + 200 });
const H = 800;

describe('motionFor', () => {
  it('glides a card that stays on screen from where it was', () => {
    expect(motionFor(at(300, 100), at(0, 400), H)).toEqual({
      from: [300, -300],
      to: [0, 0],
      opacity: [1, 1],
      scale: [1, 1],
    });
  });
  it('leaves a card alone that has not moved or stays off screen', () => {
    expect(motionFor(at(0, 100), at(0.4, 100.4), H)).toBeNull();
    expect(motionFor(at(0, 2000), at(300, 3000), H)).toBeNull();
    expect(motionFor(undefined, at(0, 3000), H)).toBeNull();
    expect(motionFor(at(0, -900), undefined, H)).toBeNull();
  });
  it('fades out a card that is filtered out, and in one that is filtered in', () => {
    expect(motionFor(at(0, 100), undefined, H)).toMatchObject({ from: [0, 0], opacity: [1, 0] });
    expect(motionFor(undefined, at(0, 100), H)).toMatchObject({ to: [0, 0], opacity: [0, 1] });
  });
  it('fades a card between the screen and off it instead of flying it', () => {
    // Comes from far below: appears where it lands.
    expect(motionFor(at(0, 6000), at(0, 100), H)).toMatchObject({
      from: [0, 0],
      to: [0, 0],
      opacity: [0, 1],
    });
    // Goes far below: fades where it was, held there until it is gone.
    expect(motionFor(at(0, 100), at(0, 6000), H)).toMatchObject({
      from: [0, -5900],
      to: [0, -5900],
      opacity: [1, 0],
    });
  });
  it('counts a card just past the edge of the screen as on it', () => {
    expect(motionFor(at(0, 820), at(0, 500), H)).toMatchObject({ opacity: [1, 1] });
  });
});
