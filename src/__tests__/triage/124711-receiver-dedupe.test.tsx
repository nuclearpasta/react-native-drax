// Triage edm 124711: UI stalls (>1 s, 2-5 s freezes) during repeated drags.
//
// useDragGesture's onUpdate worklet calls runOnJS(handleReceiverChange) on
// EVERY pan update, even when the receiver and the monitor set did not change
// and nothing continuous is registered. This file measures, per gesture
// update, the JS work that reaches the JS thread (jest, explicit UI/JS FIFO
// queues, real useDragGesture + useCallbackDispatch [+ real sortable list for
// the monitor case]), and holds a regression test for the dedupe fix.
//
// Counted on the JS side (inside drained runOnJS work only):
// - runOnJS hops (by target function), handleReceiverChange calls
// - SharedValue `.value` reads per SV (on native: a synchronizable read; a
//   dirty SV such as hoverPositionSV costs a blocking runOnUISync round trip)
// - entries copied by spatialIndexSV / scrollOffsetsSV reads
// - user callbacks, React commits (Profiler) and setHoverContent calls.
import { act, Profiler } from 'react';
import type { ReactNode } from 'react';

import type { DraxPanGestureConfig } from '../../compat';
import { useCallbackDispatch } from '../../hooks/useCallbackDispatch';
// useDragGesture calls no React hooks, so it runs as a plain function here.
import { useDragGesture as createDragGesture } from '../../hooks/useDragGesture';
import { useSortableList } from '../../hooks/useSortableList';
import { SortableContainer } from '../../SortableContainer';
import type { DraxViewProps, SpatialEntry } from '../../types';
import { SortableItem } from '../../SortableItem';

const mockDraxProps = new Map<string, DraxViewProps>();
jest.mock('../../DraxView', () => ({
  DraxView: (props: DraxViewProps & { children?: ReactNode }) => {
    const payload = props.payload as { item?: string } | undefined;
    mockDraxProps.set(props.monitoring ? props.id ?? 'board' : payload?.item ?? '', props);
    return props.children ?? null;
  },
}));

interface MockSnap { to: unknown; cb?: (finished: boolean) => void }
const isMockSnap = (v: unknown): v is MockSnap =>
  typeof v === 'object' && v !== null && 'mockSnap' in v;
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: ({ children }: { children?: ReactNode }) => children ?? null },
    useSharedValue: <T,>(value: T) => useStateMock(() => ({ value }))[0],
    useDerivedValue: () => ({ value: false }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    measure: () => null,
    withDelay: (_delay: number, animation: unknown) => animation,
    withTiming: (to: unknown, _config: unknown, cb?: (finished: boolean) => void) => ({
      mockSnap: true,
      to,
      cb,
    }),
    withSpring: <T,>(value: T) => value,
    Easing: { linear: undefined },
  };
});

const mockUIQueue: (() => void)[] = [];
const mockJSQueue: (() => void)[] = [];
const mockHops: Record<string, number> = {};
jest.mock('react-native-worklets', () => ({
  runOnUI:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      mockUIQueue.push(() => fn(...args));
    },
  runOnJS:
    <A extends unknown[]>(fn: ((...args: A) => void) & { mockName?: string }) =>
    (...args: A) => {
      const name = fn.mockName ?? (fn.name || 'anonymous');
      mockHops[name] = (mockHops[name] ?? 0) + 1;
      mockJSQueue.push(() => fn(...args));
    },
}));
const mockGestures = new Map<string, DraxPanGestureConfig>();
let mockGestureId = '';
jest.mock('../../compat', () => ({
  useDraxPanGesture: (config: DraxPanGestureConfig) => {
    mockGestures.set(mockGestureId, config);
    return {};
  },
}));

/** hoverPositionSV: assigning a withTiming() starts a snap; any other write
 *  cancels it (callback(false)), like Reanimated. */
const makeHoverPositionSV = () => {
  let current: unknown = { x: 0, y: 0 };
  let snap: MockSnap | undefined;
  return {
    get value() {
      return current;
    },
    set value(next: unknown) {
      const running = snap;
      snap = undefined;
      running?.cb?.(false);
      if (isMockSnap(next)) snap = next;
      else current = next;
    },
    /** UI thread: the snap animation reaches its target. */
    finishSnap() {
      const running = snap!;
      snap = undefined;
      current = running.to;
      running.cb?.(true);
    },
    get snapping() {
      return snap !== undefined;
    },
  };
};

