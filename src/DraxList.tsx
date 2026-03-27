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
import { runOnJS, runOnUI } from 'react-native-worklets';

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
  /** Gap between grid cells in pixels. @default 0 */
  gridGap?: number;
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
}

/** Cell binding: which cell shows which item (dataIndex looked up at render time) */
interface CellBinding {
  cellKey: string;
  itemKey: string;
}

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
    drawDistance = 250,
    animationConfig = 'default',
    longPressDelay = 250,
    lockToMainAxis,
    reorderStrategy,
    dragHandle,
    getItemSpan,
    gridGap,
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
  } = props;

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
   
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
  const sortableWorkletConfig = useMemo(
    () => ({
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
    [int, numColumns, horizontal, estimatedItemSize, reorderStrategy]
  );

  // ── Cell pool (refs only) ──
  const cellBindingsRef = useRef<CellBinding[]>([]);
  const freeCellsRef = useRef<string[]>([]);
  const bindingMapRef = useRef<Map<string, string>>(new Map()); // itemKey → cellKey
  const visibleKeysRef = useRef(new Set<string>()); // Reused across scroll ticks (no allocation)
  const nextCellIdRef = useRef(0);

  const lastIndicatorSlotRef = useRef(-1); // Track indicator's last-set slot (avoids worklet/JS SV race)
  const itemsMeasuredRef = useRef(false); // True after first item measurement cycle — prevents FOUC

  // ── Container layout ──
  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      const cw = horizontal ? height : width;
      int.containerWidthRef.current = cw;
      int.recomputeBasePositionsAndClearShifts();
      // Rebind cells with new positions (grid positions change after container measured)
      updateVisibleCells(int.scrollOffsetSV.value);
      forceRender();
    },
    [horizontal, int]
  );

  // ── Scroll handling ──
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y;

      runOnUI((_sv: typeof int.scrollOffsetSV, _v: number) => {
        'worklet';
        _sv.value = _v;
      })(int.scrollOffsetSV, offset);

      // Rebind cells for new visible range
      updateVisibleCells(offset);
      onScrollProp?.(event);
    },
    [horizontal, int.scrollOffsetSV, onScrollProp]
  );

  // ── Item measurement ──
  const handleItemLayout = useCallback(
    (itemKey: string, height: number) => {
      const current = int.itemHeightsRef.current.get(itemKey);
      const changed = current === undefined || Math.abs(current - height) > 0.5;
      if (changed) {
        int.itemHeightsRef.current.set(itemKey, height);
        itemsMeasuredRef.current = true; // At least one real measurement — positions will be correct
        if (int.isDraggingRef.current) {
          // Sync to worklet so recomputeShiftsWorklet uses actual measurements
          // (not stale estimatedItemSize from drag-start snapshot)
          int.itemHeightsSV.value = {
            ...int.itemHeightsSV.value,
            [itemKey]: height,
          };
        } else if (Object.keys(int.shiftsSV.value).length === 0) {
          int.recomputeBasePositions();
          forceRender();
        }
      }
    },
    [int]
  );

  // ── Cell recycler ──
  const updateVisibleCells = useCallback(
    (scrollOffset: number) => {
      const keys = int.orderedKeysRef.current;
      const heights = int.itemHeightsRef.current;
      const viewportSize = horizontal
        ? (int.containerMeasRef.current?.width ?? screenWidth)
        : (int.containerMeasRef.current?.height ?? screenHeight);
      const buffer = drawDistance;
      const visibleStart = scrollOffset - buffer;
      const visibleEnd = scrollOffset + viewportSize + buffer;

      // Find visible items using visual positions (base + shift).
      const basePositions = int.basePositionsRef.current;
      const shifts = int.shiftsSV.value;
      visibleKeysRef.current.clear();
      const visibleKeys = visibleKeysRef.current;
      let missingBaseCount = 0;
      for (const key of keys) {
        const basePos = basePositions.get(key);
        if (!basePos) {
          missingBaseCount++;
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
          const h = heights.get(key) ?? estimatedItemSize;
          const visualY = basePos.y + (shift?.y ?? 0);
          if (visualY + h >= visibleStart && visualY <= visibleEnd)
            visibleKeys.add(key);
        }
      }
      if (missingBaseCount > 0) {
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
      for (const itemKey of visibleKeys) {
        if (!currentMap.has(itemKey)) {
          let cellKey: string;
          if (freeCellsRef.current.length > 0) {
            cellKey = freeCellsRef.current.pop()!;
          } else {
            cellKey = `cell-${nextCellIdRef.current++}`;
          }
          currentMap.set(itemKey, cellKey);
          changed = true;
        }
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
    ]
  );

  // ── Initial binding + data sync ──
  useLayoutEffect(() => {
    // Cross-container: new items arrived — recompute positions + clear shifts atomically.
    // Skip animation so cells snap to final positions (no spring-back artifact).
    if (int.pendingShiftClearRef.current) {
      int.pendingShiftClearRef.current = false;
      int.skipShiftAnimationSV.value = true;
      int.recomputeBasePositionsAndClearShifts();
      // Hide indicator + clear stale info — transfer complete. Clean state for next drag.
      // Without this, the board's info (from cross-container drag) persists and flashes
      // when the next drag in this column sets visible=true before re-render.
      dropIndicatorVisibleSV.value = false;
      dropIndicatorInfoRef.current = undefined;
    }
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
      runOnUI(
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
          runOnJS(_setHoverContent)(null);
        }
      )(
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
      // draggedKeySV (immediate) and hoverReadySV (async via runOnUI), making the
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
      const workletHandlesShifts = numColumns === 1 && !!sortableWorkletConfig;
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
        const contentX =
          absPos.x - containerMeas.x + (horizontal ? scrollOffset : 0);
        const contentY =
          absPos.y - containerMeas.y + (horizontal ? 0 : scrollOffset);
        targetSlot = int.getSlotFromPosition(contentX, contentY);
        if (targetSlot !== int.currentSlotRef.current) {
          gridResult = int.recomputeShiftsForReorder(dragKey, targetSlot);
          int.currentSlotRef.current = targetSlot;
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
      // For single-column (worklet path): compute from worklet's orderedKeysSV (most up-to-date)
      // For grids (JS path): compute from JS shiftsSV (worklet didn't handle slot detection)
      let visualX: number;
      let visualY: number;
      if (numColumns === 1) {
        const keys = int.orderedKeysSV.value;
        const heights = int.itemHeightsSV.value;
        let cursor = 0;
        for (const key of keys) {
          if (key === dragKey) break;
          cursor += heights[key] ?? estimatedItemSize;
        }
        visualX = horizontal ? cursor : basePos.x;
        visualY = horizontal ? basePos.y : cursor;
      } else {
        const shift = int.shiftsSV.value[dragKey];
        visualX = basePos.x + (shift?.x ?? 0);
        visualY = basePos.y + (shift?.y ?? 0);
      }

      return {
        x:
          containerMeas.x +
          visualX -
          (horizontal ? int.scrollOffsetSV.value : 0),
        y:
          containerMeas.y +
          visualY -
          (horizontal ? 0 : int.scrollOffsetSV.value),
      };
    }

    return DraxSnapbackTargetPreset.Default;
  }, [int, stopAutoScroll, boardContext, horizontal]);

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
        {data.length > 0 && containerWidth > 0 && (
          <View
            style={[
              contentContainerStyle,
              horizontal
                ? { width: totalSize, height: '100%' }
                : { height: totalSize, width: '100%' },
              // Hide until items have measured — prevents FOUC from estimated positions
              !itemsMeasuredRef.current && { opacity: 0 },
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
              const dims = int.itemDimensionsRef.current.get(itemKey);
              // Vertical: cell fills column width (users center via alignSelf on their card)
              // Horizontal: cell auto-sizes to content (primary axis measurement)
              // Grid: use computed dimensions
              const itemCellWidth = horizontal
                ? undefined // auto-size for primary axis measurement
                : (dims?.width ?? cellWidthForGrid); // fill column
              const itemCellHeight = horizontal
                ? cellWidthForGrid // fill row height
                : getItemSpan
                  ? dims?.height
                  : undefined;
              // flex:1 only for mixed-size grids (getItemSpan provided)
              const fillStyle = getItemSpan ? { flex: 1 } : undefined;

              return (
                <RecycledCell
                  key={cellKey}
                  baseX={basePos.x}
                  baseY={basePos.y}
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
                    <View
                      style={fillStyle}
                      onLayout={(e) => {
                        // Primary axis from outer wrapper (fills cell)
                        const primary = horizontal
                          ? e.nativeEvent.layout.width
                          : e.nativeEvent.layout.height;
                        handleItemLayout(itemKey, primary);
                      }}
                    >
                      <View
                        style={{ alignSelf: itemAlignSelf }}
                        onLayout={(e) => {
                          // Cross-axis from inner wrapper (doesn't stretch — card's natural size)
                          const cross = horizontal
                            ? e.nativeEvent.layout.height
                            : e.nativeEvent.layout.width;
                          int.itemCrossAxisRef.current.set(itemKey, cross);
                        }}
                      >
                        {renderItem({ item, index: dataIndex })}
                      </View>
                    </View>
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
        left: rawLeft,
        top: rawTop,
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
      left: springConfig ? withSpring(rawLeft, springConfig) : rawLeft,
      top: springConfig ? withSpring(rawTop, springConfig) : rawTop,
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
