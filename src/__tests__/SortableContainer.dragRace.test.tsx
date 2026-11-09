import { act, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { DraxPanGestureConfig } from '../compat';
import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
// useDragGesture calls no React hooks, so it runs as a plain function here.
import { useDragGesture as createDragGesture } from '../hooks/useDragGesture';
import { useSortableList } from '../hooks/useSortableList';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// #250: a second drag that starts while the first drag's snap is in flight,
// or in the same tick the snap ends. Renders the real useSortableList +
// SortableContainer + SortableItem, the real callback dispatch (snap +
// onSnapEnd) and the real gesture worklets. DraxView is a stub that records
// its props. The UI and JS threads are two FIFO queues: runOnUI and runOnJS
// enqueue, the test drains them, so the cross-thread ordering is explicit.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.isParent ? 'container' : payload?.item ?? '', props);
    return props.children ?? null;
  },
}));

interface MockSnap { to: unknown; cb?: (finished: boolean) => void }
const isMockSnap = (v: unknown): v is MockSnap =>
  typeof v === 'object' && v !== null && 'mockSnap' in v;
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: ({ children }: { children?: ReactNode }) => children ?? null },
    useSharedValue: <T,>(value: T) => useStateMock(() => ({ value }))[0],
    useDerivedValue: () => ({ value: false }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    measure: () => null,
    withDelay: (_delay: number, animation: unknown) => animation,
    withTiming: (to: unknown, _config: unknown, cb?: (finished: boolean) => void) => ({
      mockSnap: true,
      to,
      cb,
    }),
    withSpring: <T,>(value: T) => value,
    Easing: { linear: undefined },
  };
});

const mockUIQueue: (() => void)[] = [];
const mockJSQueue: (() => void)[] = [];
jest.mock('react-native-worklets', () => ({
  runOnUI:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      mockUIQueue.push(() => fn(...args));
    },
  runOnJS:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      mockJSQueue.push(() => fn(...args));
    },
}));

const mockGestures = new Map<string, DraxPanGestureConfig>();
let mockGestureId = '';
jest.mock('../compat', () => ({
  useDraxPanGesture: (config: DraxPanGestureConfig) => {
    mockGestures.set(mockGestureId, config);
    return {};
  },
}));

/** hoverPositionSV: assigning a withTiming() starts a snap; any other write
 *  cancels it (callback(false)), like Reanimated. */
const makeHoverPositionSV = () => {
  let current: unknown = { x: 0, y: 0 };
  let snap: MockSnap | undefined;
  return {
    get value() {
      return current;
    },
    set value(next: unknown) {
      const running = snap;
      snap = undefined;
      running?.cb?.(false);
      if (isMockSnap(next)) snap = next;
      else current = next;
    },
    /** UI thread: the snap animation reaches its target. */
    finishSnap() {
      const running = snap!;
      snap = undefined;
      current = running.to;
      running.cb?.(true);
    },
    get snapping() {
      return snap !== undefined;
    },
  };
};

const sv = <T,>(value: T) => ({ value });
const ROW = 50;
const KEYS = ['A', 'B', 'C', 'D', 'E'];
const spatialEntry = (id: string, i: number): SpatialEntry => ({
  id,
  x: 0,
  y: i < 0 ? 0 : i * ROW,
  width: 100,
  height: i < 0 ? ROW * KEYS.length : ROW,
  parentIndex: i < 0 ? -1 : 0,
  receptive: i >= 0,
  monitoring: i < 0,
  draggable: i >= 0,
} as SpatialEntry);
const mockCtx = {
  hoverReadySV: sv(false),
  dragPhaseSV: sv<string>('idle'),
  draggedIdSV: sv(''),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  hoverPositionSV: makeHoverPositionSV(),
  dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  // Index 0 is the container (monitor); item rows follow.
  spatialIndexSV: sv([spatialEntry('container', -1), ...KEYS.map((k, i) => spatialEntry(k, i))]),
  scrollOffsetsSV: sv([] as { x: number; y: number }[]),
  grabOffsetSV: sv({ x: 0, y: 0 }),
  startPositionSV: sv({ x: 0, y: 0 }),
  rootOffsetSV: sv({ x: 0, y: 0 }),
  rootViewRef: { current: null },
  hoverClearDeferredRef: { current: false },
  hoverContent: null as ReactNode,
  setHoverContent: (content: ReactNode) => {
    mockCtx.hoverContent = content;
    // HoverLayer's layout effect after the hover content commits.
    if (content != null) {
      mockUIQueue.push(() => {
        mockCtx.dragPhaseSV.value = 'dragging';
        mockCtx.hoverReadySV.value = true;
      });
    }
  },
  handleDragStart: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragStart'],
  handleReceiverChange: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleReceiverChange'],
  handleDragEnd: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragEnd'],
};
jest.mock('../hooks/useDraxContext', () => ({ useDraxContext: () => mockCtx }));

