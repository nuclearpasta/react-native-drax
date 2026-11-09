import { act, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { DraxPanGestureConfig } from '../compat';
import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
// useDragGesture calls no React hooks, so it runs as a plain function here.
import { useDragGesture as createDragGesture } from '../hooks/useDragGesture';
import { useSortableBoard } from '../hooks/useSortableBoard';
import { useSortableList } from '../hooks/useSortableList';
import { SortableBoardContainer } from '../SortableBoardContainer';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// #250: a second drag that starts while the first drag's snap is in flight,
// or in the same tick the snap ends. Renders the real useSortableList +
// SortableContainer + SortableItem, the real callback dispatch (snap +
// onSnapEnd) and the real gesture worklets. DraxView is a stub that records
// its props (monitors by id, rows by item). The UI and JS threads are two
// FIFO queues: runOnUI and runOnJS enqueue, the test drains them, so the
// cross-thread ordering is explicit.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? 'board' : payload?.item ?? '', props);
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
/** A monitor (list/column/board) or a row, at x/y inside its parent. */
const spatialEntry = (
  id: string,
  parentIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  monitor = false
): SpatialEntry => ({
  id,
  x,
  y,
  width,
  height,
  parentIndex,
  receptive: !monitor,
  monitoring: monitor,
  draggable: !monitor,
} as SpatialEntry);
// Index 0 is the list (monitor); item rows follow.
const listSpatialIndex = () => [
  spatialEntry('list', -1, 0, 0, 100, ROW * KEYS.length, true),
  ...KEYS.map((k, i) => spatialEntry(k, 0, 0, i * ROW, 100, ROW)),
];
const mockCtx = {
  hoverReadySV: sv(false),
  dragPhaseSV: sv<string>('idle'),
  draggedIdSV: sv(''),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  hoverPositionSV: makeHoverPositionSV(),
  dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  hoverDimsSV: sv({ x: 0, y: 0 }),
  spatialIndexSV: sv(listSpatialIndex()),
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

import { create } from 'react-test-renderer';
let mockRoot: ReturnType<typeof create> | undefined;
const ReactNative = {
  render: (el: ReactNode, _tag: number) => { mockRoot = create(el as never); },
  unmountComponentAtNode: (_tag: number) => { mockRoot?.unmount(); mockRoot = undefined; },
};

const Leaf = () => null;
let sortable: SortableListHandle<string>;
const rerenderCell = new Map<string, () => void>();

/** Re-renders its item on its own, like a FlatList cell after layout. */
const Cell = ({ handle, index }: { handle: SortableListHandle<string>; index: number }) => {
  const [, setTick] = useState(0);
  rerenderCell.set(handle.data[index]!, () => setTick((t) => t + 1));
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
      const entries = mockCtx.spatialIndexSV.value;
      const index = entries.findIndex((e) => e.id === id);
      const e = entries[index]!;
      return {
        id,
        parentId: entries[e.parentIndex]?.id,
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
    mockDraxProps.get('list')!.onMonitorDragStart!({
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
  // Mid drag 2, after drag 1's deferred work ran: drag 2 is still dragged
  // (its row stays hidden) and its hover is shown.
  expect(mockCtx.draggedIdSV.value).toBe('E');
  expect(mockCtx.hoverContent).not.toBeNull();
  expect(mockCtx.hoverReadySV.value).toBe(true);
  expect(mockCtx.dragPhaseSV.value).toBe('dragging');
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
    mockCtx.spatialIndexSV.value = listSpatialIndex();
    rerenderCell.clear();
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

// Board: column 1 (A B C) at x 0, column 2 (X Y) at x 200.
const COL1 = ['A', 'B', 'C'];
const COL2 = ['X', 'Y'];
const COL_HEIGHT = ROW * 5;
const boardSpatialIndex = () => [
  spatialEntry('board', -1, 0, 0, 300, COL_HEIGHT, true),
  spatialEntry('col1', 0, 0, 0, 100, COL_HEIGHT, true),
  spatialEntry('col2', 0, 200, 0, 100, COL_HEIGHT, true),
  ...COL1.map((k, i) => spatialEntry(k, 1, 0, i * ROW, 100, ROW)),
  ...COL2.map((k, i) => spatialEntry(k, 2, 0, i * ROW, 100, ROW)),
];
const columns: Record<string, SortableListHandle<string>> = {};

const Column = ({ id, data, onReorder }: { id: string; data: string[]; onReorder: jest.Mock }) => {
  const handle = useSortableList({ id, data, keyExtractor: (item) => item, onReorder });
  useLayoutEffect(() => {
    columns[id] = handle;
  });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <Cell key={item} handle={handle} index={index} />
      ))}
    </SortableContainer>
  );
};

// Uncontrolled: onTransfer is only recorded, the columns keep their data.
const Board = ({ onTransfer, onReorder }: { onTransfer: jest.Mock; onReorder: jest.Mock }) => {
  const board = useSortableBoard<string>({ keyExtractor: (item) => item, onTransfer });
  return (
    <SortableBoardContainer board={board}>
      <Column id="col1" data={COL1} onReorder={onReorder} />
      <Column id="col2" data={COL2} onReorder={jest.fn()} />
    </SortableBoardContainer>
  );
};

describe('second drag racing a board transfer snap (#250)', () => {
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
    mockCtx.spatialIndexSV.value = boardSpatialIndex();
    rerenderCell.clear();
  });
  afterEach(() => {
    act(() => ReactNative.unmountComponentAtNode(1));
  });

  const dragged = (key: string) => ({
    parentId: 'col1',
    payload: mockDraxProps.get(key)!.payload,
    measurements: { x: 0, y: 0, width: 100, height: ROW },
  });
  const activateIn = (key: string, x: number, slot: number) =>
    mockGestures.get(key)!.onActivate!({
      x: 50,
      y: ROW / 2,
      absoluteX: x + 50,
      absoluteY: slot * ROW + ROW / 2,
    } as never);
  const monitorStartInCol1 = (key: string) =>
    act(() => {
      mockDraxProps.get('board')!.onMonitorDragStart!({ dragged: dragged(key) } as never);
      mockDraxProps.get('col1')!.onMonitorDragStart!({ dragged: dragged(key) } as never);
    });

  it('commits the transfer and keeps drag 2 when it starts in the source column mid-snap', () => {
    const onTransfer = jest.fn();
    const onReorder = jest.fn();
    act(() =>
      ReactNative.render(
        <>
          <Dispatcher />
          <Board onTransfer={onTransfer} onReorder={onReorder} />
        </>,
        1
      )
    );
    const entries = boardSpatialIndex();
    for (const key of [...COL1, ...COL2]) {
      mockGestureId = key;
      const index = entries.findIndex((e) => e.id === key);
      createDragGesture(key, sv(index) as never, sv(true) as never, sv(250) as never);
    }
    layout();
    act(() => {
      mockDraxProps.get('col1')!.onMeasure!({ x: 0, y: 0, width: 100, height: COL_HEIGHT } as never);
      mockDraxProps.get('col2')!.onMeasure!({ x: 200, y: 0, width: 100, height: COL_HEIGHT } as never);
      [COL1, COL2].forEach((col) =>
        col.forEach((key, i) =>
          mockDraxProps.get(key)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)
        )
      );
    });
    settle();

    // Drag 1: A from column 1 to the end of column 2, released there.
    activateIn('A', 0, 0);
    settle();
    monitorStartInCol1('A');
    const overCol2 = { x: 250, y: 2 * ROW + ROW / 2 };
    act(() => {
      mockDraxProps.get('board')!.onMonitorDragOver!({
        dragged: dragged('A'),
        dragAbsolutePosition: overCol2,
      } as never);
    });
    mockCtx.dragAbsolutePositionSV.value = overCol2;
    mockGestures.get('A')!.onDeactivate!({} as never, true);
    drainJS();
    expect(mockCtx.hoverPositionSV.snapping).toBe(true);

    // Drag 2: B in column 1 activates while the transfer snap is in flight.
    activateIn('B', 0, 1);
    drainJS();
    drainUI();
    drainJS();
    expect(mockCtx.draggedIdSV.value).toBe('B');
    expect(mockCtx.hoverContent).not.toBeNull();

    monitorStartInCol1('B');
    act(() => columns.col1!._internal.moveDraggedItem(2));
    settle();
    // The transfer committed under drag 2, and drag 2 is intact.
    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(onTransfer.mock.calls[0][0]).toMatchObject({
      item: 'A',
      fromContainerId: 'col1',
      toContainerId: 'col2',
    });
    expect(mockCtx.draggedIdSV.value).toBe('B');
    expect(mockCtx.hoverContent).not.toBeNull();
    expect(mockCtx.hoverReadySV.value).toBe(true);

    // Drag 2 drops normally: its reorder commits in column 1.
    mockCtx.dragAbsolutePositionSV.value = { x: 50, y: 2 * ROW + ROW / 2 };
    mockGestures.get('B')!.onDeactivate!({} as never, true);
    drainJS();
    expect(mockCtx.hoverPositionSV.snapping).toBe(true);
    mockCtx.hoverPositionSV.finishSnap();
    settle();

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toMatchObject({ fromItem: 'B', toIndex: 2 });
    expect(mockCtx.draggedIdSV.value).toBe('');
    expect(mockCtx.hoverContent).toBeNull();
  });

  it('keeps drag 2 when it starts OUTSIDE the board mid-transfer-snap', () => {
    const onTransfer = jest.fn();
    const onReorder = jest.fn();
    act(() =>
      ReactNative.render(
        <>
          <Dispatcher />
          <Board onTransfer={onTransfer} onReorder={onReorder} />
        </>,
        1
      )
    );
    // A plain DraxView 'Z' outside the board (no board/column monitor).
    mockCtx.spatialIndexSV.value = [
      ...boardSpatialIndex(),
      spatialEntry('Z', -1, 400, 0, 100, ROW),
    ];
    mockDraxProps.set('Z', { id: 'Z', payload: { item: 'Z' } } as never);
    const entries = mockCtx.spatialIndexSV.value;
    for (const key of [...COL1, ...COL2, 'Z']) {
      mockGestureId = key;
      const index = entries.findIndex((e) => e.id === key);
      createDragGesture(key, sv(index) as never, sv(true) as never, sv(250) as never);
    }
    layout();
    act(() => {
      mockDraxProps.get('col1')!.onMeasure!({ x: 0, y: 0, width: 100, height: COL_HEIGHT } as never);
      mockDraxProps.get('col2')!.onMeasure!({ x: 200, y: 0, width: 100, height: COL_HEIGHT } as never);
      [COL1, COL2].forEach((col) =>
        col.forEach((key, i) =>
          mockDraxProps.get(key)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)
        )
      );
    });
    settle();

    activateIn('A', 0, 0);
    settle();
    monitorStartInCol1('A');
    const overCol2 = { x: 250, y: 2 * ROW + ROW / 2 };
    act(() => {
      mockDraxProps.get('board')!.onMonitorDragOver!({
        dragged: dragged('A'),
        dragAbsolutePosition: overCol2,
      } as never);
    });
    mockCtx.dragAbsolutePositionSV.value = overCol2;
    mockGestures.get('A')!.onDeactivate!({} as never, true);
    drainJS();
    expect(mockCtx.hoverPositionSV.snapping).toBe(true);

    // Drag 2 on Z (outside the board) while the transfer snap is in flight.
    mockGestures.get('Z')!.onActivate!({ x: 50, y: ROW / 2, absoluteX: 450, absoluteY: ROW / 2 } as never);
    drainJS();
    drainUI();
    drainJS();
    expect(mockCtx.draggedIdSV.value).toBe('Z');
    settle(); // runs finalizeTransfer's 3 rAFs
    expect(onTransfer).toHaveBeenCalledTimes(1);
    expect(mockCtx.draggedIdSV.value).toBe('Z');
    expect(mockCtx.hoverContent).not.toBeNull();
    expect(mockCtx.hoverReadySV.value).toBe(true);
    expect(mockCtx.dragPhaseSV.value).toBe('dragging');
  });

  // Known issue (#329 review 329-N2), tracked for 1.2.1: an external data
  // change mid-drag (useSortableList's "external data change" path) swaps
  // stableData without rebasing drag 2's refs, so its drop is lost.
  it.failing('controlled board: commits the transfer and keeps drag 2 when onTransfer re-renders col1 under drag 2', () => {
    const onTransferSpy = jest.fn();
    const onReorder = jest.fn();
    const ControlledBoard = () => {
      const [cols, setCols] = useState<Record<string, string[]>>({ col1: COL1, col2: COL2 });
      const board = useSortableBoard<string>({
        keyExtractor: (item) => item,
        onTransfer: (e) => {
          onTransferSpy(e);
          setCols((prev) => {
            const from = prev[e.fromContainerId]!.filter((k) => k !== e.item);
            const to = [...prev[e.toContainerId]!];
            to.splice(e.toIndex, 0, e.item);
            return { ...prev, [e.fromContainerId]: from, [e.toContainerId]: to };
          });
        },
      });
      return (
        <SortableBoardContainer board={board}>
          <Column id="col1" data={cols.col1!} onReorder={jest.fn((e: { data: string[] }) => {
            onReorder(e);
            setCols((prev) => ({ ...prev, col1: e.data }));
          })} />
          <Column id="col2" data={cols.col2!} onReorder={jest.fn()} />
        </SortableBoardContainer>
      );
    };
    act(() =>
      ReactNative.render(
        <>
          <Dispatcher />
          <ControlledBoard />
        </>,
        1
      )
    );
    const entries = boardSpatialIndex();
    for (const key of [...COL1, ...COL2]) {
      mockGestureId = key;
      const index = entries.findIndex((e) => e.id === key);
      createDragGesture(key, sv(index) as never, sv(true) as never, sv(250) as never);
    }
    layout();
    act(() => {
      mockDraxProps.get('col1')!.onMeasure!({ x: 0, y: 0, width: 100, height: COL_HEIGHT } as never);
      mockDraxProps.get('col2')!.onMeasure!({ x: 200, y: 0, width: 100, height: COL_HEIGHT } as never);
      [COL1, COL2].forEach((col) =>
        col.forEach((key, i) =>
          mockDraxProps.get(key)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)
        )
      );
    });
    settle();

    activateIn('A', 0, 0);
    settle();
    monitorStartInCol1('A');
    const overCol2 = { x: 250, y: 2 * ROW + ROW / 2 };
    act(() => {
      mockDraxProps.get('board')!.onMonitorDragOver!({
        dragged: dragged('A'),
        dragAbsolutePosition: overCol2,
      } as never);
    });
    mockCtx.dragAbsolutePositionSV.value = overCol2;
    mockGestures.get('A')!.onDeactivate!({} as never, true);
    drainJS();
    expect(mockCtx.hoverPositionSV.snapping).toBe(true);

    // Drag 2: B (col1 slot 1) activates mid-snap.
    activateIn('B', 0, 1);
    drainJS();
    drainUI();
    drainJS();
    monitorStartInCol1('B');
    settle(); // finalizeTransfer rAFs: onTransfer -> parent removes A from col1 under drag 2
    expect(onTransferSpy).toHaveBeenCalledTimes(1);
    expect(columns.col1!.data).toEqual(['B', 'C']);
    expect([...columns.col2!.data].sort()).toEqual(['A', 'X', 'Y']);
    expect(mockCtx.draggedIdSV.value).toBe('B');
    expect(mockCtx.hoverContent).not.toBeNull();
    expect(mockCtx.hoverReadySV.value).toBe(true);

    // Drag 2 drops B at the end of col1 (now B C): expect C B.
    act(() => columns.col1!._internal.moveDraggedItem(1));
    mockCtx.dragAbsolutePositionSV.value = { x: 50, y: 1 * ROW + ROW / 2 };
    mockGestures.get('B')!.onDeactivate!({} as never, true);
    drainJS();
    mockCtx.hoverPositionSV.finishSnap();
    settle();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toMatchObject({ fromItem: 'B', data: ['C', 'B'] });
    expect(columns.col1!.data).toEqual(['C', 'B']);
    expect(mockCtx.draggedIdSV.value).toBe('');
    expect(mockCtx.hoverContent).toBeNull();
  });
});
