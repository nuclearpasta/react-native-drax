import type { ReactElement } from 'react';
import { SortableContainer } from '../SortableContainer';
import { useSortableList } from '../hooks/useSortableList';
import type {
  DraxMonitorDragDropEventData,
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
};

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
  }: { horizontal?: boolean; collisionAlgorithm?: string; height?: number } = {}
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
      } as SortableItemMeasurement);
    });
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
