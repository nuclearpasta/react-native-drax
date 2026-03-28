/**
 * DraxList — Custom recycling list with built-in drag-and-drop.
 *
 * ZERO internal React state. All data in refs + SharedValues.
 * Cell recycling via stable React keys (native views never unmount).
 * Positioning via absolute left/top + Reanimated shift offsets.
 *
 * No FlatList. No Fabric/Reanimated race. No blink.
 */
import type { ReactNode } from 'react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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

/** Cell binding: which cell shows which item (dataIndex looked up at render time) */
interface CellBinding {
  cellKey: string;
  itemKey: string;
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

  const scrollRef = useRef<any>(null);

  // ── Single re-render trigger (the ONLY thing that causes re-render) ──
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

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

  // Register renderItem + forceRender so board can trigger re-renders on any column
  int.renderItemRef.current = renderItem as (info: any) => ReactNode;
  int.forceRenderRef.current = forceRender;

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
      draggedKeySV: int.draggedKeySV,
      dropIndicatorPositionSV: int.dropIndicatorPositionSV,
      scrollOffsetSV: int.scrollOffsetSV,
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
  const cellBindingsRef = useRef<CellBinding[]>([]);
  const freeCellsRef = useRef<string[]>([]);
  const cellLastHeightRef = useRef<Map<string, number>>(new Map()); // cellKey → last measured height
  const bindingMapRef = useRef<Map<string, string>>(new Map()); // itemKey → cellKey
  const visibleKeysRef = useRef(new Set<string>()); // Reused across scroll ticks (no allocation)
  const nextCellIdRef = useRef(0);

  const lastIndicatorSlotRef = useRef(-1); // Track indicator's last-set slot (avoids worklet/JS SV race)
  const itemsMeasuredRef = useRef(false); // True after first item measurement cycle — prevents FOUC

