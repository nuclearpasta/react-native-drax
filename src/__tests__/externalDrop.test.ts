import type { ReactElement } from 'react';
import { SortableContainer } from '../SortableContainer';
import { useSortableList } from '../hooks/useSortableList';
import type {
  DraxMonitorDragDropEventData,
  DraxMonitorEventData,
  DraxProtocolDragEndResponse,
  SortableListHandle,
  SortableItemMeasurement,
} from '../types';

// No React renderer is a devDependency on this branch's base (main adds
// react-test-renderer in #310), so the hook and the container run as plain
// functions on a minimal hook store: hooks keep their value by call order,
// effects run after each pass, and a setState triggers another pass.
let mockSlots: { v: unknown }[] = [];
let mockCursor = 0;
let mockEffects: (() => void)[] = [];
let mockDirty = false;
function mockSlot<T>(init: () => T): { v: T } {
  const i = mockCursor++;
  if (!mockSlots[i]) mockSlots[i] = { v: init() };
  return mockSlots[i] as { v: T };
}
function mockEffect(fn: () => void, deps?: unknown[]) {
  const s = mockSlot<unknown[] | undefined>(() => undefined);
  if (!deps || !s.v || deps.some((d, i) => d !== s.v![i])) {
    s.v = deps;
    mockEffects.push(fn);
  }
}

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: (v: unknown) => mockSlot(() => ({ current: v })).v,
  useState: (init: unknown) => {
    const s = mockSlot(() => (typeof init === 'function' ? init() : init));
    const set = (n: unknown) => {
      const next = typeof n === 'function' ? n(s.v) : n;
      if (next !== s.v) mockDirty = true;
      s.v = next;
    };
    return [s.v, set];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: mockEffect,
  useLayoutEffect: mockEffect,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'View' },
  useSharedValue: (v: unknown) => mockSlot(() => ({ value: v })).v,
  useAnimatedStyle: () => ({}),
  withTiming: (v: unknown) => v,
}));
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: unknown) => fn,
  runOnUI: (fn: unknown) => fn,
}));
jest.mock('../DraxView', () => ({ DraxView: 'DraxView' }));
jest.mock('../hooks/useWebScrollFreeze', () => ({
  useWebScrollFreeze: () => ({ freeze: () => {}, unfreeze: () => {} }),
}));
const mockCtx = {
  hoverReadySV: { value: false },
  dragPhaseSV: { value: 'idle' },
  draggedIdSV: { value: '' },
  hoverPositionSV: { value: { x: 0, y: 0 } },
  hoverClearDeferredRef: { current: false },
  setHoverContent: () => {},
};
jest.mock('../hooks/useDraxContext', () => ({ useDraxContext: () => mockCtx }));
let mockBoard: unknown;
jest.mock('../SortableBoardContext', () => ({
  useSortableBoardContext: () => mockBoard,
}));

type Props = {
  onMonitorDragDrop: (e: DraxMonitorDragDropEventData) => DraxProtocolDragEndResponse;
  onMeasure: (m: unknown) => void;
  onMonitorDragOver: (e: DraxMonitorEventData) => void;
  onMonitorDragExit: (e: DraxMonitorEventData) => void;
};
let lastSortable: SortableListHandle<unknown>;

const LIST_ID = 'list';
const ITEMS = ['A', 'B', 'C'];

