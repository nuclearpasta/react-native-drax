/**
 * DraxList — Custom recycling list with built-in drag-and-drop.
 *
 * ZERO internal React state. All data in refs + SharedValues.
 * Cell recycling via stable React keys (native views never unmount).
 * Positioning via absolute left/top + Reanimated shift offsets.
 *
 * No FlatList. No Fabric/Reanimated race. No blink.
 */
import type { ReactNode, RefObject } from 'react';
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import Reanimated, { useAnimatedRef, useAnimatedStyle, useScrollViewOffset, useSharedValue, withSpring } from 'react-native-reanimated';
import { DraxView } from './DraxView';
import { RecycledCell } from './RecycledCell';
import { useSortableBoardContext } from './SortableBoardContext';
import { useDraxContext } from './hooks/useDraxContext';
import type {
  SortableListInternal,
  SortableReorderEvent,
  UseSortableListOptions,
} from './hooks/useSortableList';
import { useSortableList } from './hooks/useSortableList';
import { resolveAnimationConfig } from './params';
import type {
  DraxMonitorDragDropEventData,
  DraxMonitorEndEventData,
  DraxMonitorEventData,
  DraxProtocolDragEndResponse,
  DraxSnapEndEventData,
} from './types';
import { DraxSnapbackTargetPreset, isSortableItemPayload } from './types';

// ─── Types ────────────────────────────────────────────────────────────

export interface DropIndicatorInfo<T = unknown> {
  item: T;
  /** Target slot index */
  index: number;
  /** Slot width */
  width: number;
  /** Slot height */
  height: number;
  /** Cross-container transfer active */
  isCrossContainer: boolean;
  /** This list is the drag source (false = target) */
  isSource: boolean;
  /** This list's orientation */
  horizontal: boolean;
  /** Hover view width (dragged item's visual width) */
  hoverWidth: number;
  /** Hover view height (dragged item's visual height) */
  hoverHeight: number;
  /** Source list id */
  sourceListId: string;
  /** Target list id (same as source for intra-list) */
  targetListId: string;
  /** Original index in source list where drag started */
  fromIndex: number;
}

export interface DraxListProps<T> {
  /** Items to render. */
  data: T[];
  /** Render function for each item. Compatible with FlatList's renderItem signature. */
  renderItem: (info: { item: T; index: number }) => ReactNode;
  /** Unique key for each item. */
  keyExtractor: (item: T, index: number) => string;
  /** Approximate item size (height for vertical, width for horizontal) for initial layout.
   *  Items self-measure after render — this only affects the first frame. @default 50 */
  estimatedItemSize?: number;
  /** Called when items are reordered via drag. Receives the new data array. */
  onReorder?: (event: SortableReorderEvent<T>) => void;
  /** Render a custom drop indicator (ghost) at the insertion point during drag. */
  renderDropIndicator?: (info: DropIndicatorInfo<T>) => ReactNode;
  /** Explicit DraxView id for this list. Auto-generated if omitted. */
  id?: string;
  /** Number of columns for grid layout. @default 1 */
  numColumns?: number;
  /** Horizontal list layout. @default false */
  horizontal?: boolean;
  /** Extra pixels beyond the viewport to render (virtualization buffer). @default 250 */
  drawDistance?: number;
  /** Animation preset or custom config for shift animations.
   *  Presets: 'default', 'spring', 'gentle', 'snappy', 'none'. @default 'default' */
  animationConfig?: UseSortableListOptions<T>['animationConfig'];
  /** Long press delay before drag starts in ms. @default 250 */
  longPressDelay?: number;
  /** Lock item drags to the list's main axis. @default false */
  lockToMainAxis?: boolean;
  /** Reorder strategy: 'insert' (default) or 'swap'. @default 'insert' */
  reorderStrategy?: UseSortableListOptions<T>['reorderStrategy'];
  /** When true, only DraxHandle children start a drag. */
  dragHandle?: boolean;
  /** Returns grid span per item. Enables mixed-size grid with bin-packing. */
  getItemSpan?: (item: T, index: number) => import('./types').GridItemSpan;
  /** Gap between items in pixels. @default 0 */
  gridGap?: number;
  /** Enable flex-wrap layout. Items flow left-to-right and wrap to new rows. */
  flexWrap?: boolean;
  /** Returns pixel dimensions per item. Required when flexWrap is true. */
  getItemSize?: (item: T, index: number) => { width: number; height: number };
  /** Forwarded to the internal ScrollView. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Scroll event throttle in ms. @default 16 */
  scrollEventThrottle?: number;
  /** Style for the outer container (DraxView). */
  style?: StyleProp<ViewStyle>;
  /** Style for the content container (inside ScrollView). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Style applied to non-dragged items while a drag is active.
   *  Use for dimming/scaling inactive items (e.g., `{ opacity: 0.5 }`). */
  inactiveItemStyle?: ViewStyle;
  /** Extra DraxView props applied to each item's inner DraxView. */
  itemDraxViewProps?: Partial<import('./types').DraxViewProps>;
  /** Called when a drag starts on this list. */
  onDragStart?: (event: { index: number; item: T }) => void;
  /** Called when a drag ends on this list. */
  onDragEnd?: (event: { index: number; item: T; toIndex: number; cancelled: boolean }) => void;
  /** Rendered before the first item. */
  ListHeaderComponent?: ReactNode;
  /** Rendered after the last item. */
  ListFooterComponent?: ReactNode;
  /** Rendered when data is empty. */
  ListEmptyComponent?: ReactNode;
  /** Rendered while items are being measured (before first layout).
   *  Use for a loading spinner or skeleton. Disappears once positions are calculated. */
  ListLoadingComponent?: ReactNode;
}

/** Cell binding data — content identity only. Positions flow through SharedValues. */
interface CellBindingData {
  itemKey: string;
  cellWidth: number | undefined;
  cellHeight: number | undefined;
  dataIndex: number;
}

/** Per-cell subscription store. Only notifies a cell's subscriber when its binding actually changes. */
class CellBindingStore {
  bindings = new Map<string, CellBindingData>();
  private subscribers = new Map<string, Set<() => void>>();

  subscribe(cellKey: string, cb: () => void): () => void {
    let set = this.subscribers.get(cellKey);
    if (!set) { set = new Set(); this.subscribers.set(cellKey, set); }
    set.add(cb);
    return () => { set.delete(cb); };
  }

  getBinding(cellKey: string): CellBindingData | undefined {
    return this.bindings.get(cellKey);
  }

  setBinding(cellKey: string, data: CellBindingData): void {
    const prev = this.bindings.get(cellKey);
    if (prev && prev.itemKey === data.itemKey && prev.dataIndex === data.dataIndex
        && prev.cellWidth === data.cellWidth && prev.cellHeight === data.cellHeight) {
      return;
    }
    this.bindings.set(cellKey, data);
    this.subscribers.get(cellKey)?.forEach(fn => fn());
  }

  clearBinding(cellKey: string): void {
    if (!this.bindings.has(cellKey)) return;
    this.bindings.delete(cellKey);
    this.subscribers.get(cellKey)?.forEach(fn => fn());
  }
}

// ─── Measured Content (single View replacing the old 2-View wrapper) ──

