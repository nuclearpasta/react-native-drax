import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { act, create } from 'react-test-renderer';

import { SortableItem } from '../SortableItem';
import { useSortableList } from '../hooks/useSortableList';

// useAnimatedStyle returns a marker object and keeps its worklet, so the test
// can run the worklet of the style passed to SortableItem's Reanimated.View.
const mockWorklets = new Map<object, () => ViewStyle>();
let mockViewStyle: object | undefined;
// The stub registers with a fixed id, like DraxView does on mount.
jest.mock('../DraxView', () => ({
  DraxView: ({
    children,
    registration,
  }: {
    children?: ReactNode;
    registration?: (reg: { id: string; measure: () => void }) => void;
  }) => {
    registration?.({ id: 'item-view', measure: () => {} });
    return children ?? null;
  },
}));
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: { children?: ReactNode; style: object }) => {
        mockViewStyle = style;
        return children ?? null;
      },
    },
    useSharedValue: <T,>(value: T) => useStateMock(() => ({ value }))[0],
    useDerivedValue: () => ({ value: false }),
    useAnimatedStyle: (worklet: () => ViewStyle) => {
      const marker = {};
      mockWorklets.set(marker, worklet);
      return marker;
    },
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

const DATA = ['A'];
const keyExtractor = (item: string) => item;
const onReorder = () => {};

const List = ({ draggedItemStyle }: { draggedItemStyle?: StyleProp<ViewStyle> }) => {
  const sortable = useSortableList({
    data: DATA,
    keyExtractor,
    onReorder,
    draggedItemStyle,
  });
  return (
    <SortableItem sortable={sortable} index={0}>
      {null}
    </SortableItem>
  );
};

/** Renders the list and runs the item's style worklet with the item dragged or not. */
const itemStyle = (dragged: boolean, draggedItemStyle?: StyleProp<ViewStyle>) => {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<List draggedItemStyle={draggedItemStyle} />);
  });
  const worklet = mockWorklets.get(mockViewStyle!)!;
  mockCtx.hoverReadySV.value = dragged;
  mockCtx.draggedIdSV.value = dragged ? 'item-view' : '';
  const style = worklet();
  act(() => root.unmount());
  return style;
};

describe('draggedItemStyle', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('hides the dragged placeholder by default', () => {
    expect(itemStyle(true)).toMatchObject({ opacity: 0 });
  });

  it('applies a custom draggedItemStyle while dragged', () => {
    expect(itemStyle(true, [{ opacity: 0.2 }, { backgroundColor: 'red' }])).toMatchObject({
      opacity: 0.2,
      backgroundColor: 'red',
    });
  });

  it('restores opacity 1 when the drag ends', () => {
    const style = itemStyle(false, { opacity: 0.2, backgroundColor: 'red' });
    expect(style.opacity).toBe(1);
    expect(style.backgroundColor).toBeUndefined();
  });
});
