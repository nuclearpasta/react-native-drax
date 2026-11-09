/**
 * #267: after `draggable` flips false -> true, the very next touch must see an
 * enabled pan handler. RNGH reads the gesture config in the render where the
 * prop changed (its effect sends that config to the native handler), so the
 * config built in that render must already carry the new values.
 *
 * Asserted at the RNGH boundary: what `usePanGesture` (v3) or the
 * `Gesture.Pan()` builder (v2) receives in each render. The native handler
 * timing itself needs a device.
 */
import { createElement } from 'react';
import type { ReactNode } from 'react';

type Snapshot = { enabled: unknown; longPressDelay: unknown };
const mockRenders: Snapshot[] = [];
let mockIsV3 = true;

/** Value as seen during render: a SharedValue is read, a plain value kept. */
const mockRead = (v: unknown) =>
  v !== null && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;

jest.mock('react-native-gesture-handler', () => {
  const GestureDetector = ({ children }: { children: ReactNode }) => children;
  if (mockIsV3) {
    return {
      GestureDetector,
      usePanGesture: (c: Record<string, unknown>) => {
        mockRenders.push({
          enabled: mockRead(c.enabled),
          longPressDelay: mockRead(c.activateAfterLongPress),
        });
        return {};
      },
    };
  }
  const builder = () => {
    const snap: Snapshot = { enabled: undefined, longPressDelay: undefined };
    mockRenders.push(snap);
    const g: Record<string, (v: unknown) => unknown> = {};
    for (const m of ['maxPointers', 'shouldCancelWhenOutside', 'failOffsetX', 'failOffsetY',
      'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      g[m] = () => g;
    }
    g.enabled = (v) => {
      snap.enabled = v;
      return g;
    };
    g.activateAfterLongPress = (v) => {
      snap.longPressDelay = v;
      return g;
    };
    return g;
  };
  return { GestureDetector, Gesture: { Pan: builder } };
});

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { View: 'View' },
    useSharedValue: <V,>(init: V) => useRef({ value: init }).current,
    useAnimatedReaction: () => {},
    measure: () => null,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockCtx = {
  registerView: () => {},
  unregisterView: () => {},
  updateMeasurements: () => {},
  updateViewProps: () => {},
  getViewEntry: () => undefined,
  rootViewRef: { current: null },
  scrollOffsetsSV: { value: [] },
  parent: undefined,
};
jest.mock('../hooks', () => ({
  useDraxContext: () => mockCtx,
  useDraxId: (id?: string) => id ?? 'view',
}));
jest.mock('../hooks/useDraxContext', () => ({ useDraxContext: () => mockCtx }));
jest.mock('../hooks/useViewStyles', () => ({
  useViewStyles: () => ({ animatedDragStyle: {} }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Load DraxView against the v3 or v2 RNGH mock (the path is picked at module load). */
const load = (v3: boolean) => {
  mockIsV3 = v3;
  mockRenders.length = 0;
  let mods!: {
    renderer: typeof import('react-test-renderer');
    DraxView: typeof import('../DraxView').DraxView;
  };
  jest.isolateModules(() => {
    mods = {
      renderer: require('react-test-renderer'),
      DraxView: require('../DraxView').DraxView,
    };
  });
  const { act, create } = mods.renderer;
  const el = (draggable: boolean, longPressDelay: number) =>
    createElement(mods.DraxView, { id: 'v', draggable, longPressDelay });
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(el(false, 250));
  });
  return (draggable: boolean, longPressDelay: number) =>
    act(() => {
      root.update(el(draggable, longPressDelay));
    });
};

describe.each([
  ['v3', true],
  ['v2', false],
])('DraxView pan config on the RNGH %s path (#267)', (_name, v3) => {
  it('carries the new draggable/longPressDelay in the render where they change', () => {
    const rerender = load(v3);
    expect(mockRenders.at(-1)).toEqual({ enabled: false, longPressDelay: 250 });

    rerender(true, 250);
    expect(mockRenders.at(-1)).toEqual({ enabled: true, longPressDelay: 250 });

    rerender(true, 500);
    expect(mockRenders.at(-1)).toEqual({ enabled: true, longPressDelay: 500 });

    rerender(false, 500);
    expect(mockRenders.at(-1)).toEqual({ enabled: false, longPressDelay: 500 });
  });
});