const sv = <T,>(value: T) => ({ value });
const ROW = 50;
const KEYS = ['A', 'B', 'C', 'D', 'E'];
/** A monitor (list/column/board) or a row, at x/y inside its parent. */
const spatialEntry = (
  id: string,
  parentIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  monitor = false
): SpatialEntry => ({
  id,
  x,
  y,
  width,
  height,
  parentIndex,
  receptive: !monitor,
  monitoring: monitor,
  draggable: !monitor,
} as SpatialEntry);
// Index 0 is the list (monitor); item rows follow.
const listSpatialIndex = () => [
  spatialEntry('list', -1, 0, 0, 100, ROW * KEYS.length, true),
  ...KEYS.map((k, i) => spatialEntry(k, 0, 0, i * ROW, 100, ROW)),
];
const mockCtx = {
  hoverReadySV: sv(false),
  dragPhaseSV: sv<string>('idle'),
  draggedIdSV: sv(''),
  receiverIdSV: sv(''),
  rejectedReceiverIdSV: sv(''),
  hoverPositionSV: makeHoverPositionSV(),
  dragAbsolutePositionSV: sv({ x: 0, y: 0 }),
  hoverDimsSV: sv({ x: 0, y: 0 }),
  spatialIndexSV: sv(listSpatialIndex()),
  scrollOffsetsSV: sv([] as { x: number; y: number }[]),
  grabOffsetSV: sv({ x: 0, y: 0 }),
  startPositionSV: sv({ x: 0, y: 0 }),
  rootOffsetSV: sv({ x: 0, y: 0 }),
  rootViewRef: { current: null },
  needsUpdatesSV: sv(true),
  jsPendingSV: sv(false),
  lastMonitorKeySV: sv(''),
  hoverClearDeferredRef: { current: false },
  hoverContent: null as ReactNode,
  setHoverContent: (content: ReactNode) => {
    mockCtx.hoverContent = content;
    // HoverLayer's layout effect after the hover content commits.
    if (content != null) {
      mockUIQueue.push(() => {
        mockCtx.dragPhaseSV.value = 'dragging';
        mockCtx.hoverReadySV.value = true;
      });
    }
  },
  handleDragStart: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragStart'],
  handleReceiverChange: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleReceiverChange'],
  handleDragEnd: (() => {}) as ReturnType<typeof useCallbackDispatch>['handleDragEnd'],
};
jest.mock('../../hooks/useDraxContext', () => ({
  useDraxContext: () => mockCtx,
  useDraxInternalContext: () => mockCtx,
}));

// ── Counting: JS-side SharedValue reads ─────────────────────────────────
let mockOnJS = false;
const svReads: Record<string, number> = {};
const entriesCopied: Record<string, number> = {};
const countReads = (o: { value: unknown }, name: string) => {
  const d = Object.getOwnPropertyDescriptor(o, 'value')!;
  let plain = d.value;
  Object.defineProperty(o, 'value', {
    configurable: true,
    get() {
      const v = d.get ? d.get.call(o) : plain;
      if (mockOnJS) {
        svReads[name] = (svReads[name] ?? 0) + 1;
        if (Array.isArray(v)) entriesCopied[name] = (entriesCopied[name] ?? 0) + v.length;
      }
      return v;
    },
    set(next: unknown) {
      if (d.set) d.set.call(o, next);
      else plain = next;
    },
  });
};
const SV_NAMES = [
  'hoverReadySV', 'dragPhaseSV', 'draggedIdSV', 'receiverIdSV', 'rejectedReceiverIdSV',
  'hoverPositionSV', 'dragAbsolutePositionSV', 'spatialIndexSV', 'scrollOffsetsSV',
  'grabOffsetSV', 'startPositionSV', 'rootOffsetSV',
] as const;
const instrumentCtx = () => {
  for (const n of SV_NAMES) countReads((mockCtx as unknown as Record<string, { value: unknown }>)[n]!, n);
};

