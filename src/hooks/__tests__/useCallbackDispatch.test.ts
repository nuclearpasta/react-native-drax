import type { SpatialEntry, ViewRegistryEntry } from '../../types';
import { useCallbackDispatch } from '../useCallbackDispatch';

// useCallbackDispatch only calls useRef, so it runs as a plain function once
// useRef is stubbed. Plain `{ value }` objects stand in for SharedValues and
// runOnUI calls through synchronously.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: (current: unknown) => ({ current }),
}));
jest.mock('react-native-reanimated', () => ({
  withDelay: jest.fn(),
  withTiming: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
}));

const sv = <T>(value: T) => ({ value });
const measurements = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  _transformDetected: 0,
};
const spatialEntry = { x: 0, y: 0, width: 100, height: 100, parentIndex: -1 };

const receiver = {
  onReceiveDragDrop: jest.fn(),
  onReceiveDragExit: jest.fn(),
  onReceiveSnapEnd: jest.fn(),
};

describe('useCallbackDispatch handleDragEnd receiver callbacks', () => {
  let handleDragEnd: ReturnType<typeof useCallbackDispatch>['handleDragEnd'];

  beforeEach(() => {
    jest.clearAllMocks();
    const entries: Record<string, ViewRegistryEntry> = {
      item: {
        id: 'item',
        spatialIndex: 0,
        measurements,
        props: { animateSnap: false },
      },
      zone: { id: 'zone', spatialIndex: 1, measurements, props: receiver },
    };
    ({ handleDragEnd } = useCallbackDispatch({
      getViewEntry: (id: string) => entries[id],
      spatialIndexSV: sv([spatialEntry, spatialEntry]),
      scrollOffsetsSV: sv([]),
      draggedIdSV: sv('item'),
      receiverIdSV: sv(''),
      rejectedReceiverIdSV: sv(''),
      dragPhaseSV: sv('releasing'),
      hoverPositionSV: sv({ x: 50, y: 50 }),
      grabOffsetSV: sv({ x: 0, y: 0 }),
      startPositionSV: sv({ x: 0, y: 0 }),
      needsUpdatesSV: sv(true),
      jsPendingSV: sv(false),
      setHoverContent: jest.fn(),
      hoverReadySV: sv(true),
      hoverClearDeferredRef: { current: false },
      hoverStylesRef: { current: null },
      droppedItemsRef: { current: new Map() },
    } as never));
  });

  it('drops on the receiver on a normal end', () => {
    handleDragEnd('item', 'zone', false, []);
    expect(receiver.onReceiveDragDrop).toHaveBeenCalledTimes(1);
    expect(receiver.onReceiveDragExit).not.toHaveBeenCalled();
    expect(receiver.onReceiveSnapEnd).toHaveBeenCalledTimes(1);
  });

  it('reports the finger position on drop as dragTouchPosition', () => {
    handleDragEnd('item', 'zone', false, [], { x: 160, y: 50 });
    expect(receiver.onReceiveDragDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        dragAbsolutePosition: { x: 50, y: 50 },
        dragTouchPosition: { x: 160, y: 50 },
      })
    );
  });

  it('fires a cancelled exit, not a drop, when cancelled over a receiver', () => {
    handleDragEnd('item', 'zone', true, []);
    expect(receiver.onReceiveDragDrop).not.toHaveBeenCalled();
    expect(receiver.onReceiveDragExit).toHaveBeenCalledTimes(1);
    expect(receiver.onReceiveDragExit).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelled: true,
        receiver: expect.objectContaining({ id: 'zone' }),
      })
    );
    expect(receiver.onReceiveSnapEnd).toHaveBeenCalledTimes(1);
  });
});

// ── Event data (absoluteMeasurements, hoverMeasurements, grabOffset) ──

