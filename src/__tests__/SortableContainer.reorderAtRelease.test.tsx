import { act, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { create } from 'react-test-renderer';

import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
import { useSortableList } from '../hooks/useSortableList';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// onReorder fires at release (0.11 parity); the visual commit stays at snap
// end. The parent's echo, or any other data change, may land during the snap.
// Real useCallbackDispatch + useSortableList + SortableContainer +
// SortableItem; DraxView stubbed to record props. UI/JS threads are FIFO
// queues drained by the test.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? '' : payload?.item ?? props.id ?? '', props);
    return props.children ?? null;
  },
}));

interface MockSnap { to: unknown; cb?: (finished: boolean) => void }
const isMockSnap = (v: unknown): v is MockSnap => typeof v === 'object' && v !== null && 'mockSnap' in v;
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
    withDelay: (_d: number, a: unknown) => a,
    withTiming: (to: unknown, _c: unknown, cb?: (f: boolean) => void) => ({ mockSnap: true, to, cb }),
    withSpring: <T,>(v: T) => v,
    Easing: { linear: undefined },
  };
});
const mockUIQueue: (() => void)[] = [];
const mockJSQueue: (() => void)[] = [];
jest.mock('react-native-worklets', () => ({
  runOnUI: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { mockUIQueue.push(() => fn(...a)); },
  runOnJS: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { mockJSQueue.push(() => fn(...a)); },
}));

const makeHoverPositionSV = () => {
  let current: unknown = { x: 0, y: 0 };
  let snap: MockSnap | undefined;
  return {
    get value() { return current; },
    set value(next: unknown) {
      const running = snap; snap = undefined; running?.cb?.(false);
      if (isMockSnap(next)) snap = next; else current = next;
    },
    finishSnap() { const r = snap!; snap = undefined; current = r.to; r.cb?.(true); },
    get snapTarget() { return snap?.to; },
  };
};
const sv = <T,>(value: T) => ({ value });
const ROW = 50;
const KEYS = ['A', 'B', 'C', 'D', 'E'];
const entry = (id: string, parentIndex: number, x: number, y: number, w: number, h: number, monitor = false) =>
  ({ id, x, y, width: w, height: h, parentIndex, receptive: !monitor, monitoring: monitor, draggable: !monitor } as SpatialEntry);
const spatial = (keys: string[] = KEYS) => [
  entry('list', -1, 0, 0, 100, ROW * keys.length, true),
  ...keys.map((k, i) => entry(k, 0, 0, i * ROW, 100, ROW)),
];
const mockCtx = {
  hoverReadySV: sv(false), dragPhaseSV: sv<string>('idle'), draggedIdSV: sv(''), receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''), hoverPositionSV: makeHoverPositionSV(), dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  hoverDimsSV: sv({ x: 0, y: 0 }), spatialIndexSV: sv(spatial()), scrollOffsetsSV: sv([] as { x: number; y: number }[]),
  grabOffsetSV: sv({ x: 0, y: 0 }), startPositionSV: sv({ x: 0, y: 0 }), rootOffsetSV: sv({ x: 0, y: 0 }),
  needsUpdatesSV: sv(false),
  rootViewRef: { current: null }, hoverClearDeferredRef: { current: false },
  setHoverContent: (content: ReactNode) => {
    if (content != null) mockUIQueue.push(() => { mockCtx.dragPhaseSV.value = 'dragging'; mockCtx.hoverReadySV.value = true; });
  },
  handleDragStart: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragStart'],
  handleReceiverChange: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleReceiverChange'],
  handleDragEnd: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragEnd'],
};
jest.mock('../hooks/useDraxContext', () => ({ useDraxContext: () => mockCtx }));

const Dispatcher = () => {
  const dispatch = useCallbackDispatch({
    ...mockCtx,
    getViewEntry: (id: string) => {
      const props = mockDraxProps.get(id);
      if (!props) return undefined;
      const entries = mockCtx.spatialIndexSV.value;
      const index = entries.findIndex((e) => e.id === id);
      const e = entries[index]!;
      return { id, parentId: entries[e.parentIndex]?.id, spatialIndex: index,
        measurements: { x: e.x, y: e.y, width: e.width, height: e.height }, props };
    },
    hoverStylesRef: { current: null },
    droppedItemsRef: { current: new Map() },
  } as never);
  Object.assign(mockCtx, dispatch);
  return null;
};

let sortable: SortableListHandle<string>;
let setListData: (next: string[]) => void = () => {};
const List = ({ onReorder, echo }: { onReorder: jest.Mock; echo: boolean }) => {
  const [data, setData] = useState<string[]>(KEYS);
  setListData = setData;
  const handle = useSortableList({
    id: 'list', data, keyExtractor: (i) => i,
    onReorder: (event) => { onReorder(event); if (echo) setData(event.data); },
  });
  useLayoutEffect(() => { sortable = handle; });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <SortableItem key={item} sortable={handle} index={index}>{null}</SortableItem>
      ))}
    </SortableContainer>
  );
};

