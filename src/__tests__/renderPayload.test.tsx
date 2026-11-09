import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SortableItem } from '../SortableItem';
import { useCallbackDispatch } from '../hooks/useCallbackDispatch';
import { useSortableList } from '../hooks/useSortableList';
import type {
  DraxRenderContentProps,
  DraxViewProps,
  SortableListHandle,
  ViewRegistryEntry,
} from '../types';

// The hover copy is rendered by useCallbackDispatch's handleDragStart from the
// dragged view's registered props. These tests run the real hook against a
// registry entry holding DraxView props, and for a list row, the props the real
// SortableItem passes to DraxView (captured by a DraxView stub).
const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    if (payload?.item) mockDraxProps.set(payload.item, props);
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
    withDelay: <T,>(_delay: number, value: T) => value,
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
jest.mock('../hooks/useDraxContext', () => ({
  useDraxContext: () => ({
    hoverReadySV: sv(false),
    dragPhaseSV: sv('idle'),
    draggedIdSV: sv(''),
    hoverPositionSV: sv({ x: 0, y: 0 }),
    hoverClearDeferredRef: { current: false },
    setHoverContent: jest.fn(),
  }),
}));

const DATA = ['A', 'B', 'C'];

/** Runs handleDragStart for a view registered with `props`; returns the hover render props. */
const renderHoverFor = (props: DraxViewProps): DraxRenderContentProps => {
  const renderHoverContent = jest.fn(() => null);
  const entry: ViewRegistryEntry = {
    id: 'dragged',
    spatialIndex: 0,
    measurements: { x: 0, y: 0, width: 10, height: 10, _transformDetected: 0 },
    props: { ...props, renderHoverContent },
  };
  let dispatch!: ReturnType<typeof useCallbackDispatch>;
  const Host = () => {
    dispatch = useCallbackDispatch({
      getViewEntry: (id: string) => (id === entry.id ? entry : undefined),
      spatialIndexSV: sv([]),
      scrollOffsetsSV: sv([]),
      draggedIdSV: sv(''),
      receiverIdSV: sv(''),
      rejectedReceiverIdSV: sv(''),
      dragPhaseSV: sv('idle'),
      hoverPositionSV: sv({ x: 0, y: 0 }),
      grabOffsetSV: sv({ x: 0, y: 0 }),
      startPositionSV: sv({ x: 0, y: 0 }),
      setHoverContent: jest.fn(),
      hoverReadySV: sv(false),
      hoverClearDeferredRef: { current: false },
      hoverStylesRef: { current: null },
      droppedItemsRef: { current: new Map() },
    } as never);
    return null;
  };
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<Host />);
  });
  dispatch.handleDragStart('dragged', { x: 5, y: 5 }, { x: 5, y: 5 });
  act(() => root.unmount());
  expect(renderHoverContent).toHaveBeenCalledTimes(1);
  return (renderHoverContent.mock.calls[0] as unknown as [DraxRenderContentProps])[0];
};

describe('render content payload', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('passes a DraxView payload to renderHoverContent', () => {
    const payload = { color: 'red' };
    const props = renderHoverFor({ payload });
    expect(props.hover).toBe(true);
    expect(props.payload).toBe(payload);
  });

  it('prefers dragPayload, like dragged.payload in drag events', () => {
    const dragPayload = { drag: true };
    expect(renderHoverFor({ payload: 'other', dragPayload }).payload).toBe(dragPayload);
  });

  it('passes item and index of a sortable row to its hover render', () => {
    let sortable!: SortableListHandle<string>;
    const List = () => {
      sortable = useSortableList({
        id: 'list',
        data: DATA,
        keyExtractor: (item) => item,
        onReorder: jest.fn(),
      });
      return sortable.data.map((item, index) => (
        <SortableItem key={item} sortable={sortable} index={index} payload={{ extra: 1 }}>
          {null}
        </SortableItem>
      ));
    };
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(<List />);
    });
    const rowProps = mockDraxProps.get('B')!;
    act(() => root.unmount());

    expect(renderHoverFor(rowProps).payload).toEqual({
      extra: 1,
      item: 'B',
      index: 1,
      originalIndex: 1,
    });
  });
});
