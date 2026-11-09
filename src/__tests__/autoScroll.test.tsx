import type { ReactElement } from 'react';

import { DraxScrollView } from '../DraxScrollView';
import { SortableContainer } from '../SortableContainer';
import type { DraxMonitorEventData } from '../types';

// The components are called as plain functions: React's hooks are stubbed so
// refs persist in the returned closures, and the monitor handlers are read
// off the returned DraxView element. Plain `{ value }` objects stand in for
// SharedValues and runOnUI/runOnJS call through synchronously.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { ScrollView: 'ScrollView', View: 'View' },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: unknown) => v,
}));
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: unknown) => fn,
  runOnUI: (fn: unknown) => fn,
}));
jest.mock('../DraxView', () => ({ DraxView: 'DraxView' }));
jest.mock('../DraxSubprovider', () => ({ DraxSubprovider: 'DraxSubprovider' }));
jest.mock('../hooks/useDraxId', () => ({
  useDraxId: (id?: string) => id ?? 'scroll',
}));
jest.mock('../hooks/useWebScrollFreeze', () => ({
  useWebScrollFreeze: () => ({ freeze: () => {}, unfreeze: () => {} }),
}));
const sv = <T,>(value: T) => ({ value });
jest.mock('../hooks/useDraxContext', () => ({
  useDraxContext: () => ({
    hoverReadySV: sv(false),
    dragPhaseSV: sv('idle'),
    draggedIdSV: sv(''),
    hoverPositionSV: sv({ x: 0, y: 0 }),
    hoverClearDeferredRef: { current: false },
    setHoverContent: () => {},
  }),
}));
let mockBoardContext: unknown;
jest.mock('../SortableBoardContext', () => ({
  useSortableBoardContext: () => mockBoardContext,
}));

type MonitorHandlers = {
  onMonitorDragStart: (e: DraxMonitorEventData) => void;
  onMonitorDragOver: (e: DraxMonitorEventData) => void;
};

/** A drag event over the monitor at vertical ratio `y` (container is 100x400). */
const dragEvent = (y: number, parentId = 'list'): DraxMonitorEventData =>
  ({
    dragged: {
      id: 'dragged',
      parentId,
      payload: { index: 0, originalIndex: 0 },
      grabOffset: { x: 0, y: 0 },
      measurements: { x: 0, y: 0, width: 100, height: 40 },
    },
    dragAbsolutePosition: { x: 50, y: y * 400 },
    dragTranslation: { x: 0, y: 100 },
    monitorOffset: { x: 50, y: y * 400 },
    monitorOffsetRatio: { x: 0.5, y },
  }) as unknown as DraxMonitorEventData;

const MIDDLE = 0.5;
const BOTTOM = 0.95;

const renderSortable = (options: Record<string, unknown> = {}) => {
  const scroller = { scrollToOffset: jest.fn() };
  const onDragPositionChange = jest.fn();
  const _internal = {
    id: 'list',
    horizontal: false,
    draggedItem: sv(-1),
    rawData: ['a', 'b', 'c'],
    moveDraggedItem: jest.fn(),
    getSnapbackTarget: jest.fn(),
    setDraggedItem: jest.fn(),
    resetDraggedItem: jest.fn(),
    scrollPosition: sv({ x: 0, y: 0 }),
    containerMeasurementsRef: {
      current: { x: 0, y: 0, width: 100, height: 400 },
    },
    contentSizeRef: { current: { x: 100, y: 4000 } },
    autoScrollEnabled: true,
    autoScrollIntervalLength: 250,
    autoScrollInitialDelay: 0,
    autoScrollJumpRatio: 0.2,
    autoScrollBackThreshold: 0.1,
    autoScrollForwardThreshold: 0.9,
    onDragPositionChange,
    getMeasurementByOriginalIndex: jest.fn(),
    dropTargetPositionSV: sv({ x: 0, y: 0 }),
    dropTargetVisibleSV: sv(false),
    draggedDisplayIndexRef: { current: undefined },
    dragStartIndexRef: { current: undefined },
    initPendingOrder: jest.fn(),
    commitVisualOrder: jest.fn(),
    computeShiftsForOrder: jest.fn(),
    pendingOrderRef: { current: [] },
    committedOrderRef: { current: [] },
    committedShiftsRef: { current: {} },
    cancelDrag: jest.fn(),
    shiftsRef: sv({}),
    instantClearSV: sv(false),
    shiftsValidSV: sv(true),
    getSlotFromPosition: jest.fn(() => 0),
    ...options,
  };
  const element = SortableContainer({
    sortable: { _internal } as never,
    scrollRef: { current: scroller },
    children: null,
  }) as ReactElement<MonitorHandlers>;
  return { ...element.props, scroller, onDragPositionChange };
};

