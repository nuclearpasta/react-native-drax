import { isTransformPositioned } from '../math';

// DraxView measures a view with measure() (includes transforms) when its
// measureLayout position has a 0 coordinate, to detect LegendList-style rows.
describe('isTransformPositioned', () => {
  it('vertical FlatList row (x 0, y 88) shifted up by a sortable shift -> layout, not transform', () => {
    expect(isTransformPositioned({ x: 0, y: 88 }, { x: 0, y: 46 })).toBe(false);
  });

  it('horizontal FlatList row (x 88, y 0) shifted -> layout, not transform', () => {
    expect(isTransformPositioned({ x: 88, y: 0 }, { x: 46, y: 0 })).toBe(false);
  });

  it('LegendList row (0, 0) translated to y 300 -> transform', () => {
    expect(isTransformPositioned({ x: 0, y: 0 }, { x: 0, y: 300 })).toBe(true);
  });

  it('LegendList row in a padded list (x 16, y 0) translated to y 300 -> transform', () => {
    expect(isTransformPositioned({ x: 16, y: 0 }, { x: 16, y: 300 })).toBe(true);
  });

  it('row at (0, 0) with no transform -> layout', () => {
    expect(isTransformPositioned({ x: 0, y: 0 }, { x: 0.5, y: 0 })).toBe(false);
  });
});
