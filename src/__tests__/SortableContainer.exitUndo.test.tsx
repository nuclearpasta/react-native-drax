import { act, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { create } from 'react-test-renderer';

import { DraxView } from '../DraxView';
import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
import { useSortableList } from '../hooks/useSortableList';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// A list row that crosses its neighbour and then leaves the list must not
// reorder unless it comes back and is dropped on the list.
// Renders the real useCallbackDispatch + useSortableList + SortableContainer +
// SortableItem. DraxView is a stub that records its props; the UI and JS
// threads are FIFO queues the test drains.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? '' : payload?.item ?? props.id ?? '', props);
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

/** hoverPositionSV that holds a snap animation until the test finishes it. */
const makeHoverPositionSV = () => {
  let current: unknown = { x: 0, y: 0 };
  let snap: MockSnap | undefined;
  return {
    get value() { return current; },
    set value(next: unknown) {
      const running = snap;
      snap = undefined;
      running?.cb?.(false);
      if (isMockSnap(next)) snap = next;
      else current = next;
    },
    finishSnap() {
      const r = snap!;
      snap = undefined;
      current = r.to;
      r.cb?.(true);
    },
    get snapTarget() { return snap?.to; },
  };
};
const sv = <T,>(value: T) => ({ value });
const ROW = 50;
const KEYS = ['A', 'B', 'C', 'D', 'E'];
const entry = (id: string, parentIndex: number, x: number, y: number, w: number, h: number, monitor = false) =>
  ({ id, x, y, width: w, height: h, parentIndex, receptive: !monitor, monitoring: monitor, draggable: !monitor } as SpatialEntry);
const spatial = () => [
  entry('list', -1, 0, 0, 100, ROW * KEYS.length, true),
  ...KEYS.map((k, i) => entry(k, 0, 0, i * ROW, 100, ROW)),
  entry('card', -1, 300, 0, 100, ROW),
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

/** Real callback dispatch, wired to the stubbed views and spatial index. */
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
const List = ({ onReorder }: { onReorder: jest.Mock }) => {
  const handle = useSortableList({ id: 'list', data: KEYS, keyExtractor: (i) => i, onReorder });
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

let root: ReturnType<typeof create> | undefined;
const setup = () => {
  mockDraxProps.clear();
  mockCtx.spatialIndexSV.value = spatial();
  const onReorder = jest.fn();
  act(() => {
    root = create(
      <>
        <Dispatcher />
        <List onReorder={onReorder} />
        <DraxView id="card" payload={{ card: true }} />
      </>
    );
  });
  act(() => KEYS.forEach((k, i) => mockDraxProps.get(k)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)));
  act(() => mockDraxProps.get('list')!.onMeasure!({ x: 0, y: 0, width: 100, height: ROW * KEYS.length } as never));
  settle();
  return { onReorder };
};
beforeAll(() => { jest.useFakeTimers(); });
afterEach(() => { act(() => root?.unmount()); root = undefined; });

// Slot 0's centre (y 25) is inside the 10% auto-scroll band of a 250 px list,
// so slot 0 is grabbed at y 40.
const row = (slot: number) => ({ x: 50, y: slot === 0 ? 40 : slot * ROW + ROW / 2 });
const CARD = { x: 350, y: 25 };
const NOWHERE = { x: 500, y: 500 };
let receiver = '';
const start = (id: string, pos: { x: number; y: number }) => {
  receiver = '';
  mockCtx.draggedIdSV.value = id;
  mockCtx.startPositionSV.value = pos;
  mockCtx.hoverPositionSV.value = pos;
  act(() => mockCtx.handleDragStart(id, pos, { x: 0, y: 0 }));
  settle();
};
const move = (pos: { x: number; y: number }, newReceiver: string, monitors: string[]) => {
  mockCtx.hoverPositionSV.value = pos;
  act(() => mockCtx.handleReceiverChange(receiver, newReceiver, pos, monitors));
  receiver = newReceiver;
  settle();
};
const end = (id: string, finalMonitors: string[]) => {
  act(() => mockCtx.handleDragEnd(id, receiver, false, finalMonitors));
  receiver = '';
};
const finishSnap = () => { act(() => mockCtx.hoverPositionSV.finishSnap()); settle(); };
const shifts = () => ({ ...(sortable._internal.shiftsRef.value as Record<string, unknown>) });

describe('SortableContainer: a row that leaves the list undoes its pending move', () => {
  it('crossed the neighbour, dropped on an outside receiver: no onReorder', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']); // crosses B: pending move A -> slot 1
    expect(shifts()).toHaveProperty('B');
    move(CARD, 'card', []); // leaves the list, over the card
    expect(shifts()).toEqual(sortable._internal.committedShiftsRef.current);
    end('A', []);
    expect(mockCtx.hoverPositionSV.snapTarget).toEqual({ x: 300, y: 0 }); // snaps to the card
    finishSnap();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('crossed the neighbour, released over nothing: no onReorder, row back in its slot', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']);
    move(NOWHERE, '', []);
    end('A', []);
    expect(mockCtx.hoverPositionSV.snapTarget).toEqual({ x: 0, y: 0 }); // A's home slot
    finishSnap();
    expect(onReorder).not.toHaveBeenCalled();
    expect(shifts()).toEqual({});
    expect(sortable.data).toEqual(KEYS);
  });

  it('control: dropped on an outside receiver without crossing: no onReorder', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(CARD, 'card', []);
    end('A', []);
    finishSnap();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('crossed the neighbour, left, came back and dropped on a row: the reorder applies', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']);
    move(CARD, 'card', []);
    move(row(3), 'D', ['list']); // back in, over D
    end('A', ['list']);
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ data: ['B', 'C', 'D', 'A', 'E'], fromIndex: 0, toIndex: 3 })
    );
  });

  it('came back to the same slot it crossed into before leaving: the reorder applies', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(2), 'C', ['list']);
    move(row(1), 'B', ['list']); // last move: backward into slot 1
    move(CARD, 'card', []);
    move(row(1), 'B', ['list']); // forward into slot 1 from the start slot
    end('A', ['list']);
    finishSnap();
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ data: ['B', 'A', 'C', 'D', 'E'], fromIndex: 0, toIndex: 1 })
    );
  });
});