// The jest preset mocks RendererProxy, so load the renderer directly.
const ReactNative = jest.requireActual(
  'react-native/Libraries/Renderer/implementations/ReactNativeRenderer-dev'
);

const Leaf = () => null;
let sortable: SortableListHandle<string>;
const rerenderCell: (() => void)[] = [];

/** Re-renders its item on its own, like a FlatList cell after layout. */
const Cell = ({ handle, index }: { handle: SortableListHandle<string>; index: number }) => {
  const [, setTick] = useState(0);
  rerenderCell[index] = () => setTick((t) => t + 1);
  return (
    <SortableItem sortable={handle} index={index}>
      <Leaf />
    </SortableItem>
  );
};

const Dispatcher = () => {
  const dispatch = useCallbackDispatch({
    ...mockCtx,
    hoverPositionSV: mockCtx.hoverPositionSV as never,
    dragPhaseSV: mockCtx.dragPhaseSV as never,
    getViewEntry: (id: string) => {
      const props = mockDraxProps.get(id);
      if (!props) return undefined;
      const index = id === 'container' ? 0 : KEYS.indexOf(id) + 1;
      const e = mockCtx.spatialIndexSV.value[index]!;
      return {
        id,
        parentId: id === 'container' ? undefined : 'list',
        spatialIndex: index,
        measurements: { x: e.x, y: e.y, width: e.width, height: e.height },
        props,
      };
    },
    spatialIndexSV: mockCtx.spatialIndexSV as never,
    scrollOffsetsSV: mockCtx.scrollOffsetsSV as never,
    hoverStylesRef: { current: null },
    droppedItemsRef: { current: new Map() },
  } as never);
  Object.assign(mockCtx, dispatch);
  return null;
};

// Uncontrolled parent: it never echoes the reorder back. A controlled parent
// also needs the flush deferral from #310 (main flushes stableData mid drag 2).
const List = ({ onReorder }: { onReorder: jest.Mock }) => {
  const handle = useSortableList({
    id: 'list',
    data: KEYS,
    keyExtractor: (item) => item,
    onReorder,
  });
  useLayoutEffect(() => {
    sortable = handle;
  });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <Cell key={item} handle={handle} index={index} />
      ))}
    </SortableContainer>
  );
};

/** Run both thread queues (and timers / rAF) until everything settles. */
const settle = () =>
  act(() => {
    for (let guard = 0; guard < 100; guard++) {
      if (mockUIQueue.length) mockUIQueue.shift()!();
      else if (mockJSQueue.length) mockJSQueue.shift()!();
      else if (jest.getTimerCount()) jest.runOnlyPendingTimers();
      else return;
    }
    throw new Error('queues did not settle');
  });
const drainJS = () =>
  act(() => {
    while (mockJSQueue.length) mockJSQueue.shift()!();
  });
const drainUI = () => {
  while (mockUIQueue.length) mockUIQueue.shift()!();
};

/** Visual slot (display index) of the row currently at rest at each slot. */
const visualOrder = () => {
  const shifts = sortable._internal.shiftsRef.value as Record<string, { y: number }>;
  return sortable.data
    .map((key, i) => ({ key, y: i * ROW + (shifts[key]?.y ?? 0) }))
    .sort((a, b) => a.y - b.y)
    .map((r) => r.key)
    .join('');
};

/** Cells re-render after layout. SortableItem reads onItemSnapEnd at render
 *  time, and SortableContainer sets it in a layout effect. */
const layout = () => act(() => rerenderCell.forEach((rerender) => rerender()));

const rowCenter = (slot: number) => ({ x: 50, y: slot * ROW + ROW / 2 });

/** UI thread: the long press activates a drag on `key`'s row. */
const activate = (key: string) => {
  const slot = visualOrder().indexOf(key);
  const p = rowCenter(slot);
  mockGestures.get(key)!.onActivate!({ x: 50, y: ROW / 2, absoluteX: p.x, absoluteY: p.y } as never);
};