const renderScrollView = (props: Record<string, unknown> = {}) => {
  const scroller = { scrollTo: jest.fn() };
  const element = DraxScrollView(props) as ReactElement<
    MonitorHandlers & {
      onMeasure: (m: unknown) => void;
      children: ReactElement<{
        children: ReactElement<{
          ref: (i: unknown) => void;
          onContentSizeChange: (w: number, h: number) => void;
        }>;
      }>;
    }
  >;
  const { onMeasure, children } = element.props;
  const scrollView = children.props.children.props;
  scrollView.ref(scroller);
  scrollView.onContentSizeChange(100, 4000);
  onMeasure({ x: 0, y: 0, width: 100, height: 400 });
  return { ...element.props, scroller };
};

beforeEach(() => {
  jest.useFakeTimers();
  mockBoardContext = undefined;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('SortableContainer auto-scroll', () => {
  const ownDragOver = (
    handlers: ReturnType<typeof renderSortable>,
    y: number
  ) => {
    handlers.onMonitorDragOver(dragEvent(y));
  };

  it('jumps at once on entering the band by default, then every 250ms', () => {
    const list = renderSortable();
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(list.scroller.scrollToOffset).toHaveBeenLastCalledWith({ offset: 80 });
    jest.advanceTimersByTime(249);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(2);
  });

  it('waits autoScrollInitialDelay in the band before the first jump', () => {
    const list = renderSortable({ autoScrollInitialDelay: 600 });
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    jest.advanceTimersByTime(599);
    ownDragOver(list, BOTTOM);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(250);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(2);
  });

  it('restarts the initial delay when the drag leaves the band', () => {
    const list = renderSortable({ autoScrollInitialDelay: 600 });
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    jest.advanceTimersByTime(400);
    ownDragOver(list, MIDDLE);
    ownDragOver(list, BOTTOM);
    jest.advanceTimersByTime(400);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
  });

  it('honours autoScrollIntervalLength', () => {
    const list = renderSortable({ autoScrollIntervalLength: 100 });
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    jest.advanceTimersByTime(100);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(2);
  });

  it('does not scroll when autoScrollEnabled is false', () => {
    const list = renderSortable({ autoScrollEnabled: false });
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    jest.advanceTimersByTime(1000);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
  });

  it('ignores a foreign drag: no scroll, no onDragPositionChange', () => {
    const list = renderSortable();
    list.onMonitorDragStart(dragEvent(MIDDLE, 'other-list'));
    list.onMonitorDragOver(dragEvent(MIDDLE, 'other-list'));
    list.onMonitorDragOver(dragEvent(BOTTOM, 'other-list'));
    jest.advanceTimersByTime(1000);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
    expect(list.onDragPositionChange).not.toHaveBeenCalled();
  });

  it('still auto-scrolls as the target column of a board transfer', () => {
    mockBoardContext = {
      registerColumn: () => {},
      unregisterColumn: () => {},
      boardInternal: { transferState: { current: { targetId: 'list' } } },
    };
    const list = renderSortable();
    list.onMonitorDragOver(dragEvent(BOTTOM, 'other-list'));
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(list.onDragPositionChange).not.toHaveBeenCalled();
  });

  it('reports position changes for its own items', () => {
    const list = renderSortable();
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, MIDDLE);
    expect(list.onDragPositionChange).toHaveBeenCalledWith(
      expect.objectContaining({ item: 'a', toIndex: 0 })
    );
  });
});

describe('DraxScrollView auto-scroll', () => {
  it('honours autoScrollIntervalLength and autoScrollInitialDelay', () => {
    const view = renderScrollView({
      autoScrollIntervalLength: 100,
      autoScrollInitialDelay: 300,
    });
    view.onMonitorDragOver(dragEvent(BOTTOM));
    jest.advanceTimersByTime(299);
    expect(view.scroller.scrollTo).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(view.scroller.scrollTo).toHaveBeenCalledWith({ x: 0, y: 80 });
    jest.advanceTimersByTime(100);
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(2);
  });

  it('does not scroll when autoScrollEnabled is false', () => {
    const view = renderScrollView({ autoScrollEnabled: false });
    view.onMonitorDragOver(dragEvent(BOTTOM));
    jest.advanceTimersByTime(1000);
    expect(view.scroller.scrollTo).not.toHaveBeenCalled();
  });
});
