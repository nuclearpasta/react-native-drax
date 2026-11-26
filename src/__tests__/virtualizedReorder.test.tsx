import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import { useSortableList } from '../hooks/useSortableList';
import type { DraxViewProps, SortableListHandle } from '../types';

// Own-list reorder in a long, virtualized list. FlatList only mounts (and so
// only measures) the rows in its render window; the rest never report a
// layout. Slot detection, neighbour shifts and the snap target must work from
// the measured rows alone. Same harness as draggedItemSlot.test.tsx.
const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.isParent ? 'container' : payload?.item ?? '', props);
    return props.children ?? null;
  },
}));
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: ({ children }: { children?: ReactNode }) => children ?? null },
    useSharedValue: <T,>(value: T) => useStateMock(() => ({ value }))[0],
    useDerivedValue: () => ({ value: false }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: <T,>(value: T) => value,
    withSpring: <T,>(value: T) => value,
    Easing: { linear: undefined },
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUI:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) =>
      fn(...args),
  runOnJS: <F,>(fn: F) => fn,
}));
const sv = <T,>(value: T) => ({ value });
const mockCtx = {
  hoverReadySV: sv(false),
  dragPhaseSV: sv('idle'),
  draggedIdSV: sv(''),
  hoverPositionSV: sv({ x: 0, y: 0 }),
  hoverClearDeferredRef: { current: false },
  setHoverContent: jest.fn(),
};
jest.mock('../hooks/useDraxContext', () => ({ useDraxContext: () => mockCtx }));

// 200 rows, 50 high with a 10 gap (stride 60), in a 400-high container at (10, 20).
const COUNT = 200;
const DATA = Array.from({ length: COUNT }, (_, i) => `r${i}`);
const ROW = 50;
const GAP = 10;
const STRIDE = ROW + GAP;
const CONTAINER = { x: 10, y: 20, width: 100, height: 400 };

let sortable: SortableListHandle<string>;
let onReorder: jest.Mock;
let onDragPositionChange: jest.Mock;
let data: string[];

const List = () => {
  const handle = useSortableList({
    id: 'list',
    data,
    keyExtractor: (item) => item,
    onReorder,
    onDragPositionChange,
  });
  useLayoutEffect(() => {
    sortable = handle;
  });
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <SortableItem key={item} sortable={handle} index={index}>
          {null}
        </SortableItem>
      ))}
    </SortableContainer>
  );
};

let root: ReturnType<typeof create>;

type Layout = { y: number; height: number };

/** Mounts the list and measures only the rows in `measured` (the render window). */
const mount = (
  rows: string[],
  measured: number[],
  layout: (i: number) => Layout = (i) => ({ y: i * STRIDE, height: ROW }),
) => {
  data = rows;
  onReorder = jest.fn();
  onDragPositionChange = jest.fn();
  act(() => {
    root = create(<List />);
  });
  measured.forEach((index) => {
    const key = rows[index]!;
    const { y, height } = layout(index);
    sortable._internal.itemMeasurements.current.set(key, {
      x: 0, y, width: 100, height, key, index, scrollAtMeasure: { x: 0, y: 0 },
    });
  });
  act(() => {
    mockDraxProps.get('container')!.onMeasure!(CONTAINER as never);
  });
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const scrollTo = (y: number) =>
  act(() => {
    sortable.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as never);
  });

let scrollY = 0;

/** A drag of `key` with the hover centre at content position `contentY`. */
const dragEvent = (key: string, contentY: number, height = ROW) => ({
  dragged: {
    id: key,
    parentId: 'list',
    payload: mockDraxProps.get(key)!.payload,
    grabOffset: { x: 50, y: height / 2 },
    measurements: { x: 0, y: 0, width: 100, height },
  },
  dragAbsolutePosition: { x: 60, y: CONTAINER.y + contentY - scrollY },
  dragTranslation: { x: 0, y: 100 },
  monitorOffset: { x: 50, y: contentY - scrollY },
  monitorOffsetRatio: { x: 0.5, y: 0.5 },
});

const pickUp = (key: string) =>
  act(() => {
    mockDraxProps.get('container')!.onMonitorDragStart!(dragEvent(key, 0) as never);
  });

const dragOver = (key: string, contentY: number, height?: number) =>
  act(() => {
    mockDraxProps.get('container')!.onMonitorDragOver!(dragEvent(key, contentY, height) as never);
  });

const drop = (key: string, contentY: number) => {
  let target: unknown;
  act(() => {
    target = mockDraxProps.get('container')!.onMonitorDragDrop!(dragEvent(key, contentY) as never);
  });
  return target;
};

const snapEnd = (key: string) =>
  act(() => {
    mockDraxProps.get(key)!.onSnapEnd!({} as never);
    jest.runAllTimers();
  });

const shiftOf = (key: string) => sortable._internal.shiftsJSRef.current[key];
const centreOf = (index: number) => index * STRIDE + ROW / 2;
const lastToIndex = () =>
  onDragPositionChange.mock.calls[onDragPositionChange.mock.calls.length - 1]?.[0]?.toIndex;