// The real DraxProvider getViewEntry reads a JS registry, not a SharedValue.
let mockEntries: SpatialEntry[] = [];
let handleReceiverChangeCalls = 0;
let setHoverContentCalls = 0;
const Dispatcher = () => {
  const dispatch = useCallbackDispatch({
    ...mockCtx,
    hoverPositionSV: mockCtx.hoverPositionSV as never,
    dragPhaseSV: mockCtx.dragPhaseSV as never,
    setHoverContent: (c: ReactNode) => {
      setHoverContentCalls++;
      mockCtx.setHoverContent(c);
    },
    getViewEntry: (id: string) => {
      const props = mockDraxProps.get(id);
      if (!props) return undefined;
      const index = mockEntries.findIndex((e) => e.id === id);
      const e = mockEntries[index]!;
      return {
        id,
        parentId: mockEntries[e.parentIndex]?.id,
        spatialIndex: index,
        measurements: { x: e.x, y: e.y, width: e.width, height: e.height },
        props,
      };
    },
    spatialIndexSV: mockCtx.spatialIndexSV as never,
    scrollOffsetsSV: mockCtx.scrollOffsetsSV as never,
    hoverStylesRef: { current: null },
    droppedItemsRef: { current: new Map() },
  } as never);
  const counted = Object.assign(
    (...args: Parameters<typeof dispatch.handleReceiverChange>) => {
      handleReceiverChangeCalls++;
      dispatch.handleReceiverChange(...args);
    },
    { mockName: 'handleReceiverChange' }
  );
  Object.assign(mockCtx, {
    handleDragStart: Object.assign(dispatch.handleDragStart, { mockName: 'handleDragStart' }),
    handleDragEnd: Object.assign(dispatch.handleDragEnd, { mockName: 'handleDragEnd' }),
    handleReceiverChange: counted,
  });
  return null;
};

const ReactNative = jest.requireActual(
  'react-native/Libraries/Renderer/implementations/ReactNativeRenderer-dev'
);
let commits = 0;
const drainJS = () =>
  act(() => {
    mockOnJS = true;
    try {
      while (mockJSQueue.length) mockJSQueue.shift()!();
    } finally {
      mockOnJS = false;
    }
  });
const drainUI = () => {
  while (mockUIQueue.length) mockUIQueue.shift()!();
};
const settle = () => {
  for (let guard = 0; guard < 200; guard++) {
    if (mockUIQueue.length) drainUI();
    else if (mockJSQueue.length) drainJS();
    else if (jest.getTimerCount()) act(() => jest.runOnlyPendingTimers());
    else return;
  }
  throw new Error('queues did not settle');
};
const resetCounters = () => {
  for (const k of Object.keys(mockHops)) delete mockHops[k];
  for (const k of Object.keys(svReads)) delete svReads[k];
  for (const k of Object.keys(entriesCopied)) delete entriesCopied[k];
  handleReceiverChangeCalls = 0;
  setHoverContentCalls = 0;
  commits = 0;
};
const snapshot = () => ({
  hops: { ...mockHops },
  handleReceiverChange: handleReceiverChangeCalls,
  svReads: { ...svReads },
  entriesCopied: { ...entriesCopied },
  reactCommits: commits,
  setHoverContent: setHoverContentCalls,
});

// ── Scene: plain DraxViews ──────────────────────────────────────────────
// 'item' (draggable) at (0,0) 100x50; receivers 'zone' (0,200) and 'zone2'
// (200,200), both 200x200. Optional 'mon' monitor around everything.
const N = 60;
const cb = {
  onReceiveDragEnter: jest.fn(),
  onReceiveDragExit: jest.fn(),
  onReceiveDragOver: jest.fn(),
  onDragOver: jest.fn(),
  onDragEnter: jest.fn(),
  onMonitorDragOver: jest.fn(),
};
type SceneOpts = { continuous?: boolean; monitor?: boolean };
const renderPlainScene = ({ continuous = false, monitor = false }: SceneOpts) => {
  const parent = monitor ? 0 : -1;
  mockEntries = [
    ...(monitor ? [spatialEntry('mon', -1, 0, 0, 600, 600, true)] : []),
    spatialEntry('item', parent, 0, 0, 100, 50),
    spatialEntry('zone', parent, 0, 200, 200, 200),
    spatialEntry('zone2', parent, 200, 200, 200, 200),
  ];
  mockCtx.spatialIndexSV.value = mockEntries;
  mockCtx.scrollOffsetsSV.value = mockEntries.map(() => ({ x: 0, y: 0 }));
  mockDraxProps.clear();
  mockDraxProps.set('item', { id: 'item', draggable: true, noHover: true, onDragEnter: cb.onDragEnter, ...(continuous ? { onDragOver: cb.onDragOver } : {}) } as never);
  for (const z of ['zone', 'zone2'])
    mockDraxProps.set(z, {
      id: z,
      receptive: true,
      onReceiveDragEnter: cb.onReceiveDragEnter,
      onReceiveDragExit: cb.onReceiveDragExit,
      ...(continuous ? { onReceiveDragOver: cb.onReceiveDragOver } : {}),
    } as never);
  if (monitor) mockDraxProps.set('mon', { id: 'mon', monitoring: true, onMonitorDragOver: cb.onMonitorDragOver } as never);
  act(() =>
    ReactNative.render(
      <Profiler id="p" onRender={() => commits++}>
        <Dispatcher />
      </Profiler>,
      1
    )
  );
  mockGestureId = 'item';
  createDragGesture('item', sv(mockEntries.findIndex((e) => e.id === 'item')) as never, sv(true) as never, sv(250) as never);
  const g = mockGestures.get('item')!;
  g.onActivate!({ x: 50, y: 25, absoluteX: 50, absoluteY: 25 } as never);
  settle();
  return g;
};