  // ── Scroll perf refs ──
  const lastProcessedOffsetRef = useRef(0); // For scroll delta threshold (only updates on threshold crossings)
  const lastScrollOffsetRef = useRef(0); // Actual last scroll offset (for velocity — updates every event)
  const lastScrollTimeRef = useRef(0); // For velocity tracking
  const scrollVelocityRef = useRef(0); // px/ms — positive = scrolling forward
  // ── Container layout ──
  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height, x, y } = event.nativeEvent.layout;
      const cw = horizontal ? height : width;
      int.containerWidthRef.current = cw;
      // ScrollView's offset within the monitoring DraxView (accounts for padding)
      int.scrollContainerOffsetRef.current = { x, y };
      int.recomputeBasePositionsAndClearShifts();
      // Reset scroll delta tracking (positions just changed)
      lastProcessedOffsetRef.current = int.scrollOffsetSV.value;
      // Rebind cells with new positions (grid positions change after container measured)
      updateVisibleCells(int.scrollOffsetSV.value);
      forceRender();
    },
    [horizontal, int]
  );

  // ── Scroll handling ──
  const SCROLL_DELTA_THRESHOLD = 4; // px — skip updateVisibleCells if scroll moved less than this
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y;

      // Always sync scrollOffset to UI thread (worklet needs accurate offset for slot detection)
      scheduleOnUI((_sv: typeof int.scrollOffsetSV, _v: number) => {
        'worklet';
        _sv.value = _v;
      }, int.scrollOffsetSV, offset);

      // Track scroll velocity for asymmetric buffer distribution.
      // Uses actual last scroll offset (not lastProcessedOffset which only updates on threshold).
      const now = Date.now();
      const dt = now - lastScrollTimeRef.current;
      if (dt > 0 && dt < 500) {
        scrollVelocityRef.current = (offset - lastScrollOffsetRef.current) / dt;
      }
      lastScrollOffsetRef.current = offset;
      lastScrollTimeRef.current = now;

      // Skip visible cell recalculation if scroll delta below threshold.
      // drawDistance buffer (3x viewport) makes this safe.
      if (Math.abs(offset - lastProcessedOffsetRef.current) >= SCROLL_DELTA_THRESHOLD) {
        lastProcessedOffsetRef.current = offset;
        updateVisibleCells(offset);
      }

      onScrollProp?.(event);
    },
    [horizontal, int.scrollOffsetSV, onScrollProp]
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
        forceRender();
      }
    },
    [int]
  );

  // ── Cell recycler ──
  const updateVisibleCells = useCallback(
    (scrollOffset: number) => {
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
      let changed = false;

      // Unbind (but never free the dragged item's cell)
      const dragKey = int.draggedKeySV.value;
      for (const [itemKey, cellKey] of currentMap.entries()) {
        if (!visibleKeys.has(itemKey) && itemKey !== dragKey) {
          currentMap.delete(itemKey);
          freeCellsRef.current.push(cellKey);
          changed = true;
        }
      }

      // Bind
      let proactiveMeasured = false;
      for (const itemKey of visibleKeys) {
        if (!currentMap.has(itemKey)) {
          let cellKey: string;
          if (freeCellsRef.current.length > 0) {
            cellKey = freeCellsRef.current.pop()!;
            // Proactive measurement: use cell's last known height for the new item.
            // If the height matches (same-size item recycled), position is correct
            // immediately with no onLayout wait. If different, onLayout corrects in 1 frame.
            const cellHeight = cellLastHeightRef.current.get(cellKey);
            if (cellHeight !== undefined && !int.itemHeightsRef.current.has(itemKey)) {
              int.recordItemHeight(itemKey, cellHeight);
              proactiveMeasured = true;
            }
          } else {
            cellKey = `cell-${nextCellIdRef.current++}`;
          }
          currentMap.set(itemKey, cellKey);
          changed = true;
        }
      }

      // Recompute positions if proactive measurements changed any heights.
      // Without this, items stay at estimated positions when proactive height
      // matches actual (onLayout won't fire → handleItemLayout won't recompute).
      if (proactiveMeasured) {
        int.recomputeBasePositions();
      }

      if (changed) {
        const newBindings: CellBinding[] = [];
        for (const [itemKey, cellKey] of currentMap.entries()) {
          newBindings.push({ cellKey, itemKey });
        }
        cellBindingsRef.current = newBindings;
        forceRender();
      }
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
    ]
  );

  // ── Initial binding + data sync ──
  useLayoutEffect(() => {
    // Cross-container: new items arrived — recompute positions + clear shifts atomically.
    // Skip animation so cells snap to final positions (no spring-back artifact).
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

    // Echo: parent echoed back our committed reorder. Bases + shifts already handled above.
    // Skip updateVisibleCells (bindings unchanged) + forceRender (main perf win).
    const isEcho = int.echoSkipRef.current;
    int.echoSkipRef.current = false;
    if (isEcho) return;

    // Reset scroll delta tracking (positions/data just changed)
    lastProcessedOffsetRef.current = int.scrollOffsetSV.value;
    updateVisibleCells(int.scrollOffsetSV.value);

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
      }
    }

    forceRender();
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

      // Find display index
      const keys = int.orderedKeysRef.current;
      const displayIdx = keys.indexOf(itemKey);
      int.currentSlotRef.current = displayIdx >= 0 ? displayIdx : originalIndex;

      // Freeze slot boundaries for stable detection
      int.freezeSlotBoundaries();

      // Pre-populate drop indicator info + position for when first dragOver shows it.
      // DON'T set visible or forceRender here — that causes a race between
      // draggedKeySV (immediate) and hoverReadySV (async via scheduleOnUI), making the
      // cell flash visible for 1-2 frames before hover is ready.
      // The first onMonitorDragOver slot change will set visible + trigger re-render.
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
        const result = int.computeGridPositions(int.orderedKeysRef.current);
        const indicatorPos = result.positions.get(itemKey);
        if (indicatorPos) dropIndicatorPositionSV.value = indicatorPos;
        int.dropIndicatorGenSV.value++;
        // DON'T set visible here — let onMonitorDragOver show it after the first real slot detection.
        // Setting visible here + the worklet's stale currentSlotSV causes the indicator to flash at (0,0).
        lastIndicatorSlotRef.current =
          displayIdx >= 0 ? displayIdx : originalIndex;
        // No forceRender() — that causes a race with hoverReadySV.
        // The overlay shows empty (no info prop yet) but at correct position + opacity.
        // First onMonitorDragOver slot change will trigger a natural re-render with info.
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
        scrollRef.current?.scrollTo?.({
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
      if (numColumns === 1 && !flexWrap) {
        // Single-column: compute target position by walking the reordered keys.
        // Use the SAME height sources as computeGridPositions to ensure consistency:
        // measured height > getItemSize > running average > estimatedItemSize.
        const keys = int.orderedKeysSV.value;
        const heights = int.itemHeightsSV.value;
        const avgH = int.measuredAvgHeightRef?.current ?? estimatedItemSize;
        const sizeFn = getItemSize;
        const dataArr = int.dataRef.current;
        const keyMap = int.keyToIndexRef.current;
        let cursor = 0;
        for (const key of keys) {
          if (key === dragKey) break;
          let h = heights[key];
          if (h === undefined && sizeFn) {
            const idx = keyMap.get(key);
            if (idx !== undefined && dataArr[idx] !== undefined) {
              h = horizontal ? sizeFn(dataArr[idx] as T, idx).width : sizeFn(dataArr[idx] as T, idx).height;
            }
          }
          if (h === undefined) h = avgH;
          cursor += h;
        }
        visualX = horizontal ? cursor : basePos.x;
        visualY = horizontal ? basePos.y : cursor;
      } else {
        const shift = int.shiftsSV.value[dragKey];
        visualX = basePos.x + (shift?.x ?? 0);
        visualY = basePos.y + (shift?.y ?? 0);
      }

      const scOffset = int.scrollContainerOffsetRef.current;
      const scrollOff = int.scrollOffsetSV.value;
      const snapX = containerMeas.x + scOffset.x + visualX - (horizontal ? scrollOff : 0);
      const snapY = containerMeas.y + scOffset.y + visualY - (horizontal ? 0 : scrollOff);
      return { x: snapX, y: snapY };
    }

    return DraxSnapbackTargetPreset.Default;
  }, [int, stopAutoScroll, boardContext, horizontal, numColumns, flexWrap, estimatedItemSize]);

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
        updateVisibleCells(int.scrollOffsetSV.value);
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
      updateVisibleCells(int.scrollOffsetSV.value);
      if (fromItem !== undefined) {
        onDragEndProp?.({ index: fromIdx, item: fromItem as T, toIndex: toIdx, cancelled: false });
      }
    },
    [int, updateVisibleCells, boardContext, dropIndicatorVisibleSV]
  );

  // ── Render ──
  const bindings = cellBindingsRef.current;
  const totalSize =
    int.totalContentSizeRef.current ||
    (numColumns > 1
      ? Math.ceil(data.length / numColumns) * estimatedItemSize
      : data.length * estimatedItemSize);
  const containerWidth = int.containerWidthRef.current;
  const cellWidthForGrid =
    containerWidth > 0
      ? numColumns > 1
        ? containerWidth / numColumns
        : containerWidth
      : undefined;

  // Read cross-axis alignment from contentContainerStyle.alignItems.
  // Applied to inner wrapper — handles centering + correct cross-axis measurement.
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
      <ScrollView
        ref={scrollRef}
        horizontal={horizontal}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle}
        onLayout={handleContainerLayout}
      >
        {ListHeaderComponent}
        {data.length === 0 && ListEmptyComponent}
        {data.length > 0 && !itemsMeasuredRef.current && ListLoadingComponent}
        {data.length > 0 && containerWidth > 0 && (
          <View
            style={[
              contentContainerStyle,
              horizontal
                ? { width: totalSize, height: '100%' }
                : { height: totalSize, width: '100%' },
              // useLayoutEffect + measure() corrects positions before paint — no FOUC
            ]}
          >
            {bindings.map((binding) => {
              const { cellKey, itemKey } = binding;
              // Look up dataIndex at render time (always fresh from keyToIndexRef)
              const dataIndex = int.keyToIndexRef.current.get(itemKey);
              if (dataIndex === undefined) return null; // Key removed from data (cross-container)
              const item = int.dataRef.current[dataIndex];
              const basePos = int.basePositionsRef.current.get(itemKey);
              if (!item || !basePos) return null;
              // With useLayoutEffect + measure(), items render at estimated positions and
              // correct before paint (single commit). No need to hide at -10000.
              const isMeasured = true;
              const dims = int.itemDimensionsRef.current.get(itemKey);
              // Vertical: cell fills column width (users center via alignSelf on their card)
              // Horizontal: cell auto-sizes to content (primary axis measurement)
              // Grid: use computed dimensions
              const itemCellWidth = flexWrap
                ? dims?.width  // flex-wrap: exact item width from packFlex
                : horizontal
                  ? undefined // auto-size for primary axis measurement
                  : (dims?.width ?? cellWidthForGrid); // fill column
              const itemCellHeight = flexWrap
                ? dims?.height // flex-wrap: exact item height from packFlex
                : horizontal
                  ? cellWidthForGrid // fill row height
                  : getItemSpan
                    ? dims?.height
                    : undefined;
              // flex:1 for mixed-size grids (cells have explicit height from packGrid).
              // NOT for flex-wrap (items have their own natural size).
              const fillStyle = !flexWrap && getItemSpan && numColumns > 1 ? { flex: 1 } : undefined;

              return (
                <RecycledCell
                  key={cellKey}
                  baseX={isMeasured ? basePos.x : -10000}
                  baseY={isMeasured ? basePos.y : -10000}
                  cellWidth={itemCellWidth}
                  cellHeight={itemCellHeight}
                  itemKey={itemKey}
                  draggedKeySV={int.draggedKeySV}
                  hoverReadySV={hoverReadySV}
                  skipShiftAnimationSV={int.skipShiftAnimationSV}
                  springConfig={cellSpringConfig}
                  shiftDuration={resolvedAnimConfig.shiftDuration}
                  inactiveItemStyle={inactiveItemStyle}
                  registerCellShift={int.registerCellShift}
                  unregisterCellShift={int.unregisterCellShift}
                >
                  <DraxView
                    draggable
                    dragHandle={dragHandle}
                    longPressDelay={longPressDelay}
                    {...itemDraxViewProps}
                    lockDragXPosition={lockToMainAxis && !horizontal}
                    lockDragYPosition={lockToMainAxis && horizontal}
                    payload={{ index: dataIndex, originalIndex: dataIndex }}
                    onSnapEnd={handleSnapEnd}
                    sortableWorklet={sortableWorkletConfig}
                    style={fillStyle}
                  >
                    <MeasuredContent
                      itemKey={itemKey}
                      cellKey={cellKey}
                      horizontal={horizontal}
                      skipMeasurement={!!getItemSize}
                      fillStyle={fillStyle}
                      alignSelf={itemAlignSelf}
                      onMeasure={handleItemLayout}
                      onCellHeight={cellLastHeightRef}
                    >
                      {renderItem({ item, index: dataIndex })}
                    </MeasuredContent>
                  </DraxView>
                </RecycledCell>
              );
            })}
          </View>
        )}
        {ListFooterComponent}
      </ScrollView>

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
