import { STEP_PX, TouchpadTracker } from '../src/components/touchpadGesture';

describe('TouchpadTracker', () => {
  let t: TouchpadTracker;
  beforeEach(() => {
    t = new TouchpadTracker();
  });

  it('treats a touch that barely moves as a tap', () => {
    expect(t.move(3, 4)).toEqual([]);
    expect(t.release(3, 4)).toBe('tap');
  });

  it('sends one arrow per step along the dominant axis', () => {
    expect(t.move(STEP_PX - 1, 5)).toEqual([]);
    expect(t.move(STEP_PX + 2, 8)).toEqual(['right']);
    expect(t.move(STEP_PX * 3 + 1, 10)).toEqual(['right', 'right']);
    // Swipe already sent keys: nothing extra on release.
    expect(t.release(STEP_PX * 3 + 1, 10)).toBeNull();
  });

  it('handles vertical swipes and direction changes', () => {
    expect(t.move(0, -(STEP_PX + 1))).toEqual(['up']); // anchor now at -STEP
    expect(t.move(0, -STEP_PX + 10)).toEqual([]); // back down 10 px: not a step yet
    expect(t.move(0, 2)).toEqual(['down']); // 50 px down from the anchor
  });

  it('turns a short flick into one arrow on release', () => {
    expect(t.move(-30, 4)).toEqual([]);
    expect(t.release(-30, 4)).toBe('left');
  });

  it('ignores a small wobble that is neither a tap nor a flick', () => {
    t.move(15, 0);
    expect(t.release(15, 0)).toBeNull();
  });

  it('starts fresh after reset', () => {
    t.move(STEP_PX + 1, 0);
    t.reset();
    expect(t.moved).toBe(false);
    expect(t.release(0, 0)).toBe('tap');
  });
});
