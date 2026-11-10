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

const List = ({
  draggedItemStyle,
  inactiveItemStyle,
}: {
  draggedItemStyle?: StyleProp<ViewStyle>;
  inactiveItemStyle?: ViewStyle;
}) => {
  const sortable = useSortableList({
    data: DATA,
    keyExtractor,
    onReorder,
    draggedItemStyle,
    inactiveItemStyle,
  });
  return (
    <SortableItem sortable={sortable} index={0}>
      {null}
    </SortableItem>
  );
};

type DragState = 'dragged' | 'inactive' | 'idle';

/**
 * Renders the list and runs the item's style worklet once per state. Returns
 * each style and the native view's props: Reanimated only sends the keys of
 * each new style, so the native view is the merge of every applied style.
 */
const runStyles = (states: DragState[], props: Parameters<typeof List>[0] = {}) => {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<List {...props} />);
  });
  const worklet = mockWorklets.get(mockViewStyle!)!;
  const native: Record<string, unknown> = {};
  const styles = states.map((state) => {
    mockCtx.hoverReadySV.value = state === 'dragged';
    mockCtx.draggedIdSV.value =
      state === 'dragged' ? 'item-view' : state === 'inactive' ? 'other-view' : '';
    const style = worklet();
    Object.assign(native, style);
    return style;
  });
  act(() => root.unmount());
  return { styles, native };
};

const itemStyle = (dragged: boolean, draggedItemStyle?: StyleProp<ViewStyle>) =>
  runStyles([dragged ? 'dragged' : 'idle'], { draggedItemStyle }).styles[0]!;

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

  it('resets every custom key when the drag ends', () => {
    expect(itemStyle(false, { opacity: 0.2, backgroundColor: 'red' })).toMatchObject({
      opacity: 1,
      backgroundColor: 'transparent',
    });
  });

  it('clears custom keys on the native view after the drag (#344)', () => {
    const { native } = runStyles(['dragged', 'idle'], {
      draggedItemStyle: { opacity: 0.3, borderWidth: 2, borderColor: 'red' },
    });
    expect(native).toMatchObject({ opacity: 1, borderWidth: 0, borderColor: 'transparent' });
  });

  it('clears inactiveItemStyle keys on the native view after the drag', () => {
    const { native } = runStyles(['inactive', 'idle'], {
      inactiveItemStyle: { opacity: 0.5, borderWidth: 1 },
    });
    expect(native).toMatchObject({ opacity: 1, borderWidth: 0 });
  });

  it('appends user transforms after the shift translate', () => {
    const { styles } = runStyles(['dragged', 'idle'], {
      draggedItemStyle: { transform: [{ scale: 0.9 }] },
    });
    expect(styles[0]!.transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { scale: 0.9 }]);
    expect(styles[1]!.transform).toEqual([{ translateX: 0 }, { translateY: 0 }]);
  });
});
