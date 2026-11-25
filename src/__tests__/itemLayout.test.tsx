import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import { useSortableList } from '../hooks/useSortableList';
import type {
  DraxViewProps,
  SortableItemLayout,
  SortableListHandle,
  UseSortableListOptions,
} from '../types';

// getItemLayout: a virtualized list mounts (and so measures) only the rows
// near the viewport, and a row that was unmounted keeps the measurement it had
// then. With getItemLayout the list says where every row is, so rows that are
// not mounted count for slots, shifts and the snap target.
// Same harness as draggedItemSlot.test.tsx: DraxView is a stub that records
// its props so the test can fire the container's monitor callbacks.
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

// 60 rows, 50 high with a 10 gap (stride 60), in a 400-high container at (10, 20).
// Drax measures row i at i * STRIDE. The list's own offsets start somewhere
// else (LIST_ORIGIN), as they do when the list counts its header or padding.
const COUNT = 60;
const DATA = Array.from({ length: COUNT }, (_, i) => `r${i}`);
const ROW = 50;
const GAP = 10;
const STRIDE = ROW + GAP;
const CONTAINER = { x: 10, y: 20, width: 100, height: 400 };
const LIST_ORIGIN = 100;

type Options = Partial<UseSortableListOptions<string>>;

let sortable: SortableListHandle<string>;
let onReorder: jest.Mock;
let onDragPositionChange: jest.Mock;
let options: Options;