interface MeasuredContentProps {
  itemKey: string;
  cellKey: string;
  horizontal: boolean;
  skipMeasurement: boolean;
  fillStyle: { flex: number } | undefined;
  alignSelf: string;
  onMeasure: (itemKey: string, height: number) => void;
  onCellHeight: React.RefObject<Map<string, number>>;
  children: ReactNode;
}

const MeasuredContent = memo(({
  itemKey,
  cellKey,
  horizontal,
  skipMeasurement,
  fillStyle,
  alignSelf,
  onMeasure,
  onCellHeight,
  children,
}: MeasuredContentProps) => {
  const ref = useRef<any>(null);

  // New Architecture: useLayoutEffect + measure() runs synchronously before paint (JSI).
  // https://reactnative.dev/architecture/landing-page#synchronous-layout-and-effects
  // key={itemKey} forces remount on recycle → useLayoutEffect fires → guaranteed measurement.
  useLayoutEffect(() => {
    if (skipMeasurement) return;
    if (!ref.current) return;
    if (typeof ref.current.measure !== 'function') return;
    ref.current.measure((_x: number, _y: number, width: number, height: number) => {
      const primary = horizontal ? width : height;
      if (primary > 0) {
        onMeasure(itemKey, primary);
        onCellHeight.current.set(cellKey, primary);
      }
    });
  }, [itemKey]);

  return (
    <View ref={ref} key={itemKey} style={[{ alignSelf: alignSelf as any }, fillStyle]}>
      {children}
    </View>
  );
});

MeasuredContent.displayName = 'MeasuredContent';

// ─── Stable props ref for CellSlot (avoids re-renders from prop identity changes) ──

interface CellSlotStableProps {
  dataRef: RefObject<unknown[]>;
  renderItemRef: RefObject<(info: { item: unknown; index: number }) => ReactNode>;
  draggedKeySV: import('react-native-reanimated').SharedValue<string>;
  hoverReadySV: import('react-native-reanimated').SharedValue<boolean>;
  skipShiftAnimationSV: import('react-native-reanimated').SharedValue<boolean>;
  springConfig: { damping: number; stiffness: number; mass: number } | null;
  shiftDuration: number;
  inactiveItemStyle?: Record<string, unknown>;
  registerCellBase: (key: string, sv: import('react-native-reanimated').SharedValue<import('./types').Position>) => void;
  unregisterCellBase: (key: string) => void;
  registerCellShift: (key: string, sv: import('react-native-reanimated').SharedValue<import('./types').Position>) => void;
  unregisterCellShift: (key: string) => void;
  dragHandle?: boolean;
  longPressDelay: number;
  itemDraxViewProps?: Record<string, unknown>;
  lockDragX: boolean;
  lockDragY: boolean;
  handleSnapEnd: (data: DraxSnapEndEventData) => void;
  sortableWorkletConfig: unknown;
  fillStyle: { flex: number } | undefined;
  horizontal: boolean;
  skipMeasurement: boolean;
  itemAlignSelf: string;
  handleItemLayout: (itemKey: string, height: number) => void;
  cellLastHeightRef: RefObject<Map<string, number>>;
  basePositionsRef: RefObject<Map<string, import('./types').Position>>;
}

// Debug: count CellSlot renders per second
/** Per-cell component with independent subscription. Only re-renders when its binding changes. */
const CellSlot = memo(function CellSlot({
  cellKey,
  store,
  sp,
}: {
  cellKey: string;
  store: CellBindingStore;
  sp: RefObject<CellSlotStableProps>;
}) {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cellKey, cb), [store, cellKey]);
  const getSnapshot = useCallback(() => store.getBinding(cellKey), [store, cellKey]);
  const binding = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!binding) return null;

  const { itemKey, cellWidth, cellHeight, dataIndex } = binding;
  const p = sp.current;
  const item = (p.dataRef.current as unknown[])[dataIndex];
  if (!item) return null;
  const basePos = p.basePositionsRef.current.get(itemKey);

  return (
    <RecycledCell
      baseX={basePos?.x ?? 0}
      baseY={basePos?.y ?? 0}
      cellWidth={cellWidth}
      cellHeight={cellHeight}
      itemKey={itemKey}
      draggedKeySV={p.draggedKeySV}
      hoverReadySV={p.hoverReadySV}
      skipShiftAnimationSV={p.skipShiftAnimationSV}
      springConfig={p.springConfig}
      shiftDuration={p.shiftDuration}
      inactiveItemStyle={p.inactiveItemStyle}
      registerCellBase={p.registerCellBase}
      unregisterCellBase={p.unregisterCellBase}
      registerCellShift={p.registerCellShift}
      unregisterCellShift={p.unregisterCellShift}
    >
      <DraxView
        draggable
        dragHandle={p.dragHandle}
        longPressDelay={p.longPressDelay}
        {...(p.itemDraxViewProps as Record<string, unknown>)}
        lockDragXPosition={p.lockDragX}
        lockDragYPosition={p.lockDragY}
        payload={{ index: dataIndex, originalIndex: dataIndex }}
        onSnapEnd={p.handleSnapEnd}
        sortableWorklet={p.sortableWorkletConfig}
        style={p.fillStyle}
        _contentPosition={basePos}
      >
        <MeasuredContent
          itemKey={itemKey}
          cellKey={cellKey}
          horizontal={p.horizontal}
          skipMeasurement={p.skipMeasurement}
          fillStyle={p.fillStyle}
          alignSelf={p.itemAlignSelf}
          onMeasure={p.handleItemLayout}
          onCellHeight={p.cellLastHeightRef}
        >
          {p.renderItemRef.current({ item, index: dataIndex })}
        </MeasuredContent>
      </DraxView>
    </RecycledCell>
  );
});

// ─── Component ────────────────────────────────────────────────────────

