import type { ReactElement, ReactNode } from 'react';

import { useSortableList } from '../hooks/useSortableList';
import type { SortableItemProps } from '../SortableItem';
import { SortableItem } from '../SortableItem';
import type { DraxViewMeasurements, SortableListHandle } from '../types';

// #249: SortableItem's onMeasure read shiftsRef.value / scrollPosition.value
// on the JS thread. In Reanimated 4 a JS `.value =` write (and runOnUI) is
// applied on the UI thread asynchronously, so a JS read right after a JS write
// returns the previous value. The shared-value mock below models that: JS
// writes and runOnUI calls are queued until flushUI() runs them "on the UI
// thread", and JS reads return the last value applied there.

const mockUiQueue: (() => void)[] = [];
const mockState = { onUI: false, jsReads: 0 };
const flushUI = () => {
  mockState.onUI = true;
  while (mockUiQueue.length > 0) mockUiQueue.shift()!();
  mockState.onUI = false;
};

jest.mock('react-native-reanimated', () => {
  const sv = <T>(initial: T) => {
    let applied = initial;
    return {
      get value() {
        if (!mockState.onUI) mockState.jsReads++;
        return applied;
      },
      set value(next: T) {
        if (mockState.onUI) applied = next;
        else mockUiQueue.push(() => { applied = next; });
      },
    };
  };
  return {
    __esModule: true,
    default: { View: 'Reanimated.View' },
    Easing: { out: () => undefined, cubic: undefined },
    useSharedValue: sv,
    useDerivedValue: () => sv(false),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUI: (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
    mockUiQueue.push(() => fn(...args));
  },
  runOnJS: (fn: unknown) => fn,
}));
// Both hooks are called as plain functions: hooks become trivial stand-ins.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useRef: (current: unknown) => ({ current }),
  useState: (init: unknown) => [typeof init === 'function' ? init() : init, () => {}],
  useLayoutEffect: () => {},
  useEffect: () => {},
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
}));
jest.mock('../DraxView', () => ({ DraxView: 'DraxView' }));
jest.mock('../hooks/useDraxContext', () => ({
  useDraxContext: () => ({ hoverReadySV: { value: false }, draggedIdSV: { value: '' } }),
}));

type MeasureHandler = (m: DraxViewMeasurements | undefined) => void;

/** Render SortableItem as a function and return its DraxView's onMeasure. */
const getOnMeasure = (sortable: SortableListHandle<string>, index: number): MeasureHandler => {
  const render = (SortableItem as unknown as { type: (p: SortableItemProps) => ReactElement }).type;
  const find = (node: ReactNode): MeasureHandler | undefined => {
    if (!node || typeof node !== 'object' || !('props' in node)) return undefined;
    const el = node as ReactElement<{ onMeasure?: MeasureHandler; children?: ReactNode }>;
    if (el.type === 'DraxView') return el.props.onMeasure;
    return find(el.props.children);
  };
  const onMeasure = find(render({ sortable, index, children: null }));
  if (!onMeasure) throw new Error('DraxView not found');
  return onMeasure;
};

// _transformDetected: native measure() included the item's shift transform.
const measured = { x: 0, y: 100, width: 50, height: 40, _transformDetected: 1 };

describe('SortableItem onMeasure reads JS-side state synchronously (#249)', () => {
  let sortable: SortableListHandle<string>;

  beforeEach(() => {
    mockUiQueue.length = 0;
    sortable = useSortableList({ data: ['A', 'B'], keyExtractor: (s) => s, onReorder: () => {} });
    // A previous drag left a permanent shift on A, already applied on the UI thread.
    sortable._internal.committedShiftsRef.current = { A: { x: 0, y: 50 } };
    sortable._internal.cancelDrag();
    flushUI();
    mockState.jsReads = 0;
  });

  it('subtracts the shift JS just wrote, not the stale UI value', () => {
    // Shifts revert to identity; the UI thread has not applied it yet.
    sortable._internal.committedShiftsRef.current = {};
    sortable._internal.cancelDrag();

    getOnMeasure(sortable, 0)(measured);

    expect(sortable._internal.itemMeasurements.current.get('A')?.y).toBe(100);
    expect(mockState.jsReads).toBe(0);
  });

  it('records the scroll offset from the latest scroll event', () => {
    sortable.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 200 } } } as never);

    getOnMeasure(sortable, 0)(measured);

    const entry = sortable._internal.itemMeasurements.current.get('A');
    expect(entry?.y).toBe(50);
    expect(entry?.scrollAtMeasure).toEqual({ x: 0, y: 200 });
    expect(mockState.jsReads).toBe(0);
  });

  it('computes the phantom snap target from the latest scroll event', () => {
    const internal = sortable._internal;
    internal.containerMeasurementsRef.current = { ...measured, x: 10, y: 20, height: 300 };
    internal.phantomRef.current = { atDisplayIndex: 0, width: 50, height: 40 };
    internal.pendingOrderRef.current = [];

    // Scrolled by 200; the UI thread has not applied it yet.
    sortable.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 200 } } } as never);

    expect(internal.getPhantomSnapTarget()).toEqual({ x: 10, y: 20 - 200 });
    expect(mockState.jsReads).toBe(0);
  });
});