describe('own-list reorder in a virtualized list', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
    scrollY = 0;
  });
  afterEach(() => act(() => root.unmount()));

  it('reorders over measured rows when rows past the render window are unmeasured', () => {
    mount(DATA, range(0, 19));
    pickUp('r2');
    dragOver('r2', centreOf(6));
    expect(lastToIndex()).toBe(6);
    // Rows 3..6 move up one slot; row 7 stays.
    for (const i of [3, 4, 5, 6]) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r7')).toBeUndefined();

    // The hover snaps into slot 6, then onReorder fires.
    expect(drop('r2', centreOf(6))).toEqual({
      x: CONTAINER.x,
      y: CONTAINER.y + 6 * STRIDE,
    });
    snapEnd('r2');
    expect(onReorder).toHaveBeenCalledTimes(1);
    const event = onReorder.mock.calls[0]![0];
    expect(event.fromIndex).toBe(2);
    expect(event.toIndex).toBe(6);
    expect(event.data.slice(0, 8)).toEqual(['r0', 'r1', 'r3', 'r4', 'r5', 'r6', 'r2', 'r7']);
    expect(event.data).toHaveLength(COUNT);
    // The list keeps the new order (permanent shifts), uncontrolled parent.
    expect(shiftOf('r2')).toEqual({ x: 0, y: 4 * STRIDE });
    expect(shiftOf('r3')).toEqual({ x: 0, y: -STRIDE });
  });

  it('reorders again after an unechoed reorder (permanent shifts)', () => {
    mount(DATA, range(0, 19));
    pickUp('r2');
    dragOver('r2', centreOf(6));
    drop('r2', centreOf(6));
    snapEnd('r2');
    onDragPositionChange.mockClear();

    // r2 now shows in slot 6; drag it on to slot 8.
    pickUp('r2');
    dragOver('r2', centreOf(8));
    expect(lastToIndex()).toBe(8);
    expect(shiftOf('r7')).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r8')).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r3')).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r9')).toBeUndefined();
    expect(drop('r2', centreOf(8))).toEqual({ x: CONTAINER.x, y: CONTAINER.y + 8 * STRIDE });
    snapEnd('r2');
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onReorder.mock.calls[1]![0]).toMatchObject({ fromIndex: 6, toIndex: 8 });
    expect(shiftOf('r2')).toEqual({ x: 0, y: 6 * STRIDE });
  });

  it('reorders after scrolling far down, with the first rows unmeasured', () => {
    // Rows 0..39 were never mounted; 40..59 are the render window.
    mount(DATA, range(40, 59));
    scrollY = 40 * STRIDE;
    scrollTo(scrollY);
    pickUp('r45');
    dragOver('r45', centreOf(50));
    expect(lastToIndex()).toBe(50);
    for (const i of range(46, 50)) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: -STRIDE });

    // Back up past the start slot.
    dragOver('r45', centreOf(42));
    expect(lastToIndex()).toBe(42);
    for (const i of [42, 43, 44]) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: STRIDE });
    expect(shiftOf('r46')).toBeUndefined();

    expect(drop('r45', centreOf(42))).toEqual({
      x: CONTAINER.x,
      y: CONTAINER.y + 42 * STRIDE - scrollY,
    });
    snapEnd('r45');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]![0]).toMatchObject({ fromIndex: 45, toIndex: 42 });
    expect(onReorder.mock.calls[0]![0].data.slice(41, 47)).toEqual(
      ['r41', 'r45', 'r42', 'r43', 'r44', 'r46'],
    );
  });

  it('clamps to the last measured row when the hover is past it', () => {
    mount(DATA, range(0, 19));
    pickUp('r2');
    dragOver('r2', centreOf(33));
    expect(lastToIndex()).toBe(19);
  });

  it('clamps to the first measured row when the hover is before it', () => {
    mount(DATA, range(40, 59));
    scrollY = 40 * STRIDE;
    scrollTo(scrollY);
    pickUp('r45');
    dragOver('r45', centreOf(30));
    expect(lastToIndex()).toBe(40);
  });
});

// A fully measured list must keep the pre-fix behaviour exactly: the same
// slot for every hover position and the same shifts.
describe('fully measured list (unchanged)', () => {
  // Five rows of different heights with uneven gaps.
  const ROWS = ['a', 'b', 'c', 'd', 'e'];
  const LAYOUT: Layout[] = [
    { y: 0, height: 40 },
    { y: 48, height: 70 },
    { y: 126, height: 30 },
    { y: 164, height: 90 },
    { y: 262, height: 50 },
  ];

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
    scrollY = 0;
    mount(ROWS, range(0, 4), (i) => LAYOUT[i]!);
  });
  afterEach(() => act(() => root.unmount()));

  it('maps hover positions to the same slots as before', () => {
    // Pre-fix boundaries: cursor from row 0, each row's height plus the gap
    // of the first two rows (8), boundary at the gap midpoint.
    const gap = 8;
    const expected = (y: number) => {
      let cursor = 0;
      for (let i = 0; i < LAYOUT.length; i++) {
        if (y < cursor + LAYOUT[i]!.height + gap / 2) return i;
        cursor += LAYOUT[i]!.height + gap;
      }
      return LAYOUT.length - 1;
    };
    pickUp('c');
    for (let y = -20; y <= 360; y += 3) {
      expect([y, sortable._internal.getSlotFromPosition({ x: 50, y })])
        .toEqual([y, expected(y)]);
    }
  });

  it('reorders with the same shifts, snap target and onReorder as before', () => {
    pickUp('a');
    dragOver('a', 200, 40);
    expect(lastToIndex()).toBe(3);
    // Pre-fix layout: start y 0, gap 8, order b c d a e.
    expect(shiftOf('b')).toEqual({ x: 0, y: -48 });
    expect(shiftOf('c')).toEqual({ x: 0, y: -48 });
    expect(shiftOf('d')).toEqual({ x: 0, y: -48 });
    expect(shiftOf('e')).toBeUndefined();
    expect(drop('a', 200)).toEqual({ x: CONTAINER.x, y: CONTAINER.y + 78 + 38 + 98 });
    snapEnd('a');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]![0]).toMatchObject({ fromIndex: 0, toIndex: 3 });
    expect(onReorder.mock.calls[0]![0].data).toEqual(['b', 'c', 'd', 'a', 'e']);
  });
});