export const DraxList = <T,>(props: DraxListProps<T>) => {
  const {
    data,
    renderItem,
    keyExtractor,
    estimatedItemSize = 50,
    onReorder,
    renderDropIndicator,
    id: _idProp,
    numColumns = 1,
    horizontal = false,
    drawDistance: drawDistanceProp,
    animationConfig = 'default',
    longPressDelay = 250,
    lockToMainAxis,
    reorderStrategy,
    dragHandle,
    getItemSpan,
    gridGap,
    flexWrap,
    getItemSize,
    onScroll: onScrollProp,
    scrollEventThrottle = 16,
    style,
    contentContainerStyle,
    inactiveItemStyle,
    itemDraxViewProps,
    onDragStart: onDragStartProp,
    onDragEnd: onDragEndProp,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    ListLoadingComponent,
  } = props;

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  // Smart default: pre-render ~3 viewports of items off-screen in each direction.
  // Items measure off-screen BEFORE scrolling into view, reducing position
  // adjustments from estimatedItemSize mismatches during fast scroll.
  const viewportSize = horizontal ? screenWidth : screenHeight;
  const drawDistance = drawDistanceProp ?? viewportSize * 3;

  const scrollAnimatedRef = useAnimatedRef<Reanimated.ScrollView>();

  // ── Re-render trigger — ONLY used for cell pool growth (adding new CellSlot elements) ──
  // Normal scroll/data updates go through the CellBindingStore → per-cell useSyncExternalStore.
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // ── Per-cell subscription store ──
  const cellStoreRef = useRef(new CellBindingStore());
  // Active cell keys — grows on demand, never shrinks during session.
  // forceRender is called when this grows (to add CellSlot elements to the tree).
  const activeCellKeysRef = useRef<string[]>([]);
  // Stable ref for props passed to CellSlot (avoids memo-busting from new object identity)
  const stablePropsRef = useRef<CellSlotStableProps>(null!);

  // ── Core hook (all refs + SharedValues, no state) ──
  const sortable = useSortableList({
    id: _idProp,
    data,
    keyExtractor,
    onReorder: onReorder ?? (() => {}),
    estimatedItemSize,
    horizontal,
    numColumns,
    reorderStrategy,
    longPressDelay,
    lockToMainAxis,
    animationConfig,
    drawDistance,
    getItemSpan,
    gridGap,
    flexWrap,
    getItemSize,
  });

  const int = sortable._internal;

  // UI-thread scroll offset tracking via Reanimated (no JS onScroll needed).
  // Passes int.scrollOffsetSV as the target SV — Reanimated writes directly to it.
  useScrollViewOffset(scrollAnimatedRef, int.scrollOffsetSV);

  // Register renderItem so board can access it
  int.renderItemRef.current = renderItem as (info: any) => ReactNode;

  const resolvedAnimConfig = useMemo(
    () => resolveAnimationConfig(animationConfig),
    [animationConfig]
  );

  // Pre-compute spring config once — avoids object allocation per frame per cell in worklet
  const cellSpringConfig = useMemo(
    () =>
      resolvedAnimConfig.useSpring
        ? {
            damping: resolvedAnimConfig.springDamping,
            stiffness: resolvedAnimConfig.springStiffness,
            mass: resolvedAnimConfig.springMass,
          }
        : null,
    [resolvedAnimConfig]
  );

  const {
    hoverReadySV,
    hoverClearDeferredRef,
    dragPhaseSV,
    draggedIdSV,
    hoverPositionSV,
    hoverDimsSV,
    setHoverContent,
    isDragAllowedSV,
  } = useDraxContext();

  // ── Board registration (cross-container) ──
  const boardContext = useSortableBoardContext();
  useEffect(() => {
    if (!boardContext) return;
    boardContext.registerColumn(int.id, int as SortableListInternal<unknown>);
    return () => boardContext.unregisterColumn(int.id);
  }, [boardContext, int]);

  // ── Worklet config for UI-thread slot detection ──
  // Flex-wrap and grids use JS-side slot detection (packFlex/packGrid).
  // The worklet only supports linear 1D lists (cursor-based positioning).
  const sortableWorkletConfig = useMemo(
    () => flexWrap || numColumns > 1 ? null : ({
      frozenBoundariesSV: int.frozenBoundariesSV,
      orderedKeysSV: int.orderedKeysSV,
      basePositionsSV: int.basePositionsSV,
      itemHeightsSV: int.itemHeightsSV,
      currentSlotSV: int.currentSlotSV,
      isDraggingSV: int.isDraggingSV,
      containerMeasSV: int.containerMeasSV,
      cellShiftRecordSV: int.cellShiftRecordSV,
      cumulativeEndsSV: int.cumulativeEndsSV,
      draggedKeySV: int.draggedKeySV,
      dropIndicatorPositionSV: int.dropIndicatorPositionSV,
      scrollOffsetSV: int.scrollOffsetSV,
      snapTargetSV: int.snapTargetSV,
      numColumns,
      horizontal,
      estimatedItemSize,
      reorderStrategy: reorderStrategy ?? 'insert',
      getSlotFromPositionWorklet: int.getSlotFromPositionWorklet,
      recomputeShiftsWorklet: int.recomputeShiftsWorklet,
    }),
    [int, numColumns, horizontal, estimatedItemSize, reorderStrategy, flexWrap]
  );

  // ── Cell pool (refs only) ──
  const freeCellsRef = useRef<string[]>([]);
  const cellLastHeightRef = useRef<Map<string, number>>(new Map()); // cellKey → last measured height
  const bindingMapRef = useRef<Map<string, string>>(new Map()); // itemKey → cellKey
  const visibleKeysRef = useRef(new Set<string>()); // Reused across scroll ticks (no allocation)
  const nextCellIdRef = useRef(0);

  /** Compute binding data for a single item (content identity + dimensions, NO position). */
  const computeCellBindingData = useCallback(
    (itemKey: string): CellBindingData | null => {
      const dataIndex = int.keyToIndexRef.current.get(itemKey);
      if (dataIndex === undefined) return null;
      const dims = int.itemDimensionsRef.current.get(itemKey);
      const cw = int.containerWidthRef.current;
      const cwg = cw > 0 ? (numColumns > 1 ? cw / numColumns : cw) : undefined;
      const cellWidth = flexWrap ? dims?.width : horizontal ? undefined : (dims?.width ?? cwg);
      const cellHeight = flexWrap ? dims?.height : horizontal ? cwg : getItemSpan ? dims?.height : undefined;
      return { itemKey, cellWidth, cellHeight, dataIndex };
    },
    [int, flexWrap, horizontal, numColumns, getItemSpan]
  );

  const lastIndicatorSlotRef = useRef(-1); // Track indicator's last-set slot (avoids worklet/JS SV race)
  const itemsMeasuredRef = useRef(false); // True after first item measurement cycle — prevents FOUC

  // Scroll velocity for asymmetric buffer distribution (0 = symmetric buffer).
  // TODO: track velocity on UI thread via worklet for asymmetric pre-rendering.
  const scrollVelocityRef = useRef(0);
  // ── Container measurement (synchronous on Fabric via JSI) ──
  const measureContainer = useCallback(() => {
    const node = scrollAnimatedRef.current;
    if (!node) return;
    (node as any).measure(
      (_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
        const cw = horizontal ? height : width;
        if (cw === int.containerWidthRef.current) return; // No change
        int.containerWidthRef.current = cw;
        int.containerMeasRef.current = { x: pageX, y: pageY, width, height };
        int.recomputeBasePositionsAndClearShifts();
        int.syncPositionsToWorklet();
        int.pushBasePositionsToSVs();
        lastProcessedOffsetRef.current = int.scrollOffsetSV.value;
        if (updateVisibleCells(int.scrollOffsetSV.value)) forceRender();
      }
    );
  }, [horizontal, int]);

  // New Architecture: useLayoutEffect + measure() runs synchronously before paint.
  // Container width available on first commit — no FOUC from async onLayout.
  useLayoutEffect(() => {
    measureContainer();
  }, [measureContainer]);

  // Container measurement handled by useLayoutEffect above (New Architecture pattern).
  // No onLayout needed — useLayoutEffect + measure() is synchronous on Fabric.

  // ── Animated content container height (avoids React re-render on size change) ──
  const totalSizeSV = useSharedValue(data.length * estimatedItemSize);
  const contentContainerAnimStyle = useAnimatedStyle(() => {
    return horizontal
      ? { width: totalSizeSV.value, height: '100%' as any }
      : { height: totalSizeSV.value, width: '100%' as any };
  });

  // ── Scroll handling ──
  // Scroll offset SV is tracked on UI thread via useScrollViewOffset (no scheduleOnUI needed).
  // onScroll still handles visibility threshold + user callback on JS thread.
  const SCROLL_DELTA_THRESHOLD = Math.max(4, estimatedItemSize / 4);
  const lastProcessedOffsetRef = useRef(0);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y;

      if (Math.abs(offset - lastProcessedOffsetRef.current) >= SCROLL_DELTA_THRESHOLD) {
        lastProcessedOffsetRef.current = offset;
        if (updateVisibleCells(offset)) forceRender();
      }

      onScrollProp?.(event);
    },
    [horizontal, onScrollProp, SCROLL_DELTA_THRESHOLD]
  );

  // ── Item measurement (synchronous) ──
  const handleItemLayout = useCallback(
    (itemKey: string, height: number) => {
      const current = int.itemHeightsRef.current.get(itemKey);
      const changed = current === undefined || Math.abs(current - height) > 0.5;
      if (!changed) return;
      int.recordItemHeight(itemKey, height);
      itemsMeasuredRef.current = true;
      const isDragging = int.isDraggingRef.current || int.isDraggingSV.value;
      const shiftsEmpty = Object.keys(int.shiftsSV.value).length === 0;
      if (isDragging) {
        int.itemHeightsSV.value = {
          ...int.itemHeightsSV.value,
          [itemKey]: height,
        };
      } else if (shiftsEmpty) {
        int.recomputeBasePositions();
        int.syncPositionsToWorklet();
        int.pushBasePositionsToSVs();
        if (updateVisibleCells(int.scrollOffsetSV.value)) startTransition(forceRender);
      }
    },
    [int]
  );

  // ── Cell recycler ──
  // Returns true if cell pool grew (caller must forceRender to add CellSlot elements).
  const updateVisibleCells = useCallback(
    (scrollOffset: number): boolean => {
      const keys = int.orderedKeysRef.current;
      const heights = int.itemHeightsRef.current;
      const containerSize = horizontal
        ? (int.containerMeasRef.current?.width ?? screenWidth)
        : (int.containerMeasRef.current?.height ?? screenHeight);

      // Velocity-aware buffering: distribute buffer asymmetrically based on scroll direction.
      // 70% buffer ahead of scroll direction, 30% behind (FlashList pattern).
      // During drag: always use symmetric buffer. Switching from asymmetric→symmetric
      // when drag starts would unbind cells that were visible under the asymmetric buffer,
      // causing layout jumps and visual chaos.
      const isDragging = int.isDraggingRef.current;
      const velocity = isDragging ? 0 : scrollVelocityRef.current;
      const totalBuffer = drawDistance * 2;
      let bufferBefore: number;
      let bufferAfter: number;
      if (Math.abs(velocity) > 0.1) {
        bufferAfter = totalBuffer * (velocity > 0 ? 0.7 : 0.3);
        bufferBefore = totalBuffer - bufferAfter;
      } else {
        bufferBefore = bufferAfter = totalBuffer * 0.5;
      }
      const visibleStart = scrollOffset - bufferBefore;
      const visibleEnd = scrollOffset + containerSize + bufferAfter;

      visibleKeysRef.current.clear();
      const visibleKeys = visibleKeysRef.current;

      // Binary search path for linear lists (O(log N + V) instead of O(N))
      const sorted = int.sortedPositionsRef.current;
      if (sorted.length > 0 && numColumns === 1 && !flexWrap) {
        // Binary search: find first item where end >= visibleStart
        let lo = 0;
        let hi = sorted.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid]!.end < visibleStart) lo = mid + 1;
          else hi = mid;
        }
        // Walk forward collecting visible keys
        for (let i = lo; i < sorted.length; i++) {
          if (sorted[i]!.start > visibleEnd) break;
          visibleKeys.add(sorted[i]!.key);
        }
        // During drag: pin all currently-bound keys to prevent unbinding cells
        // that have shifted away from their base positions via animated transforms.
        if (isDragging) {
          for (const [itemKey] of bindingMapRef.current) {
            visibleKeys.add(itemKey);
          }
        }

      } else {
        // Fallback: O(N) loop for grids/flex-wrap (2D visibility)
        const basePositions = int.basePositionsRef.current;
        const shifts = int.shiftsSV.value;
        for (const key of keys) {
          const basePos = basePositions.get(key);
          if (!basePos) {
            visibleKeys.add(key);
            continue;
          }
          const shift = shifts[key];
          if (horizontal) {
            const visualX = basePos.x + (shift?.x ?? 0);
            const w =
              int.itemDimensionsRef.current.get(key)?.width ??
              heights.get(key) ??
              estimatedItemSize;
            if (visualX + w >= visibleStart && visualX <= visibleEnd)
              visibleKeys.add(key);
          } else {
            const h =
              int.itemDimensionsRef.current.get(key)?.height ??
              heights.get(key) ??
              estimatedItemSize;
            const visualY = basePos.y + (shift?.y ?? 0);
            if (visualY + h >= visibleStart && visualY <= visibleEnd)
              visibleKeys.add(key);
          }
        }
      }

      // Diff: unbind items that left, bind items that entered
      const currentMap = bindingMapRef.current;
      const store = cellStoreRef.current;
      let poolGrew = false;

      // Unbind (but never free the dragged item's cell)
      const dragKey = int.draggedKeySV.value;
      const freedCells: string[] = [];
      for (const [itemKey, cellKey] of currentMap.entries()) {
        if (!visibleKeys.has(itemKey) && itemKey !== dragKey) {
          currentMap.delete(itemKey);
          freeCellsRef.current.push(cellKey);
          freedCells.push(cellKey);
        }
      }

      // Bind
      let proactiveMeasured = false;
      const newlyBound: [string, string][] = [];
      for (const itemKey of visibleKeys) {
        if (!currentMap.has(itemKey)) {
          let cellKey: string;
          if (freeCellsRef.current.length > 0) {
            cellKey = freeCellsRef.current.pop()!;
            // Proactive measurement: use cell's last known height for the new item.
            const cellHeight = cellLastHeightRef.current.get(cellKey);
            if (cellHeight !== undefined && !int.itemHeightsRef.current.has(itemKey)) {
              int.recordItemHeight(itemKey, cellHeight);
              proactiveMeasured = true;
            }
          } else {
            cellKey = `cell-${nextCellIdRef.current++}`;
            activeCellKeysRef.current.push(cellKey);
            poolGrew = true;
          }
          currentMap.set(itemKey, cellKey);
          newlyBound.push([itemKey, cellKey]);
        }
      }

      // Recompute positions if proactive measurements changed any heights.
      if (proactiveMeasured) {
        int.recomputeBasePositions();
        int.syncPositionsToWorklet();
        int.pushBasePositionsToSVs(); // SV write → animatedStyle on UI thread, zero React re-renders
      }

      // Clear freed cells FIRST — a freed cell may be reused in newlyBound (same cellKey).
      // If we clear AFTER set, we'd destroy the new binding.
      for (const cellKey of freedCells) {
        store.clearBinding(cellKey);
      }
      // Then set newly bound cells (may reuse cellKeys that were just cleared)
      for (const [itemKey, cellKey] of newlyBound) {
        const bd = computeCellBindingData(itemKey);
        if (bd) store.setBinding(cellKey, bd);
      }

      return poolGrew;
    },
    [
      int,
      horizontal,
      screenWidth,
      screenHeight,
      drawDistance,
      estimatedItemSize,
      numColumns,
      flexWrap,
      computeCellBindingData,
    ]
  );

  // Register forceRenderRef for board cross-container triggers.
  // Board calls this after insertKey/removeKey to update cell bindings.
  int.forceRenderRef.current = () => {
    const poolGrew = updateVisibleCells(int.scrollOffsetSV.value);
    if (poolGrew) forceRender();
  };

  // ── Initial binding + data sync ──
  useLayoutEffect(() => {
    // Echo: parent echoed back our committed reorder. Shifts are permanent, visual is correct.
    // Skip ALL work — no base recompute, no shift clear, no SV sync, no forceRender.
    const isEcho = int.echoSkipRef.current;
    int.echoSkipRef.current = false;
    if (isEcho) return;

    // PRE-SYNC position/height/orderedKeys SVs to worklet (safe here — after render, before paint).
    int.syncPositionsToWorklet();
    int.pushBasePositionsToSVs();
    int.orderedKeysSV.value = [...int.orderedKeysRef.current];

    if (int.pendingShiftClearRef.current) {
      int.pendingShiftClearRef.current = false;
      // Base positions were recomputed eagerly during render (in useSortableList data sync).
      // Cells in THIS commit already have new baseX/baseY. Now clear shifts — both
      // updates land in the same Fabric commit, so no 1-frame blink at old positions.
      int.clearShifts();
      // Hide indicator + clear stale info — transfer complete. Clean state for next drag.
      dropIndicatorVisibleSV.value = false;
      dropIndicatorInfoRef.current = undefined;
    }

    // Reset scroll delta tracking (positions/data just changed)
    lastProcessedOffsetRef.current = int.scrollOffsetSV.value;
    // updateVisibleCells updates store → per-cell re-renders via useSyncExternalStore.
    // forceRender only if pool grew (to add new CellSlot elements).
    const poolGrew = updateVisibleCells(int.scrollOffsetSV.value);

    // Source list: dragged item was transferred out — clear drag state AFTER cell is unbound.
    // This prevents the flash (opacity 0→1 on the old cell before React removes it).
    if (int.isDraggingRef.current) {
      const dragKey = int.draggedKeySV.value;
      if (dragKey && !int.keyToIndexRef.current.has(dragKey)) {
        int.isDraggingRef.current = false;
        int.draggedKeySV.value = '';
        // Recompute for remaining N-1 items: corrects base positions,
        // totalContentSize, and clears permanent drag shifts.
        int.skipShiftAnimationSV.value = true;
        int.recomputeBasePositionsAndClearShifts();
        int.pushBasePositionsToSVs();
      }
    }

    if (poolGrew) forceRender();
  }, [data]);

  // ── Hover cleanup after cross-container transfer ──
  // useEffect fires AFTER paint — cells are already rendered on screen.
  // This ensures no visual gap between hover clearing and cell appearing.
  useEffect(() => {
    // skipShiftAnimationSV stays true until next drag starts (reset in onMonitorDragStart).
    // Resetting here caused a web race: useEffect fires after paint but before Reanimated web
    // processes the shift→0 change → animated style sees skipShift=false → spring animation.

    if (hoverClearDeferredRef.current) {
      hoverClearDeferredRef.current = false;
      scheduleOnUI(
        (
          _hoverReadySV: typeof hoverReadySV,
          _dragPhaseSV: typeof dragPhaseSV,
          _draggedIdSV: typeof draggedIdSV,
          _hoverPositionSV: typeof hoverPositionSV,
          _hoverDimsSV: typeof hoverDimsSV,
          _isDragAllowedSV: typeof isDragAllowedSV,
          _setHoverContent: typeof setHoverContent
        ) => {
          'worklet';
          _hoverReadySV.value = false;
          _dragPhaseSV.value = 'idle';
          _draggedIdSV.value = '';
          _hoverPositionSV.value = { x: 0, y: 0 };
          _hoverDimsSV.value = { x: 0, y: 0 };
          _isDragAllowedSV.value = true; // Unlock — all cleanup done, allow new drags
          scheduleOnRN(_setHoverContent, null);
        },
        hoverReadySV,
        dragPhaseSV,
        draggedIdSV,
        hoverPositionSV,
        hoverDimsSV,
        isDragAllowedSV,
        setHoverContent
      );
    }
  }, [data]);

  // ── Drop indicator tracking (all from internal — board can control any column's indicator) ──
  const dropIndicatorPositionSV = int.dropIndicatorPositionSV;
  const dropIndicatorVisibleSV = int.dropIndicatorVisibleSV;
  const dropIndicatorInfoRef = int.dropIndicatorInfoRef as React.RefObject<
    DropIndicatorInfo<T> | undefined
  >;

  // ── Drag handlers ──

  const onMonitorDragStart = useCallback(
    (eventData: DraxMonitorEventData) => {
      const { dragged } = eventData;
      if (dragged.parentId !== int.id) return;
      if (!isSortableItemPayload(dragged.payload)) return;

      const { originalIndex } = dragged.payload;
      const item = int.dataRef.current[originalIndex];
      if (item === undefined) return;

      const itemKey = keyExtractor(item, originalIndex);
      int.skipShiftAnimationSV.value = false; // Re-enable shift animations for this drag
      int.isDraggingRef.current = true;
      int.draggedKeySV.value = itemKey;
      int.dragStartIndexRef.current = originalIndex;
      int.snapTargetPositionRef.current = null; // Reset for this drag
      int.snapTargetSV.value = { x: -1, y: -1 }; // Sentinel: worklet hasn't set target yet
      // Sync to worklet SVs for UI-thread slot detection
      int.syncRefsToWorklet();

      // For mixed-size grids: set hover dimensions from computed cell size.
      // The default hover auto-sizes from DraxView measurements, but flex:1 items
      // may have stale measurements if the cell was recently recycled. The computed
      // dimensions from packGrid are always authoritative.
      // Set hover dimensions from computed item size for grids and flex-wrap.
      if ((getItemSpan && numColumns > 1) || flexWrap) {
        const dims = int.itemDimensionsRef.current.get(itemKey);
        if (dims) {
          hoverDimsSV.value = { x: dims.width, y: dims.height };
        }
      }

      // Fire user callback
      onDragStartProp?.({ index: originalIndex, item: item as T });

      // Find display index — O(1) Map lookup instead of O(N) indexOf
      const displayIdx = int.keyToIndexRef.current.get(itemKey) ?? -1;
      int.currentSlotRef.current = displayIdx >= 0 ? displayIdx : originalIndex;

      // Freeze slot boundaries for stable detection
      int.freezeSlotBoundaries();

      // Pre-populate drop indicator info + position. Read from basePositionsRef (already computed, O(1)).
      if (renderDropIndicator) {
        const draggedMeas = eventData.dragged.measurements;
        const dims = int.itemDimensionsRef.current.get(itemKey);
        dropIndicatorInfoRef.current = {
          item: item as T,
          index: displayIdx >= 0 ? displayIdx : originalIndex,
          width: draggedMeas?.width ?? dims?.width ?? 0,
          height: draggedMeas?.height ?? dims?.height ?? estimatedItemSize,
          isCrossContainer: false,
          isSource: true,
          horizontal,
          hoverWidth: draggedMeas?.width ?? 0,
          hoverHeight: draggedMeas?.height ?? 0,
          sourceListId: int.id,
          targetListId: int.id,
          fromIndex: originalIndex,
        };
        // Use visual position (base + permanentShift) for permanent shifts after reorder
        const baseIndicatorPos = int.basePositionsRef.current.get(itemKey);
        const indicatorShift = int.shiftsSV.value[itemKey];
        const indicatorPos = baseIndicatorPos
          ? { x: baseIndicatorPos.x + (indicatorShift?.x ?? 0), y: baseIndicatorPos.y + (indicatorShift?.y ?? 0) }
          : undefined;
        if (indicatorPos) dropIndicatorPositionSV.value = indicatorPos;
        int.dropIndicatorGenSV.value++;
        lastIndicatorSlotRef.current =
          displayIdx >= 0 ? displayIdx : originalIndex;
      }
    },
    [
      int,
      keyExtractor,
      getItemSpan,
      numColumns,
      hoverDimsSV,
      renderDropIndicator,
      dropIndicatorPositionSV,
      dropIndicatorVisibleSV,
      estimatedItemSize,
    ]
  );

  // ── Auto-scroll interval ──
  const autoScrollRef = useRef<{
    interval: ReturnType<typeof setInterval>;
    direction: 'back' | 'forward';
  } | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current.interval);
      autoScrollRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(
    (direction: 'back' | 'forward') => {
      if (autoScrollRef.current?.direction === direction) return; // Already scrolling this way
      stopAutoScroll();

      const doScroll = () => {
        const containerMeas = int.containerMeasRef.current;
        if (!containerMeas) return;
        const containerSize = horizontal
          ? containerMeas.width
          : containerMeas.height;
        const jump = containerSize * 0.2;
        const current = int.scrollOffsetSV.value;
        const target =
          direction === 'back' ? Math.max(0, current - jump) : current + jump;
        (scrollAnimatedRef.current as any)?.scrollTo?.({
          [horizontal ? 'x' : 'y']: target,
          animated: true,
        });
      };

      doScroll(); // Immediate first jump
      const interval = setInterval(doScroll, 250);
      autoScrollRef.current = { interval, direction };
    },
    [int, horizontal, stopAutoScroll]
  );

  // Clean up auto-scroll interval on unmount
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  const onMonitorDragOver = useCallback(
    (eventData: DraxMonitorEventData) => {
      const containerMeas = int.containerMeasRef.current;
      if (!containerMeas) return;

      // Auto-scroll near edges — works for BOTH intra-list and cross-container drags.
      // Bounds check ensures only the list under the finger auto-scrolls.
      const absPos = eventData.dragAbsolutePosition;
      const isOverThisList =
        absPos.x >= containerMeas.x &&
        absPos.x <= containerMeas.x + containerMeas.width &&
        absPos.y >= containerMeas.y &&
        absPos.y <= containerMeas.y + containerMeas.height;

      if (isOverThisList) {
        const dragPos = horizontal ? absPos.x : absPos.y;
        const containerStart = horizontal ? containerMeas.x : containerMeas.y;
        const containerSize = horizontal
          ? containerMeas.width
          : containerMeas.height;
        const distFromStart = dragPos - containerStart;
        const distFromEnd = containerStart + containerSize - dragPos;
        const threshold = containerSize * 0.1;

        if (distFromStart < threshold && int.scrollOffsetSV.value > 0) {
          startAutoScroll('back');
        } else if (distFromEnd < threshold) {
          startAutoScroll('forward');
        } else {
          stopAutoScroll();
        }
      } else {
        stopAutoScroll();
      }

      // Slot detection + reorder — only for intra-list drag
      if (!int.isDraggingRef.current) return;
      // Skip if item left this column for cross-container (board handles the target)
      if (boardContext?.transferRef?.current) return;

      const dragKey = int.draggedKeySV.value;
      const workletHandlesShifts = numColumns === 1 && !!sortableWorkletConfig && !flexWrap;
      let targetSlot: number;
      let gridResult: ReturnType<typeof int.computeGridPositions> | null = null;



      if (workletHandlesShifts) {
        // Read slot from worklet SV. On the first 1-2 frames, this may be stale (initial 0).
        // Only update indicator if the worklet's slot matches a valid drag position change.
        // If the worklet slot equals the lastIndicatorSlot, skip (no change).
        // If the worklet slot differs but is the drag-start index, it's likely caught up — use it.
        targetSlot = int.currentSlotSV.value;
      } else {
        // JS handles slot detection + shifts (grids, or no worklet)
        const scrollOffset = int.scrollOffsetSV.value;
        const scOffset = int.scrollContainerOffsetRef.current;
        const contentX =
          absPos.x - containerMeas.x - scOffset.x + (horizontal ? scrollOffset : 0);
        const contentY =
          absPos.y - containerMeas.y - scOffset.y + (horizontal ? 0 : scrollOffset);
        targetSlot = int.getSlotFromPosition(contentX, contentY);
        if (targetSlot >= 0 && targetSlot !== int.currentSlotRef.current) {
          const prevSize = int.totalContentSizeRef.current;
          gridResult = int.recomputeShiftsForReorder(dragKey, targetSlot);
          int.currentSlotRef.current = targetSlot;
          // Re-render if content area grew (prevents clipping shifted items)
          if (int.totalContentSizeRef.current > prevSize) {
            updateVisibleCells(int.scrollOffsetSV.value);
            forceRender();
          }
        }
      }

      // Update drop indicator for BOTH paths (worklet can't update React components)
      if (workletHandlesShifts) {
        // Show indicator at drag-start position first, then update on real slot changes.
        // currentSlotSV may be stale (0) for 1-2 frames after drag start — skip those.
        if (!dropIndicatorVisibleSV.value) {
          // First time: just show at the position already set in onMonitorDragStart
          dropIndicatorVisibleSV.value = true;
        } else if (targetSlot !== lastIndicatorSlotRef.current) {
          lastIndicatorSlotRef.current = targetSlot;
          if (renderDropIndicator) {
            const keys = int.orderedKeysSV.value;
            const heights = int.itemHeightsSV.value;
            const hoverDims = hoverDimsSV.value;
            let cursor = 0;
            for (let i = 0; i < keys.length; i++) {
              if (i === targetSlot) break;
              cursor += heights[keys[i]!] ?? estimatedItemSize;
            }
            const posX = horizontal ? cursor : 0;
            const posY = horizontal ? 0 : cursor;
            dropIndicatorPositionSV.value = { x: posX, y: posY };
            dropIndicatorVisibleSV.value = true;
            const dataIdx = int.keyToIndexRef.current.get(dragKey);
            const item =
              dataIdx !== undefined ? int.dataRef.current[dataIdx] : undefined;
            if (item) {
              const dims = int.itemDimensionsRef.current.get(dragKey);
              dropIndicatorInfoRef.current = {
                item: item as T,
                index: targetSlot,
                width: dims?.width ?? 0,
                height: dims?.height ?? estimatedItemSize,
                isCrossContainer: false,
                isSource: true,
                horizontal,
                hoverWidth: hoverDims.x,
                hoverHeight: hoverDims.y,
                sourceListId: int.id,
                targetListId: int.id,
                fromIndex: int.dragStartIndexRef.current,
              };
            }
          }
        }
      } else if (gridResult && renderDropIndicator) {
        // JS path: reuse gridResult
        const draggedKey = int.orderedKeysRef.current[targetSlot];
        if (draggedKey) {
          const pos = gridResult.positions.get(draggedKey);
          const dim = gridResult.dimensions.get(draggedKey);
          if (pos) {
            const hoverDims = hoverDimsSV.value;
            dropIndicatorPositionSV.value = pos;
            dropIndicatorVisibleSV.value = true;
            const dataIdx = int.keyToIndexRef.current.get(dragKey);
            const item =
              dataIdx !== undefined ? int.dataRef.current[dataIdx] : undefined;
            if (item) {
              dropIndicatorInfoRef.current = {
                item: item as T,
                index: targetSlot,
                width: dim?.width ?? 0,
                height: dim?.height ?? estimatedItemSize,
                isCrossContainer: false,
                isSource: true,
                horizontal,
                hoverWidth: hoverDims.x,
                hoverHeight: hoverDims.y,
                sourceListId: int.id,
                targetListId: int.id,
                fromIndex: int.dragStartIndexRef.current,
              };
            }
          }
        }
      }
    },
    [
      int,
      horizontal,
      startAutoScroll,
      stopAutoScroll,
      updateVisibleCells,
      renderDropIndicator,
      dropIndicatorPositionSV,
      dropIndicatorVisibleSV,
      estimatedItemSize,
    ]
  );

  const handleDragEnd = useCallback((): DraxProtocolDragEndResponse => {
    stopAutoScroll();

    // During cross-container transfer, board handles snap target
    if (boardContext?.transferRef?.current) {
      return; // void — let board's snap target stand
    }

    if (!int.isDraggingRef.current) return;

    const dragKey = int.draggedKeySV.value;
    const basePos = int.basePositionsRef.current.get(dragKey);
    const containerMeas = int.containerMeasRef.current;

    if (basePos && containerMeas) {
      let visualX: number;
      let visualY: number;
      // O(1) snap target: read from cache (JS path) or SV (worklet path).
      // JS recomputeShiftsForReorder writes snapTargetPositionRef.
      // Worklet recomputeShiftsWorklet writes snapTargetSV via useDragGesture.
      const cachedJS = int.snapTargetPositionRef.current;
      const cachedWorklet = sortableWorkletConfig ? int.snapTargetSV.value : null;
      if (cachedJS) {
        // JS path (grids): target cached in recomputeShiftsForReorder
        visualX = cachedJS.x;
        visualY = cachedJS.y;
      } else if (cachedWorklet && cachedWorklet.x >= 0) {
        // Worklet path (single-column): target cached in useDragGesture onUpdate
        // Sentinel {-1,-1} means worklet hasn't computed a reorder yet
        visualX = cachedWorklet.x;
        visualY = cachedWorklet.y;
      } else {
        // No reorder — visual position = base + permanent shift
        visualX = basePos.x;
        visualY = basePos.y;
      }

      const scOffset = int.scrollContainerOffsetRef.current;
      const scrollOff = int.scrollOffsetSV.value;
      const snapX = containerMeas.x + scOffset.x + visualX - (horizontal ? scrollOff : 0);
      const snapY = containerMeas.y + scOffset.y + visualY - (horizontal ? 0 : scrollOff);
      return { x: snapX, y: snapY };
    }

    return DraxSnapbackTargetPreset.Default;
  }, [int, stopAutoScroll, boardContext, horizontal, sortableWorkletConfig]);

  const onMonitorDragEnd = useCallback(
    (_eventData: DraxMonitorEndEventData): DraxProtocolDragEndResponse => {
      return handleDragEnd();
    },
    [handleDragEnd]
  );

  const onMonitorDragDrop = useCallback(
    (_eventData: DraxMonitorDragDropEventData): DraxProtocolDragEndResponse => {
      return handleDragEnd();
    },
    [handleDragEnd]
  );

  // ── onSnapEnd: the proper commit point (called by DraxView after snap animation) ──
  const handleSnapEnd = useCallback(
    (snapData: DraxSnapEndEventData) => {
      // Skip stale snap from a previous drag (new drag already started).
      // draggedIdSV = current dragged view (set by new gesture's onActivate).
      // snapData.dragged.id = the view that initiated THIS snap.
      // If they differ, a new drag owns the state — don't commit stale data.
      const currentDragId = draggedIdSV.value;
      if (currentDragId !== '' && currentDragId !== snapData.dragged.id) {
        // Prevent onSnapComplete from clearing the CURRENT drag's hover.
        hoverClearDeferredRef.current = true;
        dropIndicatorVisibleSV.value = false;
        dropIndicatorInfoRef.current = undefined;
        return;
      }

      // Hide drop indicator + clear stale info — snap animation is complete.
      dropIndicatorVisibleSV.value = false;
      dropIndicatorInfoRef.current = undefined;

      // Cross-container transfer — board handles finalization
      if (boardContext?.transferRef?.current) {
        const fromIdx = int.dragStartIndexRef.current;
        const fromItem = int.dataRef.current[fromIdx];
        boardContext.commitTransfer();
        if (updateVisibleCells(int.scrollOffsetSV.value)) forceRender();
        if (fromItem !== undefined) {
          onDragEndProp?.({ index: fromIdx, item: fromItem as T, toIndex: fromIdx, cancelled: false });
        }
        return;
      }

      // Normal intra-column reorder
      if (!int.isDraggingRef.current) return;
      const fromIdx = int.dragStartIndexRef.current;
      const toIdx = int.currentSlotRef.current;
      const fromItem = int.dataRef.current[fromIdx];
      // Only sync from worklet when it handled slot detection (single-column lists).
      // For grids (numColumns > 1), JS handled slot detection — orderedKeysRef is already correct.
      if (numColumns === 1 && sortableWorkletConfig) {
        int.syncWorkletToRefs();
      }
      int.commitReorder();
      // After commitReorder, keyToIndexRef has the new order but existing cell bindings
      // still have OLD dataIndex values. Re-set all bindings so CellSlot re-renders
      // with correct dataIndex → correct item content.
      const store = cellStoreRef.current;
      for (const [ik, ck] of bindingMapRef.current) {
        const bd = computeCellBindingData(ik);
        if (bd) store.setBinding(ck, bd);
      }
      if (updateVisibleCells(int.scrollOffsetSV.value)) forceRender();
      if (fromItem !== undefined) {
        onDragEndProp?.({ index: fromIdx, item: fromItem as T, toIndex: toIdx, cancelled: false });
      }
    },
    [int, updateVisibleCells, boardContext, dropIndicatorVisibleSV]
  );

  // ── Render ──
  // Sync totalSizeSV from ref (no React re-render needed for height changes)
  const currentTotalSize =
    int.totalContentSizeRef.current ||
    (numColumns > 1
      ? Math.ceil(data.length / numColumns) * estimatedItemSize
      : data.length * estimatedItemSize);
  // Sync totalSizeSV outside render (useEffect) to avoid "Reading from value during render" warning.
  useEffect(() => { totalSizeSV.value = currentTotalSize; }, [currentTotalSize, totalSizeSV]);
  const containerWidth = int.containerWidthRef.current;

  // Read cross-axis alignment from contentContainerStyle.alignItems.
  const itemAlignSelf = useMemo(() => {
    const flat = contentContainerStyle
      ? StyleSheet.flatten(contentContainerStyle)
      : undefined;
    return (flat?.alignItems ?? 'stretch') as
      | 'flex-start'
      | 'center'
      | 'flex-end'
      | 'stretch';
  }, [contentContainerStyle]);

  const fillStyle = !flexWrap && getItemSpan && numColumns > 1 ? { flex: 1 } : undefined;

  // Update stablePropsRef every render (before children render).
  // CellSlot reads this via ref — memo on CellSlot is never busted by prop identity.
  stablePropsRef.current = {
    dataRef: int.dataRef as RefObject<unknown[]>,
    renderItemRef: int.renderItemRef as RefObject<(info: { item: unknown; index: number }) => ReactNode>,
    draggedKeySV: int.draggedKeySV,
    hoverReadySV,
    skipShiftAnimationSV: int.skipShiftAnimationSV,
    springConfig: cellSpringConfig,
    shiftDuration: resolvedAnimConfig.shiftDuration,
    inactiveItemStyle,
    registerCellBase: int.registerCellBase,
    unregisterCellBase: int.unregisterCellBase,
    registerCellShift: int.registerCellShift,
    unregisterCellShift: int.unregisterCellShift,
    dragHandle,
    longPressDelay,
    itemDraxViewProps: itemDraxViewProps as Record<string, unknown> | undefined,
    lockDragX: !!(lockToMainAxis && !horizontal),
    lockDragY: !!(lockToMainAxis && horizontal),
    handleSnapEnd,
    sortableWorkletConfig,
    fillStyle,
    horizontal,
    skipMeasurement: !!getItemSize,
    itemAlignSelf,
    handleItemLayout,
    cellLastHeightRef,
    basePositionsRef: int.basePositionsRef as RefObject<Map<string, import('./types').Position>>,
  };

  return (
    <DraxView
      id={int.id}
      isParent
      monitoring
      onMeasure={(meas) => {
        if (meas) int.containerMeasRef.current = meas;
      }}
      onMonitorDragStart={onMonitorDragStart}
      onMonitorDragOver={onMonitorDragOver}
      onMonitorDragEnd={onMonitorDragEnd}
      onMonitorDragDrop={onMonitorDragDrop}
      style={style}
    >
      <Reanimated.ScrollView
        ref={scrollAnimatedRef}
        horizontal={horizontal}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle}
      >
        {ListHeaderComponent}
        {data.length === 0 && ListEmptyComponent}
        {data.length > 0 && !itemsMeasuredRef.current && ListLoadingComponent}
        {data.length > 0 && containerWidth > 0 && (
          <Reanimated.View
            style={[contentContainerStyle, contentContainerAnimStyle]}
          >
            {activeCellKeysRef.current.map((cellKey) => (
              <CellSlot
                key={cellKey}
                cellKey={cellKey}
                store={cellStoreRef.current}
                sp={stablePropsRef}
              />
            ))}
          </Reanimated.View>
        )}
        {ListFooterComponent}
      </Reanimated.ScrollView>

      {/* Drop indicator — rendered outside ScrollView, positioned absolutely */}
      {renderDropIndicator && (
        <DropIndicatorOverlay
          positionSV={dropIndicatorPositionSV}
          visibleSV={dropIndicatorVisibleSV}
          dragGenSV={int.dropIndicatorGenSV}
          scrollOffsetSV={int.scrollOffsetSV}
          horizontal={horizontal}
          animConfig={resolvedAnimConfig}
          info={dropIndicatorInfoRef.current}
          itemAlignSelf={itemAlignSelf}
          renderDropIndicator={renderDropIndicator}
        />
      )}
    </DraxView>
  );
};

