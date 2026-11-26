import { useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SortableContainer } from '../SortableContainer';
import { SortableItem } from '../SortableItem';
import { useSortableList } from '../hooks/useSortableList';
import type { DraxViewProps, SortableListHandle } from '../types';

// Renders the real useSortableList + SortableContainer + SortableItem with
// react-test-renderer. DraxView is replaced by a stub that records its
// props, so the test can fire the container's drag-start monitor callback and
// the item's onSnapEnd (which DraxView calls when the snap animation ends).
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

const DATA = ['A', 'B', 'C'];
const Leaf = () => null;

let rerenderOwner: () => void;
const rerenderCell: (() => void)[] = [];
/** Handle from the last committed List render. */
let sortable: SortableListHandle<string>;

/** Re-renders its item on its own, like a FlatList cell after layout. */
const Cell = ({ sortable: handle, index }: { sortable: SortableListHandle<string>; index: number }) => {
  const [, setTick] = useState(0);
  rerenderCell[index] = () => setTick((t) => t + 1);
  return (
    <SortableItem sortable={handle} index={index}>
      <Leaf />
    </SortableItem>
  );
};

const List = ({
  onReorder,
  withContainer = true,
}: {
  onReorder: jest.Mock;
  withContainer?: boolean;
}) => {
  const [, setTick] = useState(0);
  rerenderOwner = () => setTick((t) => t + 1);
  const handle = useSortableList({
    id: 'list',
    data: DATA,
    keyExtractor: (item) => item,
    onReorder,
  });
  useLayoutEffect(() => {
    sortable = handle;
  });
  if (!withContainer) return null;
  return (
    <SortableContainer sortable={handle} scrollRef={{ current: null }}>
      {handle.data.map((item, index) => (
        <Cell key={item} sortable={handle} index={index} />
      ))}
    </SortableContainer>
  );
};

const dragAToEndAndDrop = (ownerRerendersMidDrag: boolean) => {
  const onReorder = jest.fn();
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<List onReorder={onReorder} />);
  });
  act(() => rerenderCell.forEach((rerender) => rerender()));

  act(() => {
    mockDraxProps.get('container')!.onMonitorDragStart!({
      dragged: { parentId: 'list', payload: mockDraxProps.get('A')!.payload },
    } as never);
    sortable._internal.moveDraggedItem(2);
  });
  if (ownerRerendersMidDrag) act(() => rerenderOwner());

  act(() => {
    mockDraxProps.get('A')!.onSnapEnd!({} as never);
    jest.runAllTimers();
  });
  act(() => root.unmount());
  return onReorder;
};

describe('SortableItem onSnapEnd', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    mockDraxProps.clear();
  });

  it('commits the reorder on drop', () => {
    const onReorder = dragAToEndAndDrop(false);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toMatchObject({ fromIndex: 0, toIndex: 2, data: ['B', 'C', 'A'] });
  });

  it('commits the reorder when the list owner re-renders mid-drag (#236, #296)', () => {
    const onReorder = dragAToEndAndDrop(true);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toMatchObject({ fromIndex: 0, toIndex: 2, data: ['B', 'C', 'A'] });
  });

  it('clears its finalizeDrag registration when the container unmounts', () => {
    const onReorder = jest.fn();
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<List onReorder={onReorder} />);
    });
    expect(sortable._internal.onItemSnapEndRef.current).toBeInstanceOf(Function);

    // The list owner stays mounted; only the container goes away.
    act(() => root.update(<List onReorder={onReorder} withContainer={false} />));
    expect(sortable._internal.onItemSnapEndRef.current).toBeUndefined();
    act(() => root.unmount());
  });
});