/** N pan updates; `x(i)` is the pointer x (y stays 300, inside both zones' rows). */
const runUpdates = (g: DraxPanGestureConfig, x: (i: number) => number) => {
  resetCounters();
  for (let i = 0; i < N; i++) {
    g.onUpdate!({ absoluteX: x(i), absoluteY: 300 } as never);
    // UI frames outpace JS: the hops of one frame land, then JS runs them.
    drainUI();
    drainJS();
  }
  return snapshot();
};

const sameReceiver = (i: number) => 100 + (i % 2) * 0.5; // jitter inside 'zone'
const alternating = (i: number) => (i % 2 === 0 ? 100 : 300); // zone <-> zone2

// Sortable list: SortableContainer is a monitor whose onMonitorDragOver
// runs slot detection, moveDraggedItem and auto-scroll on every update.
const SORT_KEYS = ['A', 'B', 'C', 'D', 'E'];
const renderSortable = () => {
  mockEntries = [
    spatialEntry('list', -1, 0, 0, 100, 1000, true),
    ...SORT_KEYS.map((k, i) => spatialEntry(k, 0, 0, i * ROW, 100, ROW)),
  ];
  mockCtx.spatialIndexSV.value = mockEntries;
  mockCtx.scrollOffsetsSV.value = mockEntries.map(() => ({ x: 0, y: 0 }));
  mockDraxProps.clear();
  const Leaf = () => null;
  const List = () => {
    const h = useSortableList({ id: 'list', data: SORT_KEYS, keyExtractor: (k) => k, onReorder: () => {} });
    return (
      <SortableContainer sortable={h} scrollRef={{ current: null }}>
        {h.data.map((k, index) => (
          <SortableItem key={k} sortable={h} index={index}>
            <Leaf />
          </SortableItem>
        ))}
      </SortableContainer>
    );
  };
  act(() =>
    ReactNative.render(
      <Profiler id="p" onRender={() => commits++}>
        <Dispatcher />
        <List />
      </Profiler>,
      1
    )
  );
  SORT_KEYS.forEach((k, i) => {
    mockGestureId = k;
    createDragGesture(k, sv(i + 1) as never, sv(true) as never, sv(250) as never);
  });
  act(() => {
    mockDraxProps.get('list')!.onMeasure!({ x: 0, y: 0, width: 100, height: 1000 } as never);
    SORT_KEYS.forEach((k, i) => mockDraxProps.get(k)!.onMeasure!({ x: 0, y: i * ROW, width: 100, height: ROW } as never));
  });
  settle();
  const g = mockGestures.get('A')!;
  g.onActivate!({ x: 50, y: 25, absoluteX: 50, absoluteY: 25 } as never);
  settle();
  return g;
};
/** Over row C (slot 2), jittering by 0.5 px. */
const overRowC = (i: number) => ({ absoluteX: 50, absoluteY: 2 * ROW + 25 + (i % 2) * 0.5 });