// Three 50pt rows with 10pt gaps: A 0-50, B 60-110, C 120-170.
function renderList(
  onExternalDrop?: jest.Mock,
  items = ITEMS,
  isMeasured = (_index: number) => true,
  numColumns = 1,
  {
    horizontal = false,
    collisionAlgorithm,
    height = 170,
    scrollY = 0,
    measure,
  }: {
    horizontal?: boolean;
    collisionAlgorithm?: string;
    height?: number;
    scrollY?: number;
    /** Overrides a row's default rect (any of x, y, width, height). */
    measure?: (index: number) => Partial<SortableItemMeasurement>;
  } = {}
) {
  container = { width: 330, height };
  mockSlots = [];
  let props = {} as Props;
  for (let pass = 0; pass < 10; pass++) {
    mockCursor = 0;
    mockDirty = false;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- runs on the mock hook store
    const sortable = useSortableList({
      id: LIST_ID,
      data: items,
      keyExtractor: (item: string) => item,
      onReorder: () => {},
      onExternalDrop,
      numColumns,
      horizontal,
    });
    items.forEach((key, index) => {
      if (!isMeasured(index)) return;
      sortable._internal.itemMeasurements.current.set(key, {
        key,
        index,
        x: horizontal ? index * 110 : (index % numColumns) * 110,
        y: horizontal ? 0 : Math.floor(index / numColumns) * 60,
        width: 100,
        height: 50,
        ...measure?.(index),
      } as SortableItemMeasurement);
    });
    sortable._internal.scrollPositionJSRef.current = { x: 0, y: scrollY };
    lastSortable = sortable as SortableListHandle<unknown>;
    const element = SortableContainer({
      sortable: sortable as SortableListHandle<unknown>,
      scrollRef: { current: null },
      children: null,
      draxViewProps: collisionAlgorithm ? { collisionAlgorithm } as never : undefined,
    }) as ReactElement<Props>;
    props = element.props;
    const effects = mockEffects;
    mockEffects = [];
    effects.forEach((fn) => fn());
    if (!mockDirty) break;
  }
  props.onMeasure({ x: 0, y: 0, ...container });
  return props;
}

// Container (monitor) size, at the root origin. Set per render.
let container = { width: 330, height: 170 };

const foreignPayload = { blankId: 7 };

/**
 * Drop a 100x50 foreign view with its centre at (x, y) in the list. Like
 * dispatch at drag end, monitorOffset and dragAbsolutePosition are the hover's
 * top-left (the monitor is at the root origin); dragTouchPosition is the finger,
 * `fingerShift` from the centre.
 */
function dropAt(
  props: Props,
  y: number,
  overrides: {
    parentId?: string;
    payload?: unknown;
    x?: number;
    fingerShift?: { x: number; y: number };
  } = {}
) {
  const dragged = {
    id: 'blank',
    parentId: 'parentId' in overrides ? overrides.parentId : 'bank',
    payload: 'payload' in overrides ? overrides.payload : foreignPayload,
    grabOffset: { x: 50, y: 25 },
    measurements: { x: 0, y: 0, width: 100, height: 50 },
  };
  const centre = { x: overrides.x ?? 50, y };
  const topLeft = { x: centre.x - 50, y: centre.y - 25 };
  const shift = overrides.fingerShift ?? { x: 0, y: 0 };
  return props.onMonitorDragDrop({
    dragged,
    receiver: { id: LIST_ID, payload: undefined },
    dragAbsolutePosition: topLeft,
    dragTouchPosition: { x: centre.x + shift.x, y: centre.y + shift.y },
    dragTranslation: { x: 500, y: 500 },
    monitorOffset: topLeft,
    monitorOffsetRatio: {
      x: topLeft.x / container.width,
      y: topLeft.y / container.height,
    },
  } as unknown as DraxMonitorDragDropEventData);
}

