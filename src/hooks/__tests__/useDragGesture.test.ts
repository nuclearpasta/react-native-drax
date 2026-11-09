import type { DraxPanGestureConfig } from '../../compat';
import { useDragGesture } from '../useDragGesture';

// useDragGesture calls no React hooks itself, so it runs as a plain function
// once its two dependencies are mocked: the compat pan hook (to capture the
// callbacks) and the Drax context (plain `{ value }` objects stand in for
// SharedValues). runOnJS calls through synchronously.
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
}));

const sv = <T>(value: T) => ({ value });
const mockHandleDragEnd = jest.fn();
const mockCtx = {
  draggedIdSV: sv(''),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  dragPhaseSV: sv('dragging'),
  hoverPositionSV: sv({ x: 0, y: 0 }),
  dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  spatialIndexSV: sv([]),
  scrollOffsetsSV: sv([]),
  grabOffsetSV: sv({ x: 0, y: 0 }),
  startPositionSV: sv({ x: 0, y: 0 }),
  rootOffsetSV: sv({ x: 0, y: 0 }),
  handleDragStart: jest.fn(),
  handleReceiverChange: jest.fn(),
  handleDragEnd: mockHandleDragEnd,
};
jest.mock('../useDraxContext', () => ({ useDraxContext: () => mockCtx }));

const event = { x: 0, y: 0, absoluteX: 0, absoluteY: 0 };

describe('useDragGesture end callbacks', () => {
  beforeEach(() => {
    mockHandleDragEnd.mockClear();
    mockCtx.draggedIdSV.value = 'item';
    mockCtx.receiverIdSV.value = 'zone';
    useDragGesture('item', sv(0) as never, sv(true) as never, sv(250) as never);
  });

  it('drops on a normal end', () => {
    mockConfig.onDeactivate(event, true);
    mockConfig.onFinalize(event, true);
    expect(mockHandleDragEnd).toHaveBeenCalledTimes(1);
    expect(mockHandleDragEnd).toHaveBeenCalledWith('item', 'zone', false, []);
  });

  it('only cancels, never drops, when the gesture is cancelled', () => {
    mockConfig.onDeactivate(event, false);
    mockConfig.onFinalize(event, false);
    expect(mockHandleDragEnd).toHaveBeenCalledTimes(1);
    expect(mockHandleDragEnd).toHaveBeenCalledWith('item', 'zone', true, []);
  });
});
