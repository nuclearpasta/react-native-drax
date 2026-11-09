import type { ReactElement } from 'react';
import { SortableContainer } from '../SortableContainer';
import { useSortableList } from '../hooks/useSortableList';
import type {
  DraxMonitorDragDropEventData,
  DraxProtocolDragEndResponse,
  SortableListHandle,
  SortableItemMeasurement,
} from '../types';

// No React renderer is installed, so the hook and the container run as plain
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
};

const LIST_ID = 'list';
const ITEMS = ['A', 'B', 'C'];

// Three 50pt rows with 10pt gaps: A 0-50, B 60-110, C 120-170.
function renderList(onExternalDrop?: jest.Mock) {
  mockSlots = [];
  let props = {} as Props;
  for (let pass = 0; pass < 10; pass++) {
    mockCursor = 0;
    mockDirty = false;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- runs on the mock hook store
    const sortable = useSortableList({
      id: LIST_ID,
      data: ITEMS,
      keyExtractor: (item: string) => item,
      onReorder: () => {},
      onExternalDrop,
    });
    ITEMS.forEach((key, index) => {
      sortable._internal.itemMeasurements.current.set(key, {
        key,
        index,
        x: 0,
        y: index * 60,
        width: 100,
        height: 50,
      } as SortableItemMeasurement);
    });
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