const settle = () => act(() => {
  for (let g = 0; g < 200; g++) {
    if (mockUIQueue.length) mockUIQueue.shift()!();
    else if (mockJSQueue.length) mockJSQueue.shift()!();
    else if (jest.getTimerCount()) jest.runOnlyPendingTimers();
    else return;
  }
  throw new Error('queues did not settle');
});

// Re-measure every row at its slot in `keys` (what layout does after a data change).
const measureAll = (keys: string[]) => {
  mockCtx.spatialIndexSV.value = spatial(keys);
  act(() => keys.forEach((k, i) => mockDraxProps.get(k)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)));
  act(() => mockDraxProps.get('list')!.onMeasure!({ x: 0, y: 0, width: 100, height: ROW * keys.length } as never));
  settle();
};

let root: ReturnType<typeof create> | undefined;
const setup = (echo = true) => {
  mockDraxProps.clear();
  const onReorder = jest.fn();
  act(() => { root = create(<><Dispatcher /><List onReorder={onReorder} echo={echo} /></>); });
  measureAll(KEYS);
  return { onReorder };
};
afterEach(() => { act(() => root?.unmount()); root = undefined; });
beforeAll(() => { jest.useFakeTimers(); });

// Slot centres; slot 0 is grabbed at y 40 to stay out of the 10% auto-scroll band.
const slot = (s: number) => ({ x: 50, y: s === 0 ? 40 : s * ROW + ROW / 2 });
let receiver = '';
const start = (id: string, pos: { x: number; y: number }) => {
  receiver = '';
  mockCtx.draggedIdSV.value = id;
  mockCtx.grabOffsetSV.value = { x: 50, y: ROW / 2 };
  mockCtx.startPositionSV.value = pos;
  mockCtx.hoverPositionSV.value = pos;
  act(() => mockCtx.handleDragStart(id, pos, { x: 0, y: 0 }));
  settle();
};
const move = (pos: { x: number; y: number }, newReceiver: string) => {
  mockCtx.hoverPositionSV.value = pos;
  act(() => mockCtx.handleReceiverChange(receiver, newReceiver, pos, ['list']));
  receiver = newReceiver;
  settle();
};
/** Drag A from slot 0 down two slots and release; the snap is still running. */
const dragADownTwoAndRelease = () => {
  start('A', slot(0));
  move(slot(0), 'A');
  move(slot(1), 'B');
  move(slot(2), 'C');
  act(() => mockCtx.handleDragEnd('A', receiver, false, ['list']));
  receiver = '';
  settle();
};
// The second settle drains the UI work queued by the flush render.
const finishSnap = () => { act(() => mockCtx.hoverPositionSV.finishSnap()); settle(); settle(); };
const MOVED = ['B', 'C', 'A', 'D', 'E'];
const shifts = () => ({ ...(sortable._internal.shiftsRef.value as Record<string, unknown>) });

describe('SortableContainer: onReorder fires at release, the visual commit at snap end', () => {
  it('fires onReorder once, at release, before the snap ends', () => {
    const { onReorder } = setup();
    dragADownTwoAndRelease();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ data: MOVED, fromIndex: 0, toIndex: 2 }));
    expect(sortable.data).toEqual(KEYS); // the parent's echo waits for snap end
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(sortable.data).toEqual(MOVED);
    expect(shifts()).toEqual({});
  });

  it('a parent that does not echo keeps the reorder as permanent shifts', () => {
    const { onReorder } = setup(false);
    dragADownTwoAndRelease();
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(sortable.data).toEqual(KEYS);
    expect(sortable._internal.committedOrderRef.current).toEqual([1, 2, 0, 3, 4]);
    expect(shifts()).toEqual(sortable._internal.committedShiftsRef.current);
    expect(shifts()).toHaveProperty('A');
  });

  it('another data change before snap end neither re-applies nor corrupts the reorder', () => {
    const { onReorder } = setup();
    dragADownTwoAndRelease();
    const NEXT = ['X', ...MOVED];
    act(() => setListData(NEXT)); // lands after the echo, before snap end
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(sortable.data).toEqual(NEXT);
    expect(shifts()).toEqual({});
  });

  it('a drop back on the start slot fires no onReorder', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    move(slot(1), 'B');
    move(slot(0), 'A');
    act(() => mockCtx.handleDragEnd('A', receiver, false, ['list']));
    receiver = '';
    finishSnap();
    expect(onReorder).not.toHaveBeenCalled();
  });
});