describe('onExternalDrop', () => {
  beforeEach(() => {
    mockBoard = undefined;
  });

  it.each([
    ['at the start (top half of A)', 10, 0],
    ['before B (top half of B)', 70, 1],
    ['after B (bottom half of B)', 100, 2],
    ['at the end (bottom half of C)', 160, 3],
  ])('fires with toIndex for a drop %s', (_, y, toIndex) => {
    const onExternalDrop = jest.fn();
    dropAt(renderList(onExternalDrop), y);
    expect(onExternalDrop).toHaveBeenCalledTimes(1);
    expect(onExternalDrop).toHaveBeenCalledWith({
      toIndex,
      payload: foreignPayload,
      dragged: expect.objectContaining({ id: 'blank', parentId: 'bank' }),
    });
  });

  it("does not fire for the list's own items", () => {
    const onExternalDrop = jest.fn();
    dropAt(renderList(onExternalDrop), 100, {
      parentId: LIST_ID,
      payload: { index: 0, originalIndex: 0 },
    });
    expect(onExternalDrop).not.toHaveBeenCalled();
  });

  it('does not fire for a board column item or an active board transfer', () => {
    const onExternalDrop = jest.fn();
    mockBoard = {
      registerColumn: () => {},
      unregisterColumn: () => {},
      boardInternal: {
        columns: new Map([['other-column', {}]]),
        transferState: { current: undefined },
      },
    };
    const props = renderList(onExternalDrop);
    dropAt(props, 100, {
      parentId: 'other-column',
      payload: { index: 0, originalIndex: 0 },
    });
    (mockBoard as { boardInternal: { transferState: { current: unknown } } })
      .boardInternal.transferState.current = { targetId: LIST_ID };
    dropAt(props, 100);
    expect(onExternalDrop).not.toHaveBeenCalled();
  });

  // A virtualized list only measures the rows it has mounted.
  describe('with unmeasured rows (20 rows)', () => {
    const LONG = Array.from({ length: 20 }, (_, i) => `R${i}`);

    it.each([
      ['top half of row 10', 10 * 60 + 10, 10],
      ['bottom half of row 10', 10 * 60 + 40, 11],
      ['gap after row 10', 10 * 60 + 55, 11],
      ['bottom half of the last row', 19 * 60 + 40, 20],
    ])('fires with the index of the measured row for a drop on the %s', (_, y, toIndex) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, LONG, (i) => i !== 0, 1, { height: 1300 }), y);
      expect(onExternalDrop).toHaveBeenCalledTimes(1);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });

    it('does not fire when no measured row is under the drop', () => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, LONG, (i) => i >= 10, 1, { height: 1300 }), 2 * 60 + 10);
      expect(onExternalDrop).not.toHaveBeenCalled();
    });
  });

  // Vertical 3-column grid of 5 cells (100x50, 10pt gaps): row 0 is A B C,
  // row 1 (y 60-110) is D E.
  describe('on a 3-column grid', () => {
    const CELLS = ['A', 'B', 'C', 'D', 'E'];

    it.each([
      ['inside the left half of D', 80, 3],
      ['below the last row under the left half of D', 140, 5],
    ])('fires with toIndex for a drop %s', (_, y, toIndex) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, CELLS, () => true, 3), y, { x: 20 });
      expect(onExternalDrop).toHaveBeenCalledTimes(1);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });
  });

  // Full last row (D E F, y 60-110): empty space below it appends under every
  // column, not only past the last cell's midpoint.
  describe('below a full last row on a 3-column grid', () => {
    const CELLS = ['A', 'B', 'C', 'D', 'E', 'F'];
    it.each([
      ['the first column', 50],
      ['the second column', 160],
      ['the third column', 270],
    ])('appends for a drop under %s', (_, x) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, CELLS, () => true, 3), 140, { x });
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(6);
    });
  });

  // 12 cells in 4 rows (content 0-230) in a 170pt viewport scrolled by 120:
  // container y 0 is content y 120 (row 2, G H I).
  describe('on a scrolled 3-column grid', () => {
    const CELLS = 'ABCDEFGHIJKL'.split('');
    it.each([
      ['the right half of H', 190, 25, 8],
      ['the left half of K', 130, 85, 10],
      ['below the last row', 50, 140, 12],
    ])('fires with toIndex for a drop on %s', (_, x, y, toIndex) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, CELLS, () => true, 3, { scrollY: 120 }), y, { x });
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });
  });

  // Scenario 11: the drop is indexed at the hover centre, not its top-left
  // (half a cell to the left of the finger for a centre grab).
  describe('at the hover centre on a 3-column grid', () => {
    const CELLS = ['A', 'B', 'C', 'D', 'E'];
    it.each([
      ['the right half of B', 190, 25, 2],
      ['the left half of B', 130, 25, 1],
      ['the right half of A near the left edge', 70, 25, 1],
      ['the left half of A at the left edge', 10, 25, 0],
      ['the right half of E', 200, 85, 5],
      ['right of the last cell', 280, 85, 5],
      ['below the last row', 50, 140, 5],
    ])('fires with toIndex for a drop on %s', (_, x, y, toIndex) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, CELLS, () => true, 3), y, { x });
      expect(onExternalDrop).toHaveBeenCalledTimes(1);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });
  });

  // Horizontal row of three 100pt cells with 10pt gaps: A 0-100, B 110-210, C 220-320.
  describe('on a horizontal list', () => {
    it.each([
      ['the left half of B', 140, 1],
      ['the right half of B', 190, 2],
      ['the right half of C', 300, 3],
      ['the left half of A at the left edge', 10, 0],
    ])('fires with toIndex for a drop on %s', (_, x, toIndex) => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, ITEMS, () => true, 1, { horizontal: true }), 25, { x });
      expect(onExternalDrop).toHaveBeenCalledTimes(1);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });
  });

  it("indexes at the finger for collisionAlgorithm 'touch'", () => {
    const CELLS = ['A', 'B', 'C', 'D', 'E'];
    const onExternalDrop = jest.fn();
    const props = renderList(onExternalDrop, CELLS, () => true, 3, {
      collisionAlgorithm: 'touch',
    });
    // Hover centre on the left half of B, finger 40pt right on its right half.
    dropAt(props, 25, { x: 130, fingerShift: { x: 40, y: 0 } });
    expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(2);
  });

  it('does not fire for a drop outside the list bounds', () => {
    const onExternalDrop = jest.fn();
    dropAt(renderList(onExternalDrop), 250);
    expect(onExternalDrop).not.toHaveBeenCalled();
  });

  it('keeps the default snap-back whether or not the callback is set', () => {
    expect(dropAt(renderList(), 100)).toBeUndefined();
    expect(dropAt(renderList(jest.fn()), 100)).toBeUndefined();
  });
});