/** UI outpaces JS: N updates land while JS is busy, then the finger lifts. */
const burstThenRelease = (g: DraxPanGestureConfig) => {
  resetCounters();
  for (let i = 0; i < N; i++) {
    g.onUpdate!(overRowC(i) as never);
    drainUI();
  }
  mockCtx.dragAbsolutePositionSV.value = { x: 50, y: 2 * ROW + 25 };
  g.onDeactivate!({} as never, true);
  // JS queue at release: everything here runs before the drop is handled.
  const queuedBeforeDragEnd = mockJSQueue.length - 1;
  drainJS();
  return { queuedBeforeDragEnd, ...snapshot() };
};

const results: Record<string, unknown> = {};

describe('124711: per-update JS cost of handleReceiverChange (measured, jest)', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    instrumentCtx();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockUIQueue.length = 0;
    mockJSQueue.length = 0;
    mockCtx.draggedIdSV.value = '';
    mockCtx.receiverIdSV.value = '';
  });
  afterEach(() => {
    act(() => ReactNative.unmountComponentAtNode(1));
  });
  afterAll(() => {
    if (process.env.DRAX_TRIAGE_PRINT) {
      console.log('MEASURE ' + JSON.stringify(results, null, 1));
    }
  });

  it.each([
    ['same receiver, no continuous cbs, no monitor', {}, sameReceiver],
    ['same receiver, onDragOver+onReceiveDragOver', { continuous: true }, sameReceiver],
    ['same receiver, monitor with onMonitorDragOver', { monitor: true }, sameReceiver],
    ['changing receivers, no continuous cbs, no monitor', {}, alternating],
    ['changing receivers, monitor with onMonitorDragOver', { monitor: true }, alternating],
  ] as const)('measure: %s', (label, opts, x) => {
    const g = renderPlainScene(opts);
    const m = runUpdates(g, x);
    results[label] = {
      ...m,
      onReceiveDragEnter: cb.onReceiveDragEnter.mock.calls.length,
      onReceiveDragExit: cb.onReceiveDragExit.mock.calls.length,
      onReceiveDragOver: cb.onReceiveDragOver.mock.calls.length,
      onDragOver: cb.onDragOver.mock.calls.length,
      onMonitorDragOver: cb.onMonitorDragOver.mock.calls.length,
    };
    // Recorder only (main: N, i.e. one hop per update, whatever changed).
    expect(m.handleReceiverChange).toBeGreaterThan(0);
  });

  it('measure: sortable list (5 rows), drag held over one row', () => {
    const g = renderSortable();
    resetCounters();
    for (let i = 0; i < N; i++) {
      g.onUpdate!(overRowC(i) as never);
      drainUI();
      drainJS();
    }
    results['sortable list, held over one row'] = snapshot();
    expect(handleReceiverChangeCalls).toBeGreaterThan(0); // main: N
  });

  it('measure: sortable list, UI outpaces JS (burst of N updates, then release)', () => {
    const g = renderSortable();
    const m = burstThenRelease(g);
    results['sortable list, burst then release'] = m;
    expect(m.queuedBeforeDragEnd).toBeGreaterThanOrEqual(0); // main: N
  });
});

describe('124711 regression: dedupe receiver hops on the UI thread', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockUIQueue.length = 0;
    mockJSQueue.length = 0;
    mockCtx.draggedIdSV.value = '';
    mockCtx.receiverIdSV.value = '';
  });
  afterEach(() => {
    act(() => ReactNative.unmountComponentAtNode(1));
  });

  it('N updates over the same receiver with no continuous callbacks: one dispatch, bounded hops', () => {
    const g = renderPlainScene({});
    const m = runUpdates(g, sameReceiver);
    // Semantics kept: the receiver is entered exactly once, never exited.
    expect(cb.onReceiveDragEnter).toHaveBeenCalledTimes(1);
    expect(cb.onDragEnter).toHaveBeenCalledTimes(1);
    expect(cb.onReceiveDragExit).not.toHaveBeenCalled();
    // The fix: only the receiver change reaches JS.
    expect({ handleReceiverChange: m.handleReceiverChange, hops: m.hops.handleReceiverChange ?? 0 }).toEqual({
      handleReceiverChange: 1,
      hops: 1,
    });
  });

  it('sortable list: a burst of N updates while JS is busy queues a bounded number of hops', () => {
    const g = renderSortable();
    const m = burstThenRelease(g);
    // With coalescing (at most one continuous hop in flight) the drop is not
    // queued behind N stale over-events.
    expect(m.queuedBeforeDragEnd).toBeLessThanOrEqual(2);
  });
});
