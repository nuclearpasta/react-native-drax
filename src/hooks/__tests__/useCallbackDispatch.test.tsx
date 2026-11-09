import type { SpatialEntry, ViewRegistryEntry } from '../../types';
import { useCallbackDispatch } from '../useCallbackDispatch';

// useCallbackDispatch only uses useRef, so it runs as a plain function once
// useRef is a plain box. runOnJS/runOnUI call through synchronously, and plain
// `{ value }` objects stand in for SharedValues.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: <T,>(value: T) => ({ current: value }),
}));
jest.mock('react-native-reanimated', () => ({
  withDelay: jest.fn(),
  withTiming: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
}));

const sv = <T,>(value: T) => ({ value });

const spatialEntry = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentIndex: number
): SpatialEntry => ({
  id,
  x,
  y,
  width,
  height,
  parentIndex,
  receptive: true,
  monitoring: false,
  draggable: true,
  rejectOwnChildren: false,
  collisionAlgorithm: 'center',
});

// Parent at (10, 20), scrolled down by 10. Children are laid out inside it,
// so absolute = parent + child - scroll.
const spatialIndexSV = sv([
  spatialEntry('parent', 10, 20, 300, 400, -1),
  spatialEntry('drag', 5, 6, 50, 40, 0),
  spatialEntry('zone', 100, 200, 80, 60, 0),
]);
const scrollOffsetsSV = sv([{ x: 0, y: 10 }]);

const draggedProps = {
  draggable: true,
  noHover: true,
  animateSnap: false,
  payload: 'p',
  onDragStart: jest.fn(),
  onDragDrop: jest.fn(),
  onSnapEnd: jest.fn(),
};
const receiverProps = {
  receptive: true,
  dynamicReceptiveCallback: jest.fn(() => true),
  onReceiveDragEnter: jest.fn(),
  onReceiveDragDrop: jest.fn(),
};

const entries: Record<string, ViewRegistryEntry> = {
  drag: {
    id: 'drag',
    parentId: 'parent',
    spatialIndex: 1,
    measurements: { x: 5, y: 6, width: 50, height: 40, _transformDetected: 0 },
    props: draggedProps,
  },
  zone: {
    id: 'zone',
    parentId: 'parent',
    spatialIndex: 2,
    measurements: { x: 100, y: 200, width: 80, height: 60, _transformDetected: 0 },
    props: receiverProps,
  },
};

const draggedAbsolute = { x: 15, y: 16, width: 50, height: 40, _transformDetected: 0 };
const receiverAbsolute = { x: 110, y: 210, width: 80, height: 60, _transformDetected: 0 };
const grabOffset = { x: 7, y: 8 };

const hoverPositionSV = sv({ x: 0, y: 0 });
const deps = {
  getViewEntry: (id: string) => entries[id],
  spatialIndexSV,
  scrollOffsetsSV,
  draggedIdSV: sv('drag'),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  dragPhaseSV: sv('dragging'),
  hoverPositionSV,
  grabOffsetSV: sv(grabOffset),
  startPositionSV: sv({ x: 22, y: 24 }),
  setHoverContent: jest.fn(),
  hoverReadySV: sv(true),
  hoverClearDeferredRef: { current: false },
  hoverStylesRef: { current: null },
  droppedItemsRef: { current: new Map() },
} as unknown as Parameters<typeof useCallbackDispatch>[0];

describe('useCallbackDispatch event data', () => {
  let dispatch: ReturnType<typeof useCallbackDispatch>;
  beforeAll(() => {
    dispatch = useCallbackDispatch(deps);
  });

  it('adds absoluteMeasurements and hoverMeasurements to the dragged view', () => {
    hoverPositionSV.value = { x: 15, y: 16 };
    dispatch.handleDragStart('drag', { x: 22, y: 24 }, grabOffset);

    const { dragged } = draggedProps.onDragStart.mock.calls[0][0];
    expect(dragged.absoluteMeasurements).toEqual(draggedAbsolute);
    expect(dragged.hoverMeasurements).toEqual({
      x: 15,
      y: 16,
      width: 50,
      height: 40,
      _transformDetected: 0,
    });
  });

  it('adds absoluteMeasurements to the receiver and draggedParentId to dynamicReceptiveCallback', () => {
    hoverPositionSV.value = { x: 113, y: 212 };
    dispatch.handleReceiverChange('', 'zone', { x: 138, y: 232 });

    expect(receiverProps.dynamicReceptiveCallback).toHaveBeenCalledWith(
      expect.objectContaining({ draggedId: 'drag', draggedParentId: 'parent' })
    );
    const { receiver, dragged } = receiverProps.onReceiveDragEnter.mock.calls[0][0];
    expect(receiver.absoluteMeasurements).toEqual(receiverAbsolute);
    expect(dragged.hoverMeasurements).toMatchObject({ x: 113, y: 212 });
  });

  it('keeps grabOffset and measurements through drop and snap end', () => {
    hoverPositionSV.value = { x: 113, y: 212 };
    dispatch.handleDragEnd('drag', 'zone', false);

    for (const fn of [draggedProps.onDragDrop, receiverProps.onReceiveDragDrop]) {
      const { dragged, receiver } = fn.mock.calls[0][0];
      expect(dragged.grabOffset).toEqual(grabOffset);
      expect(dragged.absoluteMeasurements).toEqual(draggedAbsolute);
      expect(dragged.hoverMeasurements).toMatchObject({ x: 113, y: 212 });
      expect(receiver.absoluteMeasurements).toEqual(receiverAbsolute);
    }
    const snap = draggedProps.onSnapEnd.mock.calls[0][0];
    expect(snap.dragged.grabOffset).toEqual(grabOffset);
    expect(snap.receiver.id).toBe('zone');
  });
});