/** JS thread: the first gesture update reaches the sortable container. */
const monitorStart = (key: string, toSlot: number) =>
  act(() => {
    mockDraxProps.get('container')!.onMonitorDragStart!({
      dragged: { parentId: 'list', payload: mockDraxProps.get(key)!.payload },
    } as never);
    sortable._internal.moveDraggedItem(toSlot);
  });

/** UI thread: finger lifts at `toSlot`; JS starts the snap. */
const release = (key: string, toSlot: number) => {
  mockCtx.dragAbsolutePositionSV.value = rowCenter(toSlot);
  mockGestures.get(key)!.onDeactivate!({} as never, true);
  drainJS();
};

const setup = () => {
  const onReorder = jest.fn();
  act(() =>
    ReactNative.render(
      <>
        <Dispatcher />
        <List onReorder={onReorder} />
      </>,
      1
    )
  );
  for (const key of KEYS) {
    mockGestureId = key;
    createDragGesture(key, sv(KEYS.indexOf(key) + 1) as never, sv(true) as never, sv(250) as never);
  }
  layout();
  // DraxView measures each row on layout.
  act(() =>
    KEYS.forEach((key, i) =>
      mockDraxProps.get(key)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)
    )
  );
  settle();
  return onReorder;
};

/** Drag 1: A to after D. Drag 2: E to the top. */
const runRace = (secondDragStarts: 'during-snap' | 'same-tick-as-snap-end') => {
  const onReorder = setup();

  activate('A');
  settle();
  monitorStart('A', 3);
  release('A', 3);
  expect(mockCtx.hoverPositionSV.snapping).toBe(true);

  if (secondDragStarts === 'same-tick-as-snap-end') {
    // UI: the snap ends, then drag 2 activates before JS sees the snap end.
    mockCtx.hoverPositionSV.finishSnap();
  }
  activate('E');
  // JS: drag 1's snap end (if any), then drag 2's handleDragStart.
  drainJS();
  drainUI();
  drainJS();

  // Drag 2 owns the shared drag state; drag 1's reorder is committed.
  expect(mockCtx.draggedIdSV.value).toBe('E');
  expect(mockCtx.hoverPositionSV.value).toEqual({ x: 0, y: 4 * ROW });
  expect(mockCtx.hoverContent).not.toBeNull();
  expect(mockCtx.hoverReadySV.value).toBe(true);
  expect(mockCtx.dragPhaseSV.value).toBe('dragging');
  expect(visualOrder()).toBe('BCDAE');

  monitorStart('E', 0);
  settle();
  release('E', 0);
  mockCtx.hoverPositionSV.finishSnap();
  settle();

  return onReorder;
};

describe('second drag racing the first drag snap (#250)', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
    mockUIQueue.length = 0;
    mockJSQueue.length = 0;
    Object.assign(mockCtx, {
      hoverPositionSV: makeHoverPositionSV(),
      hoverContent: null,
    });
    mockCtx.hoverReadySV.value = false;
    mockCtx.dragPhaseSV.value = 'idle';
    mockCtx.draggedIdSV.value = '';
  });
  afterEach(() => {
    act(() => ReactNative.unmountComponentAtNode(1));
  });

  it.each(['during-snap', 'same-tick-as-snap-end'] as const)(
    'commits both reorders exactly once when drag 2 starts %s',
    (when) => {
      const onReorder = runRace(when);

      expect(onReorder).toHaveBeenCalledTimes(2);
      expect(onReorder.mock.calls[0][0]).toMatchObject({
        fromIndex: 0,
        toIndex: 3,
        data: ['B', 'C', 'D', 'A', 'E'],
      });
      expect(onReorder.mock.calls[1][0]).toMatchObject({
        fromIndex: 4,
        toIndex: 0,
        data: ['E', 'B', 'C', 'D', 'A'],
      });
      expect(visualOrder()).toBe('EBCDA');

      // Nothing left dragged or hidden.
      expect(mockCtx.draggedIdSV.value).toBe('');
      expect(mockCtx.hoverReadySV.value).toBe(false);
      expect(mockCtx.dragPhaseSV.value).toBe('idle');
      expect(mockCtx.hoverContent).toBeNull();
      expect(sortable._internal.draggedItem.value).toBe(-1);
      expect(sortable._internal.pendingOrderRef.current).toEqual([]);
    }
  );
});