const List = () => {
  const handle = useSortableList({
    id: 'list',
    data: DATA,
    keyExtractor: (item) => item,
    onReorder,
    onDragPositionChange,
    ...options,
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

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const indexOf = (key: string) => Number(key.slice(1));

/** The list's layout of evenly sized rows. */
const evenLayout = (key: string): SortableItemLayout => ({
  offset: LIST_ORIGIN + indexOf(key) * STRIDE,
  length: ROW,
});

/**
 * Mounts the list and measures only the rows in `measured`: each at its slot,
 * or where `staleSlots` says it was when it was last mounted.
 */
const mount = (
  measured: number[],
  listOptions: Options,
  staleSlots: Record<string, number> = {},
) => {
  options = listOptions;
  onReorder = jest.fn();
  onDragPositionChange = jest.fn();
  act(() => {
    root = create(<List />);
  });
  const horizontal = listOptions.horizontal === true;
  measured.forEach((index) => {
    const key = DATA[index]!;
    const position = (staleSlots[key] ?? index) * STRIDE;
    sortable._internal.itemMeasurements.current.set(key, {
      x: horizontal ? position : 0,
      y: horizontal ? 0 : position,
      width: horizontal ? ROW : 100,
      height: horizontal ? 100 : ROW,
      key,
      index,
      scrollAtMeasure: { x: 0, y: 0 },
    });
  });
  act(() => {
    mockDraxProps.get('container')!.onMeasure!(CONTAINER as never);
  });
};

let scrollY = 0;

const scrollTo = (y: number) => {
  scrollY = y;
  act(() => {
    sortable.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as never);
  });
};

/** A drag of `key` with the hover centre at content position `contentY`. */
const dragEvent = (key: string, contentY: number) => ({
  dragged: {
    id: key,
    parentId: 'list',
    payload: mockDraxProps.get(key)!.payload,
    grabOffset: { x: 50, y: ROW / 2 },
    measurements: { x: 0, y: 0, width: 100, height: ROW },
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

const dragOver = (key: string, contentY: number) =>
  act(() => {
    mockDraxProps.get('container')!.onMonitorDragOver!(dragEvent(key, contentY) as never);
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
const positionOf = (index: number) => {
  const measurement = sortable._internal.getMeasurementByOriginalIndex(index);
  return measurement && { y: measurement.y, height: measurement.height };
};

describe('getItemLayout', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
    scrollY = 0;
  });
  afterEach(() => act(() => root.unmount()));

  it('reorders across rows that were never mounted', () => {
    // Rows 0..9 are the render window when the drag starts.
    mount(range(0, 9), { getItemLayout: evenLayout });
    pickUp('r2');
    // Auto-scroll carried the dragged row down to rows that were never measured.
    scrollTo(30 * STRIDE);
    dragOver('r2', centreOf(33));
    expect(lastToIndex()).toBe(33);
    // Rows 3..33 move up one slot, mounted or not; row 34 stays.
    for (const i of range(3, 33)) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r34')).toBeUndefined();

    // The hover snaps into slot 33, then onReorder fires.
    expect(drop('r2', centreOf(33))).toEqual({
      x: CONTAINER.x,
      y: CONTAINER.y + 33 * STRIDE - scrollY,
    });
    snapEnd('r2');
    expect(onReorder).toHaveBeenCalledTimes(1);
    const event = onReorder.mock.calls[0]![0];
    expect(event.fromIndex).toBe(2);
    expect(event.toIndex).toBe(33);
    expect(event.data.slice(0, 3)).toEqual(['r0', 'r1', 'r3']);
    expect(event.data.slice(31, 35)).toEqual(['r32', 'r33', 'r2', 'r34']);
    expect(event.data).toHaveLength(COUNT);
  });

  it('reorders after scrolling far down, with the first rows never mounted', () => {
    mount(range(20, 29), { getItemLayout: evenLayout });
    scrollTo(20 * STRIDE);
    pickUp('r25');
    dragOver('r25', centreOf(22));
    expect(lastToIndex()).toBe(22);
    for (const i of [22, 23, 24]) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: STRIDE });
    expect(shiftOf('r21')).toBeUndefined();
    expect(shiftOf('r26')).toBeUndefined();

    expect(drop('r25', centreOf(22))).toEqual({
      x: CONTAINER.x,
      y: CONTAINER.y + 22 * STRIDE - scrollY,
    });
    snapEnd('r25');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]![0]).toMatchObject({ fromIndex: 25, toIndex: 22 });
  });

  it("takes the list's position over the measurement of a row that has moved since", () => {
    // Every row is measured, but r0 was last measured in slot 5: it was
    // unmounted before an earlier reorder brought it to the top. The slots
    // are laid out from the first row, so its stale position would move all.
    mount(range(0, COUNT - 1), { getItemLayout: evenLayout }, { r0: 5 });
    pickUp('r4');
    dragOver('r4', centreOf(1));
    expect(lastToIndex()).toBe(1);
    for (const i of [1, 2, 3]) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: STRIDE });
    expect(shiftOf('r0')).toBeUndefined();
    expect(shiftOf('r5')).toBeUndefined();
    expect(drop('r4', centreOf(1))).toEqual({ x: CONTAINER.x, y: CONTAINER.y + STRIDE });
  });

  it("takes a row's size from its measurement, else from the list", () => {
    // The list reports 80 for every row. Rows 0..4 are measured at 50 and keep
    // that; rows from 5 on are not measured and count with 80.
    const TALL = 80;
    const getItemLayout = (key: string): SortableItemLayout => {
      const i = indexOf(key);
      const offset = i < 5 ? i * STRIDE : 5 * STRIDE + (i - 5) * (TALL + GAP);
      return { offset: LIST_ORIGIN + offset, length: TALL };
    };
    mount(range(0, 4), { getItemLayout });
    pickUp('r1');
    scrollTo(5 * STRIDE);
    // Rows 0..4 end at 300; row 5 spans 300..380, row 6 390..470, row 7 480..560.
    dragOver('r1', 490);
    expect(lastToIndex()).toBe(7);
    // The rows in between move up by the dragged row's own size and the gap.
    for (const i of range(2, 7)) expect(shiftOf(`r${i}`)).toEqual({ x: 0, y: -STRIDE });
    expect(shiftOf('r8')).toBeUndefined();
  });

  it("keeps each row's own measurement until a drag starts", () => {
    const getItemLayout = jest.fn(evenLayout);
    mount(range(0, 9), { getItemLayout }, { r3: 7 });
    expect(positionOf(3)).toEqual({ y: 7 * STRIDE, height: ROW });
    expect(positionOf(40)).toBeUndefined();
    expect(getItemLayout).not.toHaveBeenCalled();

    pickUp('r2');
    expect(positionOf(3)).toEqual({ y: 3 * STRIDE, height: ROW });
    expect(positionOf(40)).toEqual({ y: 40 * STRIDE, height: ROW });
  });

  it('keeps the own measurement of a row the list does not know', () => {
    const getItemLayout = (key: string) =>
      key === 'r3' || key === 'r40' ? undefined : evenLayout(key);
    mount(range(0, 9), { getItemLayout }, { r3: 7 });
    pickUp('r2');
    expect(positionOf(3)).toEqual({ y: 7 * STRIDE, height: ROW });
    expect(positionOf(40)).toBeUndefined();
    expect(positionOf(41)).toEqual({ y: 41 * STRIDE, height: ROW });
  });

  it('lays out a horizontal list along x', () => {
    mount(range(0, 9), { getItemLayout: evenLayout, horizontal: true });
    pickUp('r2');
    const measurement = sortable._internal.getMeasurementByOriginalIndex(40);
    expect(measurement).toMatchObject({ x: 40 * STRIDE, y: 0, width: ROW, height: 100 });
  });

  it('is ignored in a grid', () => {
    const getItemLayout = jest.fn(evenLayout);
    mount(range(0, 9), { getItemLayout, numColumns: 2 }, { r3: 7 });
    pickUp('r2');
    expect(getItemLayout).not.toHaveBeenCalled();
    expect(positionOf(3)).toEqual({ y: 7 * STRIDE, height: ROW });
    expect(positionOf(40)).toBeUndefined();
  });
});
