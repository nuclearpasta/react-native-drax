import { act, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { create } from 'react-test-renderer';

import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
import { useSortableList } from '../hooks/useSortableList';
import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import type { DraxViewProps, SortableListHandle, SpatialEntry } from '../types';

// A press that starts right around a drop's snap end must drag the row it
// pressed. Cells are index-keyed (as in DraxList), and the native touch stays
// with the cell it began on. The flush after the parent's echo renders another
// item in that cell; if it lands between touch-down and the long-press
// activation, the drag picks up the new item (B pressed, C dragged).
// Same harness as SortableContainer.reorderAtRelease.test.tsx, with cells
// keyed and recorded by index.

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { index?: number } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? '' : `cell${payload?.index}`, props);
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
  ...keys.map((_k, i) => entry(`cell${i}`, 0, 0, i * ROW, 100, ROW)),
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
const onDragStart = jest.fn();
const List = ({ onReorder, echo }: { onReorder: jest.Mock; echo: boolean }) => {
  const [data, setData] = useState<string[]>(KEYS);
  const handle = useSortableList({
    id: 'list', data, keyExtractor: (i) => i, onDragStart,
    onReorder: (event) => { onReorder(event); if (echo) setData(event.data); },
  });
  useLayoutEffect(() => { sortable = handle; });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <SortableItem key={`cell${index}`} sortable={handle} index={index}>{item}</SortableItem>
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
  act(() => keys.forEach((_k, i) => mockDraxProps.get(`cell${i}`)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never)));
  act(() => mockDraxProps.get('list')!.onMeasure!({ x: 0, y: 0, width: 100, height: ROW * keys.length } as never));
  settle();
};

let root: ReturnType<typeof create> | undefined;
const setup = (echo = true) => {
  mockDraxProps.clear();
  onDragStart.mockClear();
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
  start('cell0', slot(0));
  move(slot(0), 'cell0');
  move(slot(1), 'cell1');
  move(slot(2), 'cell2');
  mockCtx.dragPhaseSV.value = 'releasing'; // set by useDragGesture before handleDragEnd
  act(() => mockCtx.handleDragEnd('cell0', receiver, false, ['list']));
  receiver = '';
  settle();
};
// The second settle drains the UI work queued by the flush render.
const finishSnap = () => { act(() => mockCtx.hoverPositionSV.finishSnap()); settle(); settle(); };
const MOVED = ['B', 'C', 'A', 'D', 'E'];

// RN touch events on the list container (they bubble up from the rows).
const touch = (type: 'onTouchStart' | 'onTouchEnd' | 'onTouchCancel', touches: number) => {
  act(() => mockDraxProps.get('list')![type]?.({ nativeEvent: { touches: Array(touches).fill({}) } } as never));
  settle();
};

describe('SortableContainer: a press across the post-drop flush keeps its row', () => {
  it('a touch down before the flush drags the row it pressed', () => {
    const { onReorder } = setup();
    dragADownTwoAndRelease();
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ data: MOVED }));
    // Finger down on slot 0 during the snap: cell1 is drawn there (B, shifted up).
    touch('onTouchStart', 1);
    finishSnap();
    // The long press activates on cell1, the cell the touch began on.
    mockCtx.dragPhaseSV.value = 'idle';
    start('cell1', slot(0));
    move(slot(0), 'cell1'); // the first monitor update fires onMonitorDragStart
    expect(onDragStart).toHaveBeenLastCalledWith({ index: 0, item: 'B' });
    expect(mockDraxProps.get('cell1')!.children).toBe('B');
    expect(sortable.data).toEqual(KEYS);
  });

  it('applies the flush when the touch ends without a drag', () => {
    setup();
    dragADownTwoAndRelease();
    touch('onTouchStart', 1);
    finishSnap();
    expect(sortable.data).toEqual(KEYS);
    touch('onTouchEnd', 0);
    settle();
    expect(sortable.data).toEqual(MOVED);
    expect(mockDraxProps.get('cell0')!.children).toBe('B');
  });

  it('keeps the flush while another finger is still down', () => {
    setup();
    dragADownTwoAndRelease();
    touch('onTouchStart', 1);
    touch('onTouchStart', 2);
    finishSnap();
    touch('onTouchEnd', 1);
    expect(sortable.data).toEqual(KEYS);
    touch('onTouchCancel', 0);
    expect(sortable.data).toEqual(MOVED);
  });

  it('a touch after the flush drags the row now in that cell', () => {
    setup();
    dragADownTwoAndRelease();
    finishSnap();
    expect(sortable.data).toEqual(MOVED);
    touch('onTouchStart', 1);
    start('cell0', slot(0));
    move(slot(0), 'cell0');
    expect(onDragStart).toHaveBeenLastCalledWith({ index: 0, item: 'B' });
  });
});