/** Animated drop indicator overlay */
const DropIndicatorOverlay = <T,>({
  positionSV,
  visibleSV,
  dragGenSV,
  scrollOffsetSV,
  horizontal,
  animConfig,
  info,
  itemAlignSelf,
  renderDropIndicator,
}: {
  positionSV: ReturnType<typeof useSharedValue<{ x: number; y: number }>>;
  visibleSV: ReturnType<typeof useSharedValue<boolean>>;
  dragGenSV: ReturnType<typeof useSharedValue<number>>;
  scrollOffsetSV: ReturnType<typeof useSharedValue<number>>;
  horizontal: boolean;
  animConfig: import('./params').ResolvedAnimationConfig;
  info: DropIndicatorInfo<T> | undefined;
  itemAlignSelf: string;
  renderDropIndicator: (info: DropIndicatorInfo<T>) => ReactNode;
}) => {
  const isHoriz = horizontal;
  // Snap on new drag (gen changed), spring between slots within same drag.
  // Fixes stale-position travel when consecutive drags happen within same frame.
  const lastSeenGenSV = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const pos = positionSV.value;
    const visible = visibleSV.value;
    const scroll = scrollOffsetSV.value;
    const gen = dragGenSV.value;

    const rawLeft = isHoriz ? pos.x - scroll : pos.x;
    const rawTop = isHoriz ? pos.y : pos.y - scroll;

    // Snap on new drag (generation changed), spring between slots within same drag
    const isNewDrag = gen !== lastSeenGenSV.value;
    if (isNewDrag) lastSeenGenSV.value = gen;

    if (!visible) {
      return {
        position: 'absolute' as const,
        left: 0,
        top: 0,
        transform: [{ translateX: rawLeft }, { translateY: rawTop }],
        opacity: 0,
        pointerEvents: 'none' as const,
      };
    }

    const springConfig =
      !isNewDrag && animConfig.useSpring
        ? {
            damping: animConfig.springDamping,
            stiffness: animConfig.springStiffness,
            mass: animConfig.springMass,
          }
        : undefined;

    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      transform: [
        { translateX: springConfig ? withSpring(rawLeft, springConfig) : rawLeft },
        { translateY: springConfig ? withSpring(rawTop, springConfig) : rawTop },
      ],
      opacity: 1,
      pointerEvents: 'none' as const,
    };
  });

  // Don't return null — visibleSV controls opacity. If info is undefined,
  // render an empty animated view (invisible via opacity 0).
  // Width + alignItems match the cell layout so the ghost card centers correctly.
  const overlayLayout = info
    ? {
        width: info.width,
        alignItems: itemAlignSelf as
          | 'flex-start'
          | 'center'
          | 'flex-end'
          | 'stretch',
      }
    : undefined;

  if (!info) return <Reanimated.View style={style} />;

  return (
    <Reanimated.View style={[style, overlayLayout]}>
      {renderDropIndicator(info)}
    </Reanimated.View>
  );
};
