import { act, useLayoutEffect, useState } from 'react';
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
  entry('nearCard', -1, 0, ROW * KEYS.length + 10, 100, ROW), // inside the list's monitor padding
  entry('outer', -1, 0, 0, 600, 600, true), // an outer monitor around the list (e.g. a DraxScrollView)
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
let setListData: (update: (prev: string[]) => string[]) => void = () => {};
const List = ({ onReorder, onDragEnd, reorderStrategy }: {
  onReorder: jest.Mock; onDragEnd: jest.Mock; reorderStrategy?: 'insert' | 'swap';
}) => {
  const [data, setData] = useState(KEYS);
  setListData = setData;
  const handle = useSortableList({ id: 'list', data, keyExtractor: (i) => i, onReorder, onDragEnd, reorderStrategy });
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
const setup = (reorderStrategy?: 'insert' | 'swap') => {
  mockDraxProps.clear();
  mockCtx.spatialIndexSV.value = spatial();
  const onReorder = jest.fn();
  const onDragEnd = jest.fn();
  const onNearCardDrop = jest.fn();
  act(() => {
    root = create(
      <>
        <Dispatcher />
        <List onReorder={onReorder} onDragEnd={onDragEnd} reorderStrategy={reorderStrategy} />
        <DraxView id="card" payload={{ card: true }} />
        <DraxView id="nearCard" payload={{ card: true }} onReceiveDragDrop={onNearCardDrop} />
        <DraxView id="outer" monitoring />
      </>
    );
  });
  act(() => KEYS.forEach((k, i) => mockDraxProps.get(k)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)));
  act(() => mockDraxProps.get('list')!.onMeasure!({ x: 0, y: 0, width: 100, height: ROW * KEYS.length } as never));
  settle();
  return { onReorder, onDragEnd, onNearCardDrop };
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
  mockCtx.grabOffsetSV.value = { x: 50, y: ROW / 2 };
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

  it('crossed the neighbour, dropped on a receiver inside the monitor padding: no onReorder', () => {
    const { onReorder, onDragEnd, onNearCardDrop } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']);
    // Still a list monitor. The finger is past the list's bottom edge, so
    // auto-scroll ticks forever here: drain the queues but not the timers.
    const pos = { x: 50, y: ROW * KEYS.length + 35 };
    mockCtx.hoverPositionSV.value = pos;
    act(() => mockCtx.handleReceiverChange(receiver, 'nearCard', pos, ['list']));
    receiver = 'nearCard';
    act(() => { while (mockUIQueue.length || mockJSQueue.length) (mockUIQueue.shift() ?? mockJSQueue.shift())!(); });
    end('A', ['list']);
    expect(mockCtx.hoverPositionSV.snapTarget).toEqual({ x: 0, y: ROW * KEYS.length + 10 });
    finishSnap();
    expect(onNearCardDrop).toHaveBeenCalledTimes(1);
    expect(onReorder).not.toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ index: 0, toIndex: 0 }));
  });

  it.each([
    ['an outside receiver', 'card', CARD, [] as string[]],
    ['a receiver inside the monitor padding', 'nearCard', { x: 50, y: ROW * KEYS.length + 35 }, ['list']],
  ])('crossed the neighbour, dropped on %s that removes the row after the onReorder frame: no onReorder', (_label, card, pos, monitors) => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']);
    mockCtx.hoverPositionSV.value = pos;
    act(() => mockCtx.handleReceiverChange(receiver, card, pos, monitors));
    receiver = card;
    act(() => { while (mockUIQueue.length || mockJSQueue.length) (mockUIQueue.shift() ?? mockJSQueue.shift())!(); });
    end('A', monitors);
    act(() => mockCtx.hoverPositionSV.finishSnap());
    // Run drax's onReorder frame (rAF) before the receiver's write.
    act(() => { while (mockUIQueue.length || mockJSQueue.length) (mockUIQueue.shift() ?? mockJSQueue.shift())!(); });
    act(() => { jest.advanceTimersByTime(100); });
    expect(onReorder).not.toHaveBeenCalled();
    act(() => setListData((prev) => prev.filter((k) => k !== 'A')));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onReorder).not.toHaveBeenCalled();
    expect(sortable.data).toEqual(['B', 'C', 'D', 'E']);
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

// rc.3 Exit fix: 0.11 reset the shifts on every monitor exit or end
// (build/DraxList.js:341-342 via onMonitorDragExit :474-476).
describe('SortableContainer: monitor exit resets the pending order and shifts', () => {
  it('exit, then release over nothing: shifts reset at exit, no onReorder', () => {
    const { onReorder } = setup();
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(2), 'C', ['list']); // pending order B, C, A
    expect(shifts()).toHaveProperty('B');
    expect(shifts()).toHaveProperty('C');
    move(NOWHERE, '', []); // monitor exit
    // Reset on exit, before the release: neighbours go back to their slots.
    expect(shifts()).toEqual(sortable._internal.committedShiftsRef.current);
    end('A', []);
    finishSnap();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onReorder).not.toHaveBeenCalled();
    expect(shifts()).toEqual({});
    expect(sortable.data).toEqual(KEYS);
  });

  it('exit into an outer monitor, re-enter, then release on a row: onReorder with the re-entry indices', () => {
    // The row leaves the list but stays inside an outer monitor, so
    // re-entering does not fire the list's onMonitorDragStart again: only
    // the exit reset stops the stale order from carrying over. 'swap' makes
    // the result depend on that order: from the start order A swaps with D;
    // from a stale B, C, A it would swap with the row in slot 3 of that order.
    const { onReorder } = setup('swap');
    start('A', row(0));
    move(row(0), 'A', ['outer', 'list']);
    move(row(1), 'B', ['outer', 'list']);
    move(row(2), 'C', ['outer', 'list']); // pending order B, C, A
    move(NOWHERE, '', ['outer']); // list exit, still inside the outer monitor
    expect(shifts()).toEqual(sortable._internal.committedShiftsRef.current);
    move(row(3), 'D', ['outer', 'list']); // back in over slot 3: A swaps with D
    end('A', ['outer', 'list']);
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ data: ['D', 'B', 'C', 'A', 'E'], fromIndex: 0, toIndex: 3, fromItem: 'A' })
    );
  });

  it('regression: an in-list reorder still calls onReorder, also after an exit drag', () => {
    const { onReorder } = setup();
    // A drag that left the list and was released over nothing first.
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(1), 'B', ['list']);
    move(NOWHERE, '', []);
    end('A', []);
    finishSnap();
    expect(onReorder).not.toHaveBeenCalled();
    // Then a plain in-list reorder.
    start('A', row(0));
    move(row(0), 'A', ['list']);
    move(row(2), 'C', ['list']);
    end('A', ['list']);
    finishSnap();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(
      expect.objectContaining({ data: ['B', 'C', 'A', 'D', 'E'], fromIndex: 0, toIndex: 2, fromItem: 'A' })
    );
  });
});
