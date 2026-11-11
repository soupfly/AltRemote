/**
 * Pure gesture logic for the touchpad, kept separate from React so it can be unit-tested.
 *
 * - Move: one arrow key per STEP px travelled along the dominant axis (a long swipe
 *   scrolls through several items).
 * - A short flick that never reaches STEP still sends one arrow on release.
 * - Tap (barely moved): OK. Hold without moving: long OK (START_LONG … END_LONG).
 */
export type Dir = 'up' | 'down' | 'left' | 'right';

export const STEP_PX = 48;
export const TAP_SLOP_PX = 10;
export const FLICK_MIN_PX = 24;

export class TouchpadTracker {
  private anchorX = 0;
  private anchorY = 0;
  moved = false;
  sent = 0;

  reset() {
    this.anchorX = 0;
    this.anchorY = 0;
    this.moved = false;
    this.sent = 0;
  }

  /** Feed the total offset from the touch start; returns the arrows to send now. */
  move(dx: number, dy: number): Dir[] {
    if (!this.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) this.moved = true;
    const out: Dir[] = [];
    // Loop so a very fast move that skips several steps still sends them all.
    for (let guard = 0; guard < 20; guard++) {
      const rx = dx - this.anchorX;
      const ry = dy - this.anchorY;
      if (Math.abs(rx) >= STEP_PX && Math.abs(rx) > Math.abs(ry)) {
        out.push(rx > 0 ? 'right' : 'left');
        this.anchorX += Math.sign(rx) * STEP_PX;
        this.anchorY = dy;
      } else if (Math.abs(ry) >= STEP_PX && Math.abs(ry) >= Math.abs(rx)) {
        out.push(ry > 0 ? 'down' : 'up');
        this.anchorY += Math.sign(ry) * STEP_PX;
        this.anchorX = dx;
      } else {
        break;
      }
    }
    this.sent += out.length;
    return out;
  }

  /** On release: 'tap', a flick direction, or null when the swipe already sent keys. */
  release(dx: number, dy: number): 'tap' | Dir | null {
    if (!this.moved) return 'tap';
    if (this.sent > 0) return null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < FLICK_MIN_PX) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }
}
