import { computeGrabOffsetWorklet } from '../math';

// A sortable row: Yoga (layout) y = 100, permanently shifted down one 60pt
// slot by a transform, so it is drawn at y = 160. The spatial index still
// holds y = 100; only the gesture event sees the shifted view.
const yogaY = 100;
const shift = 60;
const visual = { x: 0, y: yogaY + shift };

describe('computeGrabOffsetWorklet', () => {
  it('uses the event position as-is without a handle', () => {
    const touchInView = { x: 30, y: 20 };
    expect(computeGrabOffsetWorklet(touchInView, { x: 0, y: 0 })).toEqual(touchInView);
  });

  it('adds the handle offset within the view', () => {
    // Handle at (280, 12) in the row; touch at (8, 10) inside the handle.
    const handleOffset = { x: 280, y: 12 };
    const touchInHandle = { x: 8, y: 10 };
    expect(computeGrabOffsetWorklet(touchInHandle, handleOffset)).toEqual({ x: 288, y: 22 });
  });

  it('derives the shifted visual position for a handle drag', () => {
    const handleOffset = { x: 280, y: 12 };
    const touchInHandle = { x: 8, y: 10 };
    const touch = {
      x: visual.x + handleOffset.x + touchInHandle.x,
      y: visual.y + handleOffset.y + touchInHandle.y,
    };
    const grab = computeGrabOffsetWorklet(touchInHandle, handleOffset);
    // Same math as useDragGesture onActivate: view position = touch - grab.
    const viewPos = { x: touch.x - grab.x, y: touch.y - grab.y };
    expect(viewPos).toEqual(visual);
    expect(viewPos.y).not.toBe(yogaY);
  });
});