/** A foreign hover at content y; `receiver` is the row under it (a row id), the list, or none. */
function hoverAt(props: Props, y: number, receiver: string | undefined) {
  props.onMonitorDragOver({
    dragged: {
      id: 'blank',
      parentId: 'bank',
      payload: foreignPayload,
      grabOffset: { x: 0, y: 0 },
      measurements: { x: 0, y: 0, width: 100, height: 50 },
    },
    receiver: receiver === undefined ? undefined : { id: receiver, parentId: receiver === LIST_ID ? undefined : LIST_ID },
    dragTranslation: { x: 500, y: 500 },
    monitorOffset: { x: 50, y },
    monitorOffsetRatio: { x: 0.5, y: 0.5 },
  } as unknown as DraxMonitorEventData);
}
const shifts = () => ({ ...(lastSortable._internal.shiftsRef.value as Record<string, unknown>) });
const down = (y: number) => ({ x: 0, y });

describe('foreign drag gap (0.11 parity, #10)', () => {
  beforeEach(() => {
    mockBoard = undefined;
    // A hover in the edge band starts the auto-scroll interval.
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('opens a gap where the drop would land, moves it, and closes it on exit', () => {
    const props = renderList(jest.fn());
    hoverAt(props, 70, 'B'); // top half of B: gap before B
    expect(shifts()).toEqual({ B: down(60), C: down(60) });
    hoverAt(props, 100, 'B'); // bottom half of B: gap after B
    expect(shifts()).toEqual({ C: down(60) });
    props.onMonitorDragExit({ dragged: { id: 'blank', parentId: 'bank', payload: foreignPayload } } as unknown as DraxMonitorEventData);
    expect(shifts()).toEqual({});
  });

  it('closes the gap on drop, and onExternalDrop gets the gap index', () => {
    const onExternalDrop = jest.fn();
    const props = renderList(onExternalDrop);
    hoverAt(props, 100, 'B');
    dropAt(props, 100);
    expect(shifts()).toEqual({});
    expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(2);
  });

  it('opens no gap without onExternalDrop', () => {
    const props = renderList();
    hoverAt(props, 70, 'B');
    expect(shifts()).toEqual({});
  });

  it('opens no gap unless one of its rows is the receiver (a full list whose rows refuse the drag)', () => {
    const props = renderList(jest.fn());
    hoverAt(props, 70, undefined); // rows not receptive (receptive / dynamicReceptiveCallback)
    expect(shifts()).toEqual({});
    hoverAt(props, 70, LIST_ID); // only the container is under it
    expect(shifts()).toEqual({});
    hoverAt(props, 70, 'B');
    hoverAt(props, 70, undefined); // a row refuses mid-hover: the gap closes
    expect(shifts()).toEqual({});
  });

  it('counts rendered rows only: a hidden (zero-size) row never takes a slot of its own', () => {
    // A 0-50, H hidden (0 high at 60), B 60-110, C 120-170.
    const ys = [{ y: 0, height: 50 }, { y: 60, height: 0 }, { y: 60, height: 50 }, { y: 120, height: 50 }];
    const onExternalDrop = jest.fn();
    const props = renderList(onExternalDrop, ['A', 'H', 'B', 'C'], () => true, 1, { measure: (i) => ys[i]! });
    hoverAt(props, 70, 'B'); // top half of B: the gap opens between A and B
    expect(shifts()).toEqual({ B: down(60), C: down(60) });
    dropAt(props, 70);
    expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(2); // index in data, before B
  });

  it.each([
    ['before A', 10, 'A', ['X', 'A', 'B', 'C']],
    ['before B', 70, 'B', ['A', 'X', 'B', 'C']],
    ['after B', 100, 'B', ['A', 'B', 'X', 'C']],
    ['after C', 160, 'C', ['A', 'B', 'C', 'X']],
  ])('toIndex indexes the data array, hidden rows included: splicing lands %s', (_, y, receiver, visible) => {
    // H0 and H1 are hidden (0 high). A 0-50, B 60-110, C 120-170.
    const data = ['H0', 'A', 'H1', 'B', 'C'];
    const ys = [{ y: 0, height: 0 }, { y: 0, height: 50 }, { y: 60, height: 0 }, { y: 60, height: 50 }, { y: 120, height: 50 }];
    const onExternalDrop = jest.fn();
    const props = renderList(onExternalDrop, data, () => true, 1, { measure: (i) => ys[i]! });
    hoverAt(props, y, receiver);
    dropAt(props, y);
    const { toIndex } = onExternalDrop.mock.calls[0][0];
    const next = [...data];
    next.splice(toIndex, 0, 'X');
    expect(next.filter((k) => !k.startsWith('H'))).toEqual(visible);
  });

  it('opens the gap with unmeasured (unrendered) rows too', () => {
    const LONG = Array.from({ length: 20 }, (_, i) => `R${i}`);
    const props = renderList(jest.fn(), LONG, (i) => i >= 10);
    hoverAt(props, 10 * 60 + 10, 'R10'); // top half of row 10
    const expected = Object.fromEntries(LONG.slice(10).map((k) => [k, down(60)]));
    expect(shifts()).toEqual(expected);
  });

  // Several hidden zero-size rows between A and B: the fast getSlotFromPosition
  // path used to add a row gap after each hidden row and land one visible slot
  // early. Drops in the upper/lower halves of B and C must agree with splice.
  it.each([
    ['top half of B', 70, 'B', 7, ['A', 'X', 'B', 'C']],
    ['bottom half of B', 100, 'B', 8, ['A', 'B', 'X', 'C']],
    ['top half of C', 130, 'C', 8, ['A', 'B', 'X', 'C']],
    ['bottom half of C', 160, 'C', 9, ['A', 'B', 'C', 'X']],
  ])(
    'several hidden rows between A and B: %s → toIndex and gap agree for splice',
    (_, y, receiver, toIndex, visible) => {
      // A 0-50, six hidden at 60, B 60-110, C 120-170 (50pt rows, 10pt gaps).
      const data = ['A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'B', 'C'];
      const ys = [
        { y: 0, height: 50 },
        { y: 60, height: 0 },
        { y: 60, height: 0 },
        { y: 60, height: 0 },
        { y: 60, height: 0 },
        { y: 60, height: 0 },
        { y: 60, height: 0 },
        { y: 60, height: 50 },
        { y: 120, height: 50 },
      ];
      const onExternalDrop = jest.fn();
      const props = renderList(onExternalDrop, data, () => true, 1, { measure: (i) => ys[i]! });
      hoverAt(props, y, receiver);
      // Gap shifts every visible row from the insert point on by 50+10.
      // After the last row (toIndex === data.length) nobody shifts.
      const shiftedFrom =
        toIndex <= 7
          ? { B: down(60), C: down(60) }
          : toIndex === 8
            ? { C: down(60) }
            : {};
      expect(shifts()).toEqual(shiftedFrom);
      dropAt(props, y);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
      const next = [...data];
      next.splice(toIndex, 0, 'X');
      expect(next.filter((k) => !k.startsWith('H'))).toEqual(visible);
    }
  );

  it('uses the gap between successive visible rows when no neighbours are both visible', () => {
    // A then six hidden then B: adjacent-index loop finds no pair; fallback
    // must still pick the 10pt gap so the shift is 60, not 50.
    const data = ['A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'B'];
    const ys = [
      { y: 0, height: 50 },
      { y: 60, height: 0 },
      { y: 60, height: 0 },
      { y: 60, height: 0 },
      { y: 60, height: 0 },
      { y: 60, height: 0 },
      { y: 60, height: 0 },
      { y: 60, height: 50 },
    ];
    const props = renderList(jest.fn(), data, () => true, 1, { measure: (i) => ys[i]! });
    hoverAt(props, 70, 'B'); // top half of B → gap before B
    expect(shifts()).toEqual({ B: down(60) });
  });

  it('opens the gap before the data toIndex item after an unechoed reorder', () => {
    // A was moved 0→2 with no parent echo: visual order B, C, A.
    // Hovering the top half of B (data toIndex 1) must open the gap before
    // visual B, not before visual C.
    const props = renderList(jest.fn());
    lastSortable._internal.committedOrderRef.current = [1, 2, 0];
    lastSortable._internal.committedShiftsRef.current = {
      B: { x: 0, y: -60 },
      C: { x: 0, y: -60 },
      A: { x: 0, y: 120 },
    };
    hoverAt(props, 70, 'B');
    expect(shifts()).toEqual({
      B: down(0), // -60 + 60
      C: down(0),
      A: down(180), // 120 + 60
    });
  });

  it('maps toIndex through order.indexOf after an unechoed reorder (not first order[d] >= toIndex)', () => {
    // C was moved to front with no parent echo: visual order C, A, B ([2,0,1]).
    // Hovering the top half of B yields data toIndex 1; splice(1,0,X) lands
    // before B. The gap must open before visual B (order.indexOf(1) === 2),
    // not before visual C (the buggy first order[d] >= 1 walk).
    const props = renderList(jest.fn());
    lastSortable._internal.committedOrderRef.current = [2, 0, 1];
    lastSortable._internal.committedShiftsRef.current = {
      C: { x: 0, y: -120 },
      A: { x: 0, y: 60 },
      B: { x: 0, y: 60 },
    };
    hoverAt(props, 70, 'B');
    expect(shifts()).toEqual({
      C: down(-120), // unchanged: before the insert slot
      A: down(60), // unchanged
      B: down(120), // 60 + 60: opens the gap before B
    });
  });

  it('defaults autoScrollForeignDrags to true when the prop is omitted', () => {
    renderList(jest.fn());
    expect(lastSortable._internal.autoScrollForeignDrags).toBe(true);
  });
});
