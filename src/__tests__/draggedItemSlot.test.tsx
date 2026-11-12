import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import { useSortableList } from '../hooks/useSortableList';
import type { DraxViewProps, SortableListHandle } from '../types';

// Where the dragged row's placeholder sits (its shift): at the pickup slot
// while the finger is down, in the target slot during the snap.
// Same harness as SortableItem.snapEnd.test.tsx: DraxView is a stub that
// records its props so the test can fire the container's monitor callbacks.
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

// Rows A, B, C are 50 high, stacked from y 0, in a container at (10, 20).
const DATA = ['A', 'B', 'C'];
const ROW = 50;
const CONTAINER = { x: 10, y: 20 };

let sortable: SortableListHandle<string>;
let onReorder: jest.Mock;

const List = () => {
  const handle = useSortableList({
    id: 'list',
    data: DATA,
    keyExtractor: (item) => item,
    onReorder,
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

const mount = () => {
  onReorder = jest.fn();
  act(() => {
    root = create(<List />);
  });
  DATA.forEach((key, index) => {
    sortable._internal.itemMeasurements.current.set(key, {
      x: 0, y: index * ROW, width: 100, height: ROW, key, index, scrollAtMeasure: { x: 0, y: 0 },
    });
  });
  act(() => {
    mockDraxProps.get('container')!.onMeasure!({ ...CONTAINER, width: 100, height: 3 * ROW } as never);
  });
};

const dragEvent = (key: string) => ({
  dragged: {
    parentId: 'list',
    payload: mockDraxProps.get(key)!.payload,
    grabOffset: { x: 0, y: 0 },
  },
  dragTranslation: { x: 0, y: 0 },
});

const pickUp = (key: string) =>
  act(() => {
    mockDraxProps.get('container')!.onMonitorDragStart!(dragEvent(key) as never);
  });

/** Drops over the list but not over a row; returns the hover's snap target. */
const drop = (key: string) => {
  let target: unknown;
  act(() => {
    target = mockDraxProps.get('container')!.onMonitorDragDrop!(dragEvent(key) as never);
  });
  return target;
};

const snapEnd = (key: string) =>
  act(() => {
    mockDraxProps.get(key)!.onSnapEnd!({} as never);
    jest.runAllTimers();
  });

const shiftOf = (key: string) => sortable._internal.shiftsJSRef.current[key];

describe('dragged item placeholder slot', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
    mount();
  });
  afterEach(() => act(() => root.unmount()));

  it('holds still at the pickup slot while neighbours shift', () => {
    pickUp('A');
    act(() => sortable._internal.moveDraggedItem(1));
    expect(shiftOf('B')).toEqual({ x: 0, y: -ROW });
    expect(shiftOf('A')).toBeUndefined();
    act(() => sortable._internal.moveDraggedItem(2));
    expect(shiftOf('C')).toEqual({ x: 0, y: -ROW });
    expect(shiftOf('A')).toBeUndefined();
  });

  it('holds its drag-start shift after an earlier reorder', () => {
    pickUp('A');
    act(() => sortable._internal.moveDraggedItem(2));
    drop('A');
    snapEnd('A');
    // The parent does not echo the data, so A keeps a permanent shift.
    expect(shiftOf('A')).toEqual({ x: 0, y: 2 * ROW });

    pickUp('A');
    act(() => sortable._internal.moveDraggedItem(1));
    expect(shiftOf('C')).toBeUndefined();
    expect(shiftOf('A')).toEqual({ x: 0, y: 2 * ROW });
    act(() => sortable._internal.moveDraggedItem(0));
    expect(shiftOf('B')).toBeUndefined();
    expect(shiftOf('A')).toEqual({ x: 0, y: 2 * ROW });
  });

  it('moves to the target slot during the snap; onReorder fires at release', () => {
    pickUp('A');
    act(() => sortable._internal.moveDraggedItem(2));
    expect(drop('A')).toEqual({ x: CONTAINER.x, y: CONTAINER.y + 2 * ROW });
    expect(shiftOf('A')).toEqual({ x: 0, y: 2 * ROW });
    expect(shiftOf('B')).toEqual({ x: 0, y: -ROW });
    // onReorder fires at release, as 0.11 did, not at snap end.
    expect(onReorder).toHaveBeenCalledTimes(1);

    snapEnd('A');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(shiftOf('A')).toEqual({ x: 0, y: 2 * ROW });
  });

  it('stays at the start slot when the drop reorders nothing', () => {
    pickUp('B');
    expect(drop('B')).toEqual({ x: CONTAINER.x, y: CONTAINER.y + ROW });
    expect(shiftOf('B')).toBeUndefined();
    snapEnd('B');
    expect(onReorder).not.toHaveBeenCalled();
    expect(shiftOf('B')).toBeUndefined();
  });
});
