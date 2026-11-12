import { act, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { create } from 'react-test-renderer';

import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
import { useSortableList } from '../hooks/useSortableList';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// The list's data changes from outside WHILE one of its rows is dragged (two
// quick drops: drop 1's insert lands at drag 2's start). The drag's pending
// order indexes the old data, so it must not reach onReorder.
// Real useCallbackDispatch + useSortableList + SortableContainer +
// SortableItem; DraxView stubbed to record props. UI/JS threads are FIFO
// queues drained by the test.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? '' : payload?.item ?? props.id ?? '', props);
    if (props.id) mockDraxProps.set(props.id, props); // index-keyed cells: the view id stays with the cell
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
// Cell view ids: item keys, or `cell<i>` for index-keyed cells (as DraxList renders).
let cellId = (key: string, _index: number) => key;
const spatial = (keys: string[] = KEYS) => [
  entry('list', -1, 0, 0, 100, ROW * keys.length, true),
  ...keys.map((k, i) => entry(cellId(k, i), 0, 0, i * ROW, 100, ROW)),
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
const List = ({ onReorder }: { onReorder: jest.Mock }) => {
  const [data, setData] = useState<string[]>(KEYS);
  setListData = setData;
  const handle = useSortableList({ id: 'list', data, keyExtractor: (i) => i, onReorder });
  useLayoutEffect(() => { sortable = handle; });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <SortableItem key={cellId(item, index)} id={cellId(item, index)} sortable={handle} index={index}>{null}</SortableItem>
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
const setup = (indexKeyed = false) => {
  cellId = indexKeyed ? (_key, index) => `cell${index}` : (key) => key;
  mockDraxProps.clear();
  const onReorder = jest.fn();
  act(() => { root = create(<><Dispatcher /><List onReorder={onReorder} /></>); });
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
const drop = (id: string) => {
  act(() => mockCtx.handleDragEnd(id, receiver, false, ['list']));
  receiver = '';
  const snapTarget = mockCtx.hoverPositionSV.snapTarget;
  act(() => mockCtx.hoverPositionSV.finishSnap());
  settle(); // runs the rAF that sends onReorder
  return snapTarget;
};
const reorderData = (onReorder: jest.Mock) =>
  (onReorder.mock.calls as unknown as [{ data: string[] }][]).map(([e]) => e.data);

describe('useSortableList: data changes from outside during a row drag', () => {
  it('control: no data change, A moved down 2 slots -> onReorder data [B, C, A, D, E]', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    move(slot(1), 'B');
    move(slot(2), 'C');
    drop('A');
    expect(reorderData(onReorder)).toEqual([['B', 'C', 'A', 'D', 'E']]);
  });

  it('X prepended mid-drag, then A moved down 2 slots -> the drag is cancelled: no onReorder, no item lost', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    // Drop 1's insert lands now (edm: onReceiveSnapEnd fired from drag 2's start).
    const NEXT = ['X', ...KEYS];
    act(() => setListData(NEXT));
    measureAll(NEXT); // X at slot 0, A at slot 1, ... E at slot 5
    // A moves down 2 slots in the new layout: slot 1 -> slot 3.
    move(slot(1), 'A');
    move(slot(2), 'B');
    move(slot(3), 'C');
    expect(drop('A')).toEqual({ x: 0, y: ROW }); // back to A's slot in the new data
    expect(onReorder).not.toHaveBeenCalled();
    expect(sortable.data).toEqual(NEXT);

    // The next drag starts from the new data and reorders it.
    start('A', slot(1));
    move(slot(1), 'A');
    move(slot(2), 'B');
    move(slot(3), 'C');
    drop('A');
    expect(reorderData(onReorder)).toEqual([['X', 'B', 'C', 'A', 'D', 'E']]);
  });

  it('index-keyed cells (DraxList): X prepended mid-drag -> the cancelled drop snaps back to A, not to the row now in its cell', () => {
    const { onReorder } = setup(true);
    start('cell0', slot(0)); // A
    move(slot(0), 'cell0');
    const NEXT = ['X', ...KEYS];
    act(() => setListData(NEXT));
    measureAll(NEXT); // cell0 now renders X; A is in cell1 at slot 1
    move(slot(1), 'cell1');
    move(slot(2), 'cell2');
    expect(drop('cell0')).toEqual({ x: 0, y: ROW }); // A's slot, not X's
    expect(onReorder).not.toHaveBeenCalled();
    expect(sortable.data).toEqual(NEXT);
  });

  it('index-keyed cells: X prepended mid-drag, release without moving -> snaps back to A, not to X', () => {
    const { onReorder } = setup(true);
    start('cell0', slot(0)); // A
    move(slot(0), 'cell0');
    const NEXT = ['X', ...KEYS];
    act(() => setListData(NEXT));
    measureAll(NEXT); // cell0 now renders X; A is in cell1 at slot 1
    expect(drop('cell0')).toEqual({ x: 0, y: ROW }); // A's slot, not X's
    expect(onReorder).not.toHaveBeenCalled();
    expect(sortable.data).toEqual(NEXT);
  });

  it('same keys in a new array mid-drag (a refetch) -> the drag still reorders', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    act(() => setListData([...KEYS]));
    move(slot(1), 'B');
    move(slot(2), 'C');
    drop('A');
    expect(reorderData(onReorder)).toEqual([['B', 'C', 'A', 'D', 'E']]);
  });

  it('same keys in a new array after A moved down 2 slots -> live shifts stay, the drop still reorders', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    move(slot(1), 'B');
    move(slot(2), 'C');
    const shifts = () => sortable._internal.shiftsRef.value;
    const before = shifts();
    expect(before).toMatchObject({ B: { y: -ROW }, C: { y: -ROW } });
    act(() => setListData([...KEYS]));
    settle();
    expect(shifts()).toEqual(before); // B and C stay slid aside, not {}
    drop('A');
    expect(reorderData(onReorder)).toEqual([['B', 'C', 'A', 'D', 'E']]);
  });

  it('data reordered mid-drag (same length), then A moved -> no onReorder', () => {
    const { onReorder } = setup();
    start('A', slot(0));
    move(slot(0), 'A');
    const NEXT = [...KEYS].reverse();
    act(() => setListData(NEXT));
    measureAll(NEXT); // A now at slot 4
    move(slot(3), 'B');
    move(slot(2), 'C');
    expect(drop('A')).toEqual({ x: 0, y: 4 * ROW });
    expect(onReorder).not.toHaveBeenCalled();
    expect(sortable.data).toEqual(NEXT);
  });
});