const spatialEntryAt = (
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
const spatialEntries = [
  spatialEntryAt('parent', 10, 20, 300, 400, -1),
  spatialEntryAt('drag', 5, 6, 50, 40, 0),
  spatialEntryAt('zone', 100, 200, 80, 60, 0),
  spatialEntryAt('monitor', 0, 0, 300, 400, 0),
];
/** Counts JS reads: each one is a cross-runtime copy of the whole index. */
const spatialIndexSV = {
  reads: 0,
  get value() {
    this.reads++;
    return spatialEntries;
  },
};
const scrollOffsetsSV = sv([{ x: 0, y: 10 }]);

const draggedProps = {
  draggable: true,
  noHover: true,
  animateSnap: false,
  payload: 'p',
  onDragStart: jest.fn(),
  onDragDrop: jest.fn(),
  onSnapEnd: jest.fn(),
  onDrag: jest.fn(),
};
const receiverProps = {
  receptive: true,
  dynamicReceptiveCallback: jest.fn(() => true),
  onReceiveDragEnter: jest.fn(),
  onReceiveDragDrop: jest.fn(),
};

const monitorProps = {
  monitoring: true,
  onMonitorDragStart: jest.fn(),
  onMonitorDragEnter: jest.fn(),
  onMonitorDragOver: jest.fn(),
};

const eventEntries: Record<string, ViewRegistryEntry> = {
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
  monitor: {
    id: 'monitor',
    parentId: 'parent',
    spatialIndex: 3,
    measurements: { x: 0, y: 0, width: 300, height: 400, _transformDetected: 0 },
    props: monitorProps,
  },
};

const draggedAbsolute = { x: 15, y: 16, width: 50, height: 40, _transformDetected: 0 };
const receiverAbsolute = { x: 110, y: 210, width: 80, height: 60, _transformDetected: 0 };
const grabOffset = { x: 7, y: 8 };

const hoverPositionSV = sv({ x: 0, y: 0 });
const deps = {
  getViewEntry: (id: string) => eventEntries[id],
  spatialIndexSV,
  scrollOffsetsSV,
  draggedIdSV: sv('drag'),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  dragPhaseSV: sv('dragging'),
  hoverPositionSV,
  grabOffsetSV: sv(grabOffset),
  startPositionSV: sv({ x: 22, y: 24 }),
  needsUpdatesSV: sv(true),
  jsPendingSV: sv(false),
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
    const { receiver: zone, dragged } = receiverProps.onReceiveDragEnter.mock.calls[0][0];
    expect(zone.absoluteMeasurements).toEqual(receiverAbsolute);
    expect(dragged.hoverMeasurements).toMatchObject({ x: 113, y: 212 });
  });

  it('leaves the frames out of continuous events (no spatial index read)', () => {
    const position = { x: 40, y: 40 };
    hoverPositionSV.value = { x: 15, y: 16 };

    // Monitor appears: start/enter (and this frame's over) carry the frames.
    dispatch.handleReceiverChange('', '', position, ['monitor']);
    const start = monitorProps.onMonitorDragStart.mock.calls[0][0];
    expect(start.dragged.absoluteMeasurements).toEqual(draggedAbsolute);
    expect(monitorProps.onMonitorDragEnter.mock.calls[0][0].dragged.hoverMeasurements)
      .toMatchObject({ x: 15, y: 16 });

    // Same monitor, no receiver: steady over frames.
    spatialIndexSV.reads = 0;
    dispatch.handleReceiverChange('', '', position, ['monitor']);
    const over = monitorProps.onMonitorDragOver.mock.calls[1][0];
    expect(over.dragged.absoluteMeasurements).toBeUndefined();
    expect(over.dragged.hoverMeasurements).toBeUndefined();
    expect(spatialIndexSV.reads).toBe(0);

    // Monitor gone, then plain onDrag frames.
    dispatch.handleReceiverChange('', '', position, []);
    spatialIndexSV.reads = 0;
    draggedProps.onDrag.mockClear();
    dispatch.handleReceiverChange('', '', position, []);
    expect(draggedProps.onDrag.mock.calls[0][0].dragged.absoluteMeasurements).toBeUndefined();
    expect(spatialIndexSV.reads).toBe(0);
  });

  it('keeps grabOffset and measurements through drop and snap end', () => {
    hoverPositionSV.value = { x: 113, y: 212 };
    dispatch.handleDragEnd('drag', 'zone', false);

    for (const fn of [draggedProps.onDragDrop, receiverProps.onReceiveDragDrop]) {
      const { dragged, receiver: zone } = fn.mock.calls[0][0];
      expect(dragged.grabOffset).toEqual(grabOffset);
      expect(dragged.absoluteMeasurements).toEqual(draggedAbsolute);
      expect(dragged.hoverMeasurements).toMatchObject({ x: 113, y: 212 });
      expect(zone.absoluteMeasurements).toEqual(receiverAbsolute);
    }
    const snap = draggedProps.onSnapEnd.mock.calls[0][0];
    expect(snap.dragged.grabOffset).toEqual(grabOffset);
    expect(snap.receiver.id).toBe('zone');
  });
});
