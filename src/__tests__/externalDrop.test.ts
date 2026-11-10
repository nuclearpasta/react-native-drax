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
  measure = (index: number) => ({ y: index * 60, height: 50 })
) {
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
    });
    items.forEach((key, index) => {
      if (!isMeasured(index)) return;
      sortable._internal.itemMeasurements.current.set(key, {
        key,
        index,
        x: 0,
        width: 100,
        ...measure(index),
      } as SortableItemMeasurement);
    });
    lastSortable = sortable as SortableListHandle<unknown>;
    const element = SortableContainer({
      sortable: sortable as SortableListHandle<unknown>,
      scrollRef: { current: null },
      children: null,
    }) as ReactElement<Props>;
    props = element.props;
    const effects = mockEffects;
    mockEffects = [];
    effects.forEach((fn) => fn());
    if (!mockDirty) break;
  }
  return props;
}

const foreignPayload = { blankId: 7 };

function dropAt(
  props: Props,
  y: number,
  overrides: { parentId?: string; payload?: unknown; ratioY?: number } = {}
) {
  const dragged = {
    id: 'blank',
    parentId: 'parentId' in overrides ? overrides.parentId : 'bank',
    payload: 'payload' in overrides ? overrides.payload : foreignPayload,
    grabOffset: { x: 0, y: 0 },
    measurements: { x: 0, y: 0, width: 100, height: 50 },
  };
  return props.onMonitorDragDrop({
    dragged,
    receiver: { id: LIST_ID, payload: undefined },
    dragTranslation: { x: 500, y: 500 },
    monitorOffset: { x: 50, y },
    monitorOffsetRatio: { x: 0.5, y: overrides.ratioY ?? y / 170 },
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
      dropAt(renderList(onExternalDrop, LONG, (i) => i !== 0), y, { ratioY: 0.5 });
      expect(onExternalDrop).toHaveBeenCalledTimes(1);
      expect(onExternalDrop.mock.calls[0][0].toIndex).toBe(toIndex);
    });

    it('does not fire when no measured row is under the drop', () => {
      const onExternalDrop = jest.fn();
      dropAt(renderList(onExternalDrop, LONG, (i) => i >= 10), 2 * 60 + 10, { ratioY: 0.5 });
      expect(onExternalDrop).not.toHaveBeenCalled();
    });
  });

  it('does not fire for a drop outside the list bounds', () => {
    const onExternalDrop = jest.fn();
    dropAt(renderList(onExternalDrop), 250, { ratioY: 1.2 });
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
    const props = renderList(onExternalDrop, ['A', 'H', 'B', 'C'], () => true, (i) => ys[i]!);
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
    const props = renderList(onExternalDrop, data, () => true, (i) => ys[i]!);
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
      const props = renderList(onExternalDrop, data, () => true, (i) => ys[i]!);
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
    const props = renderList(jest.fn(), data, () => true, (i) => ys[i]!);
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
