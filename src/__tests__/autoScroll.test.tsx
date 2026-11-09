import type { ReactElement } from 'react';

import { DraxScrollView } from '../DraxScrollView';
import { SortableContainer } from '../SortableContainer';
import type { DraxMonitorEventData } from '../types';

// The components are called as plain functions: React's hooks are stubbed so
// refs persist in the returned closures (and across re-renders, by call
// order), and the monitor handlers are read off the returned DraxView element.
// useEffect callbacks are collected so a test can mount and unmount them.
// Plain `{ value }` objects stand in for SharedValues and runOnUI/runOnJS
// call through synchronously.
const mockHooks = {
  refs: [] as { current: unknown }[],
  refIndex: 0,
  effects: [] as (() => void | (() => void))[],
};
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: (current: unknown) =>
    (mockHooks.refs[mockHooks.refIndex++] ??= { current }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => {
    mockHooks.effects.push(fn);
  },
  useLayoutEffect: () => {},
}));
/** Run the collected effects as a mount, then return the unmount. */
const mountEffects = () => {
  const cleanups = mockHooks.effects.map((fn) => fn());
  return () => cleanups.forEach((cleanup) => cleanup?.());
};
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
    scrollPositionJSRef: { current: { x: 0, y: 0 } },
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
  const render = (internal: typeof _internal) => {
    mockHooks.refIndex = 0;
    mockHooks.effects = [];
    return SortableContainer({
      sortable: { _internal: internal } as never,
      scrollRef: { current: scroller },
      children: null,
    }) as ReactElement<MonitorHandlers>;
  };
  const element = render(_internal);
  /** Re-render with changed options; returns the new handlers. */
  const rerender = (next: Record<string, unknown>) =>
    render({ ..._internal, ...next }).props;
  const { moveDraggedItem } = _internal;
  return { ...element.props, scroller, onDragPositionChange, moveDraggedItem, rerender };
};

