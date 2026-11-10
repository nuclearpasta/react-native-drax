import type { DraxPanGestureConfig } from '../../compat';
import type { CollisionAlgorithm, SpatialEntry } from '../../types';
import { useDragGesture } from '../useDragGesture';

// A 100x100 item is grabbed near one edge and moved so that only the touch
// point, or only the hover center, is over the receiver (x 150..250).
// 'center' (default) hit-tests at the hover view's center; 'touch' hit-tests
// at the finger.

let mockConfig: DraxPanGestureConfig;
jest.mock('../../compat', () => ({
  useDraxPanGesture: (c: DraxPanGestureConfig) => {
    mockConfig = c;
    return {};
  },
}));
jest.mock('react-native-reanimated', () => ({ measure: jest.fn(() => null) }));
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
}));

const sv = <T>(value: T) => ({ value });
const entry = (
  id: string,
  x: number,
  receptive: boolean,
  draggable: boolean,
  collisionAlgorithm: CollisionAlgorithm = 'center'
): SpatialEntry => ({
  id, x, y: 0, width: 100, height: 100, parentIndex: -1,
  receptive, monitoring: false, draggable, rejectOwnChildren: false, collisionAlgorithm,
});
const mockHandleReceiverChange = jest.fn();
const mockHandleDragEnd = jest.fn();
const mockCtx = {
  draggedIdSV: sv(''),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  dragPhaseSV: sv('idle'),
  hoverPositionSV: sv({ x: 0, y: 0 }),
  dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  spatialIndexSV: sv<SpatialEntry[]>([]),
  scrollOffsetsSV: sv([{ x: 0, y: 0 }, { x: 0, y: 0 }]),
  grabOffsetSV: sv({ x: 0, y: 0 }),
  startPositionSV: sv({ x: 0, y: 0 }),
  rootOffsetSV: sv({ x: 0, y: 0 }),
  rootViewRef: { current: null },
  needsUpdatesSV: sv(true),
  jsPendingSV: sv(false),
  lastMonitorKeySV: sv(''),
  skippedSV: sv(false),
  handleDragStart: jest.fn(),
  handleReceiverChange: mockHandleReceiverChange,
  handleDragEnd: mockHandleDragEnd,
};
jest.mock('../useDraxContext', () => ({
  useDraxContext: () => mockCtx,
  useDraxInternalContext: () => mockCtx,
}));

/** Grab at x=grabX inside the item, move the finger to x=toX; return the receiver. */
const dragTo = (algo: CollisionAlgorithm, grabX: number, toX: number) => {
  mockHandleReceiverChange.mockClear();
  mockCtx.receiverIdSV.value = '';
  mockCtx.spatialIndexSV.value = [entry('item', 0, false, true), entry('zone', 150, true, false, algo)];
  mockConfig.onActivate({ x: grabX, y: 50, absoluteX: grabX, absoluteY: 50 } as never);
  mockConfig.onUpdate({ x: grabX, y: 50, absoluteX: toX, absoluteY: 50 } as never);
  return mockHandleReceiverChange.mock.calls.at(-1)?.[1] as string;
};

describe('hit-test point (no drag handle)', () => {
  beforeEach(() => {
    useDragGesture('item', sv(0) as never, sv(true) as never, sv(250) as never);
  });

  it("'center': touch over the receiver, center not -> no receiver", () => {
    // touch at 160 (in 150..250); hover left = 160-90 = 70, center = 120 (outside)
    expect(dragTo('center', 90, 160)).toBe('');
  });

  it("'center': center over the receiver, touch not -> receives", () => {
    // touch at 140 (outside); hover left = 130, center = 180 (inside)
    expect(dragTo('center', 10, 140)).toBe('zone');
  });

  it("'touch': the receiver under the touch point receives", () => {
    expect(dragTo('touch', 90, 160)).toBe('zone');
  });

  it("'touch': no receive when only the item center is over the receiver", () => {
    expect(dragTo('touch', 10, 140)).toBe('');
  });

  it('passes the root-relative finger position to handleDragEnd on drop', () => {
    mockHandleDragEnd.mockClear();
    mockCtx.rootOffsetSV.value = { x: 0, y: 0 };
    dragTo('touch', 90, 160);
    mockConfig.onDeactivate({ x: 90, y: 50, absoluteX: 160, absoluteY: 50 } as never, true);
    expect(mockHandleDragEnd).toHaveBeenCalledWith('item', 'zone', false, [], { x: 160, y: 50 });
  });
});
