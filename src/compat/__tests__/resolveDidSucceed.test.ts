import { resolveDidSucceed } from '../resolveDidSucceed';

const base = { x: 0, y: 0, absoluteX: 0, absoluteY: 0 };

describe('resolveDidSucceed', () => {
  it.each([
    [{ canceled: false }, undefined, true],
    [{ canceled: true }, undefined, false],
    [{}, false, false],
    [{}, true, true],
  ])('(%o, %p) -> %p', (event, success, expected) => {
    expect(resolveDidSucceed({ ...base, ...event }, success)).toBe(expected);
  });
});
