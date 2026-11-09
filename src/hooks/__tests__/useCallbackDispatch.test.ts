import type { ViewRegistryEntry } from '../../types';
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
