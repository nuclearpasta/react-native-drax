import { gestureDidSucceed } from '../gestureDidSucceed';

const event = { x: 0, y: 0, absoluteX: 0, absoluteY: 0 };

describe('gestureDidSucceed', () => {
  it('uses event.canceled when no success argument is passed (RNGH 3.x)', () => {
    expect(gestureDidSucceed({ ...event, canceled: false })).toBe(true);
    expect(gestureDidSucceed({ ...event, canceled: true })).toBe(false);
  });

  it('prefers the success argument (RNGH v2, 3.0.0-beta.2 and earlier)', () => {
    expect(gestureDidSucceed(event, true)).toBe(true);
    expect(gestureDidSucceed(event, false)).toBe(false);
    expect(gestureDidSucceed({ ...event, canceled: true }, true)).toBe(true);
  });

  it('defaults to success when no end flag is present', () => {
    expect(gestureDidSucceed(event)).toBe(true);
  });
});