const renderScrollView = (props: Record<string, unknown> = {}) => {
  const scroller = { scrollTo: jest.fn() };
  mockHooks.refIndex = 0;
  mockHooks.effects = [];
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
  mockHooks.refs = [];
  mockHooks.effects = [];
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

  it('stops scrolling when autoScrollEnabled flips to false mid-scroll', () => {
    const list = renderSortable();
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);

    list.rerender({ autoScrollEnabled: false }).onMonitorDragOver(dragEvent(BOTTOM));
    jest.advanceTimersByTime(1000);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
  });

  it('stops scrolling on unmount, including a pending initial delay', () => {
    const list = renderSortable({ autoScrollInitialDelay: 300 });
    const unmount = mountEffects();
    list.onMonitorDragStart(dragEvent(MIDDLE));
    ownDragOver(list, BOTTOM);
    unmount();
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

  it('auto-scrolls a foreign drag when the list has onExternalDrop, nothing else', () => {
    // No slot tracking: no getSlotFromPosition, so no moves or drop indicator.
    const getSlotFromPosition = jest.fn(() => 0);
    const list = renderSortable({
      onExternalDrop: jest.fn(),
      getSlotFromPosition,
    });
    list.onMonitorDragStart(dragEvent(MIDDLE, 'other-list'));
    list.onMonitorDragOver(dragEvent(MIDDLE, 'other-list'));
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
    list.onMonitorDragOver(dragEvent(BOTTOM, 'other-list'));
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(250);
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(2);
    expect(list.onDragPositionChange).not.toHaveBeenCalled();
    expect(getSlotFromPosition).not.toHaveBeenCalled();
  });

  it('still auto-scrolls for an item from another column of the same board', () => {
    mockBoardContext = {
      registerColumn: () => {},
      unregisterColumn: () => {},
      // The board monitor has not set transferState yet (dispatch order).
      boardInternal: {
        columns: new Map([['other-list', {}]]),
        transferState: { current: undefined },
      },
    };
    const list = renderSortable();
    list.onMonitorDragOver(dragEvent(BOTTOM, 'other-list'));
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(list.onDragPositionChange).not.toHaveBeenCalled();
  });

  it('ignores a drag from a list outside the board', () => {
    mockBoardContext = {
      registerColumn: () => {},
      unregisterColumn: () => {},
      boardInternal: {
        columns: new Map([['other-list', {}]]),
        transferState: { current: undefined },
      },
    };
    const list = renderSortable();
    list.onMonitorDragOver(dragEvent(BOTTOM, 'elsewhere'));
    jest.advanceTimersByTime(1000);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
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

/**
 * A drag of a 120pt row that starts at y=330 in the 400pt container, so its
 * bottom 50pt are cut off. Grabbed `grabY` below the row's top, finger moved
 * `moveY` since pickup. Monitor offsets are at the hover centre, as dispatched.
 */
const rowEvent = (grabY: number, moveY: number): DraxMonitorEventData => {
  const fingerStartY = 330 + grabY;
  const centreY = fingerStartY + moveY - grabY + 60;
  return {
    dragged: {
      id: 'dragged',
      parentId: 'list',
      payload: { index: 0, originalIndex: 0 },
      grabOffset: { x: 50, y: grabY },
      measurements: { x: 0, y: 330, width: 100, height: 120 },
    },
    dragAbsolutePosition: { x: 50, y: centreY },
    dragTranslation: { x: 0, y: centreY - fingerStartY },
    monitorOffset: { x: 50, y: centreY },
    monitorOffsetRatio: { x: 0.5, y: centreY / 400 },
  } as unknown as DraxMonitorEventData;
};

describe('SortableContainer pickup of a row cut off at the edge', () => {
  it('does not scroll while the finger holds still on its visible part', () => {
    const list = renderSortable();
    // Finger at y=350 (ratio 0.875); hover centre at y=390 (ratio 0.975).
    list.onMonitorDragStart(rowEvent(20, 0));
    list.onMonitorDragOver(rowEvent(20, 0));
    // A few points of drift clear the jitter guard but stay out of the band.
    list.onMonitorDragOver(rowEvent(20, 6));
    jest.advanceTimersByTime(1000);
    expect(list.scroller.scrollToOffset).not.toHaveBeenCalled();
  });

  it('still scrolls once the finger is dragged into the edge band', () => {
    const list = renderSortable();
    list.onMonitorDragStart(rowEvent(20, 0));
    list.onMonitorDragOver(rowEvent(20, 15)); // finger at y=365 (0.9125)
    expect(list.scroller.scrollToOffset).toHaveBeenCalledTimes(1);
  });

  it('ignores under 5px of finger movement on an off-centre grab', () => {
    const list = renderSortable({
      draggedDisplayIndexRef: { current: 0 },
      getSlotFromPosition: jest.fn(() => 1),
    });
    // Grabbed 55pt above the centre: the guard must measure the finger.
    list.onMonitorDragStart(rowEvent(5, 0));
    list.onMonitorDragOver(rowEvent(5, 4));
    expect(list.moveDraggedItem).not.toHaveBeenCalled();
    list.onMonitorDragOver(rowEvent(5, 6));
    expect(list.moveDraggedItem).toHaveBeenCalledWith(1);
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

  it('stops scrolling when autoScrollEnabled flips to false mid-scroll', () => {
    const view = renderScrollView();
    view.onMonitorDragOver(dragEvent(BOTTOM));
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(1);

    const next = renderScrollView({ autoScrollEnabled: false });
    next.onMonitorDragOver(dragEvent(BOTTOM));
    jest.advanceTimersByTime(1000);
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(1);
    expect(next.scroller.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when autoScrollEnabled is false', () => {
    const view = renderScrollView({ autoScrollEnabled: false });
    view.onMonitorDragOver(dragEvent(BOTTOM));
    jest.advanceTimersByTime(1000);
    expect(view.scroller.scrollTo).not.toHaveBeenCalled();
  });
});
