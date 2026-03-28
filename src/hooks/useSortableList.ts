/**
 * useSortableList — Core hook for DraxList's layout engine and reorder state.
 *
 * ZERO React state internally. All data in refs + SharedValues.
 * The only re-render trigger is the forceRender dispatch from DraxList
 * when cell bindings change.
 *
 * Position model:
 *   Visual position = basePosition (absolute left/top, React render)
 *                   + shiftOffset (SharedValue, Reanimated animation)
 *
 * During drag: base positions frozen, shifts animate items to reordered positions.
 * On commit: base positions update to match visual, shifts clear to 0.
 */
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import type {
  GridItemSpan,
  Position,
  SortableAnimationConfig,
  SortableReorderStrategy,
} from '../types';
import { packFlex, packGrid } from '../math';
import { useDraxId } from './useDraxId';

// ─── Public Types ─────────────────────────────────────────────────────

export interface SortableReorderEvent<T> {
  data: T[];
  fromIndex: number;
  toIndex: number;
  fromItem: T;
  toItem: T;
}

export interface UseSortableListOptions<T> {
  id?: string;
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (event: SortableReorderEvent<T>) => void;
  estimatedItemSize: number;
  horizontal?: boolean;
  numColumns?: number;
  reorderStrategy?: SortableReorderStrategy;
  longPressDelay?: number;
  lockToMainAxis?: boolean;
  animationConfig?: SortableAnimationConfig;
  drawDistance?: number;
  /** Returns grid span for each item. Enables mixed-size grid with packGrid. */
  getItemSpan?: (item: T, index: number) => GridItemSpan;
  /** Gap between grid cells in pixels. @default 0 */
  gridGap?: number;
  /** Enable flex-wrap layout mode. Items flow left-to-right and wrap to new rows. */
  flexWrap?: boolean;
  /** Returns pixel dimensions for each item. Required when flexWrap is true. */
  getItemSize?: (item: T, index: number) => { width: number; height: number };
}

export interface SortableListHandle<T> {
  _internal: SortableListInternal<T>;
}

/** Slot boundary entry captured at drag start */
interface SlotBoundary {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Internal state — consumed by DraxList and RecycledCell */
export interface SortableListInternal<T> {
  id: string;
  horizontal: boolean;
  numColumns: number;
  reorderStrategy: SortableReorderStrategy;
  longPressDelay: number;
  lockToMainAxis: boolean;
  animationConfig: SortableAnimationConfig;
  estimatedItemSize: number;
  drawDistance: number;

  // ── Refs (no re-renders) ──
  orderedKeysRef: React.RefObject<string[]>;
  /** Base positions (React props left/top — Yoga knows position for touch) */
  basePositionsRef: React.RefObject<Map<string, Position>>;
  itemHeightsRef: React.RefObject<Map<string, number>>;
  /** Running average of measured heights — used for unmeasured items in position computation. */
  measuredAvgHeightRef: React.RefObject<number>;
  /** Cross-axis measurements (width for vertical items, height for horizontal items) */
  itemCrossAxisRef: React.RefObject<Map<string, number>>;
  totalContentSizeRef: React.RefObject<number>;
  containerMeasRef: React.RefObject<{ x: number; y: number; width: number; height: number } | undefined>;
  /** ScrollView's position within the monitoring DraxView (accounts for padding). */
  scrollContainerOffsetRef: React.RefObject<Position>;
  containerWidthRef: React.RefObject<number>;
  dataRef: React.RefObject<T[]>;
  keyExtractorRef: React.RefObject<(item: unknown, index: number) => string>;
  keyToIndexRef: React.RefObject<Map<string, number>>;
  renderItemRef: React.RefObject<((info: any) => ReactNode) | undefined>;
  /** Per-item dimensions (for mixed-size grids) */
  itemDimensionsRef: React.RefObject<Map<string, { width: number; height: number }>>;
  getItemSpanRef: React.RefObject<((item: unknown, index: number) => GridItemSpan) | undefined>;
  /** Sorted array of item positions for binary search in updateVisibleCells (linear lists only). */
  sortedPositionsRef: React.RefObject<{ key: string; start: number; end: number }[]>;

  // ── SharedValues (UI thread animation) ──
  shiftsSV: ReturnType<typeof useSharedValue<Record<string, Position>>>;
  draggedKeySV: ReturnType<typeof useSharedValue<string>>;
  scrollOffsetSV: ReturnType<typeof useSharedValue<number>>;
  /** When true, cells snap shifts instantly (no spring/timing). Set during cross-container reset. */
  skipShiftAnimationSV: ReturnType<typeof useSharedValue<boolean>>;

  // ── Per-cell SharedValues (position + shift, zero React re-renders) ──
  registerCellBase: (key: string, sv: SharedValue<Position>) => void;
  unregisterCellBase: (key: string) => void;
  registerCellShift: (key: string, sv: SharedValue<Position>) => void;
  unregisterCellShift: (key: string) => void;
  pushBasePositionsToSVs: () => void;

  // ── Worklet-accessible SharedValues (for UI-thread slot detection) ──
  frozenBoundariesSV: SharedValue<{ key: string; x: number; y: number; width: number; height: number }[]>;
  orderedKeysSV: SharedValue<string[]>;
  basePositionsSV: SharedValue<Record<string, Position>>;
  itemHeightsSV: SharedValue<Record<string, number>>;
  currentSlotSV: SharedValue<number>;
  isDraggingSV: SharedValue<boolean>;
  containerMeasSV: SharedValue<{ x: number; y: number; width: number; height: number } | null>;
  cellShiftRecordSV: SharedValue<Record<string, SharedValue<Position>>>;
  syncRefsToWorklet: () => void;
  syncWorkletToRefs: () => void;
  syncPositionsToWorklet: () => void;
  cumulativeEndsSV: SharedValue<number[]>;
  getSlotFromPositionWorklet: (
    contentX: number, contentY: number,
    boundaries: { key: string; x: number; y: number; width: number; height: number }[],
    cumulativeEnds: number[],
    cols: number, horiz: boolean,
  ) => number;
  recomputeShiftsWorklet: (
    dragKey: string, targetSlot: number,
    keys: string[], basePosRecord: Record<string, Position>,
    heightsRecord: Record<string, number>,
    cellShiftRecord: Record<string, SharedValue<Position>>,
    estItemSize: number, horiz: boolean, strategy: string,
  ) => string[] | null;

  // ── Drop indicator ──
  dropIndicatorPositionSV: ReturnType<typeof useSharedValue<Position>>;
  dropIndicatorVisibleSV: ReturnType<typeof useSharedValue<boolean>>;
  /** Incremented on each drag start. Overlay snaps position on gen change, springs between slots. */
  dropIndicatorGenSV: ReturnType<typeof useSharedValue<number>>;
  dropIndicatorInfoRef: React.RefObject<{
    item: unknown; index: number; width: number; height: number;
    isCrossContainer: boolean; isSource: boolean; horizontal: boolean;
    hoverWidth: number; hoverHeight: number;
    sourceListId: string; targetListId: string; fromIndex: number;
  } | undefined>;
  /** Set by DraxList so board can trigger re-render on any column */
  forceRenderRef: React.RefObject<(() => void) | undefined>;

  // ── Drag state (refs) ──
  isDraggingRef: React.RefObject<boolean>;
  dragStartIndexRef: React.RefObject<number>;
  currentSlotRef: React.RefObject<number>;
  frozenBoundariesRef: React.RefObject<SlotBoundary[]>;
  /** Set during render when cross-container adds new keys. DraxList clears shifts in useLayoutEffect. */
  pendingShiftClearRef: React.RefObject<boolean>;
  /** Set during render when parent echoes back committed reorder. DraxList skips forceRender. */
  echoSkipRef: React.RefObject<boolean>;
  /** Cached result from freezeSlotBoundaries' computeGridPositions — avoids redundant O(N) recompute. */
  frozenGridResultRef: React.RefObject<{ positions: Map<string, Position>; dimensions: Map<string, { width: number; height: number }>; totalHeight: number } | null>;
  /** Cached snap target position — updated during each shift recompute. Avoids O(N) walk at drag end. */
  snapTargetPositionRef: React.RefObject<Position | null>;
  /** Snap target (worklet-accessible SV). Written by worklet path during shift computation. */
  snapTargetSV: SharedValue<Position>;

  // ── Layout engine ──
  /** Record a measured height and update the running average for unmeasured items. */
  recordItemHeight: (key: string, height: number) => void;
  computeGridPositions: (keys: string[]) => { positions: Map<string, Position>; dimensions: Map<string, { width: number; height: number }>; totalHeight: number };
  recomputeBasePositions: () => void;
  clearShifts: () => void;
  recomputeBasePositionsAndClearShifts: () => void;
  freezeSlotBoundaries: () => void;
  getSlotFromPosition: (contentX: number, contentY: number) => number;
  recomputeShiftsForReorder: (dragKey: string, targetSlot: number) => { positions: Map<string, Position>; dimensions: Map<string, { width: number; height: number }>; totalHeight: number } | null;
  commitReorder: () => void;

  // ── Board integration ──
  removeKey: (key: string) => void;
  insertKey: (key: string, atIndex: number, height: number) => void;
  recomputeAllShifts: () => void;

  // ── Callback ──
  onReorder: (event: SortableReorderEvent<T>) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────

export const useSortableList = <T,>(
  options: UseSortableListOptions<T>,
): SortableListHandle<T> => {
  const {
    data: externalData,
    keyExtractor,
    onReorder,
    estimatedItemSize,
    horizontal = false,
    numColumns = 1,
    reorderStrategy = 'insert',
    longPressDelay = 250,
    lockToMainAxis = false,
    animationConfig = 'default',
    drawDistance = 250,
    getItemSpan,
    gridGap = 0,
    flexWrap = false,
    getItemSize,
  } = options;

  const id = useDraxId(options.id);

  // ── Refs (all internal state, no re-renders) ──
  // Initialize from externalData so first render has correct positions
  const orderedKeysRef = useRef<string[]>(externalData.map((item, i) => keyExtractor(item, i)));
  const basePositionsRef = useRef<Map<string, Position>>(new Map());
  const itemHeightsRef = useRef<Map<string, number>>(new Map());
  // Running average of measured heights — used for unmeasured items instead of
  // estimatedItemSize. Automatically includes margins, padding, etc.
  // Inspired by FlashList's MultiTypeAverageWindow.
  const measuredAvgHeightRef = useRef(estimatedItemSize);
  const measuredCountRef = useRef(0);
  const itemCrossAxisRef = useRef<Map<string, number>>(new Map());
  const totalContentSizeRef = useRef(0);
  const containerMeasRef = useRef<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
  const scrollContainerOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const containerWidthRef = useRef(0);
  const dataRef = useRef<T[]>(externalData);
  const keyToIndexRef = useRef<Map<string, number>>(new Map());
  const renderItemRef = useRef<((info: any) => ReactNode) | undefined>(undefined);
  const keyExtractorRef = useRef<(item: unknown, index: number) => string>(keyExtractor as (item: unknown, index: number) => string);
  const itemDimensionsRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const sortedPositionsRef = useRef<{ key: string; start: number; end: number }[]>([]);
  const getItemSpanRef = useRef<((item: unknown, index: number) => GridItemSpan) | undefined>(
    getItemSpan as ((item: unknown, index: number) => GridItemSpan) | undefined
  );
  const getItemSizeRef = useRef<((item: unknown, index: number) => { width: number; height: number }) | undefined>(
    getItemSize as ((item: unknown, index: number) => { width: number; height: number }) | undefined
  );
  keyExtractorRef.current = keyExtractor as (item: unknown, index: number) => string;
  getItemSpanRef.current = getItemSpan as ((item: unknown, index: number) => GridItemSpan) | undefined;
  getItemSizeRef.current = getItemSize as ((item: unknown, index: number) => { width: number; height: number }) | undefined;

  // ── Shadow data (maintained alongside Maps for O(1) worklet sync at drag start) ──
  const basePositionsRecordRef = useRef<Record<string, Position>>({});
  const itemHeightsRecordRef = useRef<Record<string, number>>({});

  // ── SharedValues ──
  const shiftsSV = useSharedValue<Record<string, Position>>({});
  const draggedKeySV = useSharedValue('');
  const scrollOffsetSV = useSharedValue(0);
  const skipShiftAnimationSV = useSharedValue(false);

  // ── Worklet-accessible SharedValues (for UI-thread slot detection) ──
  const frozenBoundariesSV = useSharedValue<{ key: string; x: number; y: number; width: number; height: number }[]>([]);
  const orderedKeysSV = useSharedValue<string[]>([]);
  const basePositionsSV = useSharedValue<Record<string, Position>>({});
  const itemHeightsSV = useSharedValue<Record<string, number>>({});
  const currentSlotSV = useSharedValue(0);
  const isDraggingSV = useSharedValue(false);
  /** Snap target position (worklet writes here during shift computation for O(1) snap at drag end). */
  const snapTargetSV = useSharedValue<Position>({ x: 0, y: 0 });
  const containerMeasSV = useSharedValue<{ x: number; y: number; width: number; height: number } | null>(null);
  /** Pre-computed cumulative item ends for O(log N) binary search slot detection (single-column). */
  const cumulativeEndsSV = useSharedValue<number[]>([]);

  // ── Drop indicator ──
  const dropIndicatorPositionSV = useSharedValue<Position>({ x: 0, y: 0 });
  const dropIndicatorVisibleSV = useSharedValue(false);
  const dropIndicatorGenSV = useSharedValue(0);
  const dropIndicatorInfoRef = useRef<{
    item: unknown; index: number; width: number; height: number;
    isCrossContainer: boolean; isSource: boolean; horizontal: boolean;
    hoverWidth: number; hoverHeight: number;
    sourceListId: string; targetListId: string; fromIndex: number;
  } | undefined>(undefined);
  const forceRenderRef = useRef<(() => void) | undefined>(undefined);

  // ── Per-cell base position SharedValues (position changes via SV, zero React re-renders) ──
  const cellBaseRegistryRef = useRef(new Map<string, SharedValue<Position>>());
  const registerCellBase = useCallback((key: string, sv: SharedValue<Position>) => {
    cellBaseRegistryRef.current.set(key, sv);
    // Set correct base position on registration (cell mount or recycle)
    const pos = basePositionsRef.current.get(key);
    if (pos) sv.value = { x: pos.x, y: pos.y };
  }, []);
  const unregisterCellBase = useCallback((key: string) => {
    cellBaseRegistryRef.current.delete(key);
  }, []);

  /** Push base positions to all registered cells via SharedValues (zero React re-renders). */
  function pushBasePositionsToSVs() {
    for (const [key, sv] of cellBaseRegistryRef.current) {
      const pos = basePositionsRef.current.get(key);
      if (pos) sv.value = { x: pos.x, y: pos.y };
    }
  }

  // ── Per-cell shift SharedValues (UI-thread perf: only moved cells re-evaluate) ──
  const cellShiftRegistryRef = useRef(new Map<string, SharedValue<Position>>());
  const registerCellShift = useCallback((key: string, sv: SharedValue<Position>) => {
    cellShiftRegistryRef.current.set(key, sv);

    // During drag, keep worklet record in sync and set correct initial shift
    // for recycled cells. Without this, cellShiftRecordSV is a stale snapshot
    // from drag start — worklet writes to wrong SVs / skips new cells.
    if (isDraggingRef.current) {
      // Compute correct shift for single-column (worklet path).
      // Grid path recomputes all shifts via JS on next dragOver.
      if (numColumns === 1 && !flexWrap) {
        const orderedKeys = orderedKeysSV.value;
        const basePos = basePositionsRef.current.get(key);
        if (basePos && orderedKeys.includes(key)) {
          let cursor = 0;
          for (const k of orderedKeys) {
            if (k === key) break;
            cursor += itemHeightsRef.current.get(k) ?? estimatedItemSize;
          }
          sv.value = horizontal
            ? { x: cursor - basePos.x, y: 0 }
            : { x: 0, y: cursor - basePos.y };
        }
      }

      // Rebuild worklet Record from current registry
      const cs: Record<string, SharedValue<Position>> = {};
      for (const [k, v] of cellShiftRegistryRef.current) cs[k] = v;
      cellShiftRecordSV.value = cs;
    } else {
      // Not dragging: set correct shift for this item on recycle.
      // After echo, shiftsSV has permanent reorder offsets per key.
      // After clearShifts, all are {0,0}. New object avoids frozen ref.
      const existing = shiftsSV.value[key];
      sv.value = existing ? { x: existing.x, y: existing.y } : { x: 0, y: 0 };
    }
  }, []);
  const unregisterCellShift = useCallback((key: string) => {
    cellShiftRegistryRef.current.delete(key);

    // Remove stale key from worklet record so it stops writing to
    // this SV (which will be re-registered under a different item key).
    if (isDraggingRef.current) {
      const cs: Record<string, SharedValue<Position>> = {};
      for (const [k, v] of cellShiftRegistryRef.current) cs[k] = v;
      cellShiftRecordSV.value = cs;
    }
  }, []);

  /** Sync JS refs → SharedValues for worklet slot detection. Called at drag start.
   *
   *  Large data (basePositions, itemHeights, orderedKeys) is PRE-SYNCED during
   *  render/measurement in recomputeBasePositions() and the data sync block.
   *  This function only writes scalars + cellShiftRecord — O(K) where K ≈ visible cells.
   *
   *  All SV writes go through scheduleOnUI for ATOMIC application on the UI thread.
   *  isDraggingSV is set LAST — it gates the worklet, ensuring all other SVs are
   *  correct before slot detection runs. */
  function syncRefsToWorklet() {
    const slot = currentSlotRef.current;
    const cm = containerMeasRef.current ?? null;
    // Cell shift registry: Map → Record (O(K) where K ≈ visible cells)
    const cs: Record<string, SharedValue<Position>> = {};
    for (const [k, v] of cellShiftRegistryRef.current) cs[k] = v;

    // Atomic write on UI thread. Gesture onUpdate is also on UI thread →
    // serialized with this worklet. Either onUpdate runs before (isDraggingSV
    // still false → worklet gate skips) or after (all SVs correct).
    scheduleOnUI((
      _currentSlotSV: typeof currentSlotSV,
      _containerMeasSV: typeof containerMeasSV,
      _cellShiftRecordSV: typeof cellShiftRecordSV,
      _isDraggingSV: typeof isDraggingSV,
      _slot: number,
      _cm: typeof cm,
      _cs: Record<string, SharedValue<Position>>,
    ) => {
      'worklet';
      _currentSlotSV.value = _slot;
      _containerMeasSV.value = _cm;
      _cellShiftRecordSV.value = _cs;
      _isDraggingSV.value = true; // LAST — gates the worklet
    }, currentSlotSV, containerMeasSV, cellShiftRecordSV, isDraggingSV,
       slot, cm, cs);
  }

  /** Sync SharedValues → JS refs after drag ends. */
  function syncWorkletToRefs() {
    const workletKeys = [...orderedKeysSV.value];
    orderedKeysRef.current = workletKeys;
    currentSlotRef.current = currentSlotSV.value;
    // Sync shiftsSV from per-cell SVs (worklet wrote per-cell, not shiftsSV)
    const shifts: Record<string, Position> = {};
    for (const [k, sv] of cellShiftRegistryRef.current) {
      shifts[k] = sv.value;
    }
    shiftsSV.value = shifts;
  }

  // Cell shift record SV — worklet needs Record access (not Map)
  const cellShiftRecordSV = useSharedValue<Record<string, SharedValue<Position>>>({});

  // Initialize keyToIndexRef AND base positions on first render
  if (keyToIndexRef.current.size === 0 && externalData.length > 0) {
    const map = new Map<string, number>();
    for (let i = 0; i < externalData.length; i++) {
      const item = externalData[i];
      if (item !== undefined) map.set(keyExtractor(item, i), i);
    }
    keyToIndexRef.current = map;
    // Compute initial base positions from estimatedItemSize
    recomputeBasePositions();
  }


  // ── Gap layout for mixed-size grid slot detection (virtual slot approach) ──
  // At drag start, pack grid WITHOUT the dragged item. This "gap layout" is frozen
  // for the entire drag. Finger → gap cell → item key → insertion index.
  // Because the gap layout never changes, same finger position = same result = no oscillation.
  const frozenGapCellKeyMapRef = useRef<string[]>([]);
  const frozenGapKeyToIndexRef = useRef<Map<string, number>>(new Map());
  const frozenGapGeometryRef = useRef<{
    cellSize: number; gap: number; numColumns: number; totalRows: number;
  } | null>(null);
  /** Flex-wrap gap boundaries: positions of items packed WITHOUT the dragged item. */
  const frozenFlexGapBoundariesRef = useRef<SlotBoundary[]>([]);
  /** Cached computeGridPositions result from freezeSlotBoundaries — reused by drop indicator. */
  const frozenGridResultRef = useRef<ReturnType<typeof computeGridPositions> | null>(null);

  // ── Drag state refs ──
  const isDraggingRef = useRef(false);
  const dragStartIndexRef = useRef(0);
  const currentSlotRef = useRef(0);
  const frozenBoundariesRef = useRef<SlotBoundary[]>([]);
  /** Set during render when cross-container adds new keys. Cleared in useLayoutEffect. */
  const pendingShiftClearRef = useRef(false);
  /** Set during render when parent echoes back committed reorder. DraxList skips forceRender. */
  const echoSkipRef = useRef(false);
  /** Holds the committed data array from commitReorder for reference-equality echo detection. */
  const awaitingEchoRef = useRef<T[] | null>(null);
  /** Cached target position of the dragged item — updated during each shift recompute. Avoids O(N) walk at drag end. */
  const snapTargetPositionRef = useRef<Position | null>(null);

  // ── Layout helpers ──

  /** Compute pixel positions from keys using packGrid (mixed-size) or modulo (uniform). */
  function computeGridPositions(keys: string[]) {
    const cw = containerWidthRef.current;
    const cellSize = cw > 0
      ? (cw - gridGap * (numColumns - 1)) / numColumns
      : estimatedItemSize;
    const gap = gridGap;
    const positions = new Map<string, Position>();
    const dimensions = new Map<string, { width: number; height: number }>();

    // Flex-wrap: variable-width items flowing left-to-right with wrapping
    const sizeFn = getItemSizeRef.current;
    if (flexWrap && sizeFn && cw > 0) {
      const data = dataRef.current;
      const keyMap = keyToIndexRef.current;
      const result = packFlex(cw, keys.length, (i) => {
        const key = keys[i]!;
        const idx = keyMap.get(key);
        if (idx !== undefined && data[idx] !== undefined) {
          return sizeFn(data[idx]!, idx);
        }
        return { width: estimatedItemSize, height: estimatedItemSize };
      }, gap);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        positions.set(key, result.positions[i]!);
        dimensions.set(key, result.dimensions[i]!);
      }
      return { positions, dimensions, totalHeight: result.totalHeight };
    }

    const spanFn = getItemSpanRef.current;
    if (spanFn && numColumns > 1) {
      // Mixed-size grid: use packGrid for bin-packing
      const data = dataRef.current;
      const keyMap = keyToIndexRef.current;
      const packing = packGrid(keys.length, numColumns, (i) => {
        const key = keys[i]!;
        const idx = keyMap.get(key);
        if (idx !== undefined && data[idx] !== undefined) {
          return spanFn(data[idx]!, idx);
        }
        return { colSpan: 1, rowSpan: 1 };
      });

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const gp = packing.positions[i]!;
        const idx = keyMap.get(key);
        const span = idx !== undefined && data[idx] !== undefined
          ? spanFn(data[idx]!, idx)
          : { colSpan: 1, rowSpan: 1 };

        const x = gp.col * (cellSize + gap);
        const y = gp.row * (cellSize + gap);
        const w = span.colSpan * cellSize + (span.colSpan - 1) * gap;
        const h = span.rowSpan * cellSize + (span.rowSpan - 1) * gap;

        positions.set(key, { x, y });
        dimensions.set(key, { width: w, height: h });
      }

      const totalH = packing.totalRows * (cellSize + gap) - gap;
      return {
        positions, dimensions, totalHeight: totalH,
        cellOwners: packing.cellOwners, gridTotalRows: packing.totalRows,
      };
    }

    if (numColumns > 1 && cw > 0) {
      // Uniform grid
      const heights = itemHeightsRef.current;
      const avgH = measuredAvgHeightRef.current;
      let cursorY = 0;
      let maxRowHeight = 0;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const col = i % numColumns;
        if (col === 0 && i > 0) { cursorY += maxRowHeight; maxRowHeight = 0; }
        const h = heights.get(key) ?? avgH;
        positions.set(key, { x: col * cellSize, y: cursorY });
        dimensions.set(key, { width: cellSize, height: h });
        maxRowHeight = Math.max(maxRowHeight, h);
      }
      return { positions, dimensions, totalHeight: cursorY + maxRowHeight };
    }

    // Linear list — alignment handled by inner wrapper's alignSelf (from contentContainerStyle.alignItems)
    const heights = itemHeightsRef.current;
    const avgH = measuredAvgHeightRef.current;
    const itemSizeFn = getItemSizeRef.current;
    const data = dataRef.current;
    const keyMap = keyToIndexRef.current;
    // Build sorted positions array alongside base positions (same loop, no extra pass)
    const sorted: { key: string; start: number; end: number }[] = new Array(keys.length);
    let cursor = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      // Priority: measured height > getItemSize callback > running average
      let h = heights.get(key);
      if (h === undefined && itemSizeFn) {
        const idx = keyMap.get(key);
        if (idx !== undefined && data[idx] !== undefined) {
          h = horizontal ? itemSizeFn(data[idx]!, idx).width : itemSizeFn(data[idx]!, idx).height;
          // Record getItemSize heights so they're available for the worklet
          // (syncRefsToWorklet copies itemHeightsRef → itemHeightsSV at drag start).
          // Without this, the worklet falls back to estimatedItemSize for all items.
          if (h !== undefined) recordItemHeight(key, h);
        }
      }
      if (h === undefined) h = avgH;
      sorted[i] = { key, start: cursor, end: cursor + h };
      if (horizontal) {
        positions.set(key, { x: cursor, y: 0 });
        dimensions.set(key, { width: h, height: cw || 0 });
      } else {
        positions.set(key, { x: 0, y: cursor });
        dimensions.set(key, { width: cw || 0, height: h });
      }
      cursor += h;
    }
    sortedPositionsRef.current = sorted;
    return { positions, dimensions, totalHeight: cursor };
  }

  /** Record a measured height and update the running average.
   *  The running average is used for unmeasured items in computeGridPositions,
   *  automatically compensating for margins/padding that estimatedItemSize misses. */
  function recordItemHeight(key: string, height: number) {
    const prev = itemHeightsRef.current.get(key);
    itemHeightsRef.current.set(key, height);
    if (prev === undefined) {
      // First measurement for this item — update running average
      measuredCountRef.current++;
      const n = measuredCountRef.current;
      measuredAvgHeightRef.current += (height - measuredAvgHeightRef.current) / n;
    } else if (Math.abs(prev - height) > 0.5) {
      // Height changed — adjust running average (subtract old, add new)
      const n = measuredCountRef.current;
      if (n > 0) {
        measuredAvgHeightRef.current += (height - prev) / n;
      }
    }
  }

  // ── Layout engine ──
  /** Recompute base positions. Does NOT clear shifts (caller decides).
   *  Updates refs only — no SharedValue writes (safe to call during render).
   *  Call syncPositionsToWorklet() afterwards from a non-render context. */
  function recomputeBasePositions() {
    const keys = orderedKeysRef.current;
    const result = computeGridPositions(keys);
    basePositionsRef.current = result.positions;
    itemDimensionsRef.current = result.dimensions;
    totalContentSizeRef.current = result.totalHeight;
    // Cache for drop indicator position lookup.
    // Guard: frozenGridResultRef not yet declared during first-render initialization.
    if (frozenGridResultRef) frozenGridResultRef.current = result;
  }

  /** Sync position/height data to worklet SharedValues.
   *  Creates fresh Record copies (Reanimated freezes SV values — never share with refs).
   *  Call OUTSIDE render: useLayoutEffect, callbacks, commitReorder. */
  function syncPositionsToWorklet() {
    // Create SEPARATE objects for ref and SV — Reanimated freezes SV values,
    // so sharing the same object would make the ref point to a frozen object.
    const bpForRef: Record<string, Position> = {};
    const bpForSV: Record<string, Position> = {};
    for (const [k, v] of basePositionsRef.current) {
      bpForRef[k] = v;
      bpForSV[k] = v;
    }
    basePositionsRecordRef.current = bpForRef;
    basePositionsSV.value = bpForSV;
    const ihForRef: Record<string, number> = {};
    const ihForSV: Record<string, number> = {};
    for (const [k, v] of itemHeightsRef.current) {
      ihForRef[k] = v;
      ihForSV[k] = v;
    }
    itemHeightsRecordRef.current = ihForRef;
    itemHeightsSV.value = ihForSV;

    // Single-column: update cumulative ends for O(log N) binary search slot detection.
    // Flat number[] is ~6x cheaper to write to SV than the object[] frozenBoundaries.
    syncCumulativeEnds();
  }

  /** Compute and write cumulative item end positions for single-column binary search.
   *  Called from syncPositionsToWorklet (data change) and commitReorder (after reorder). */
  function syncCumulativeEnds() {
    if (numColumns !== 1 || flexWrap) return;
    const keys = orderedKeysRef.current;
    const ends: number[] = new Array(keys.length);
    let cursor = 0;
    for (let i = 0; i < keys.length; i++) {
      cursor += itemHeightsRef.current.get(keys[i]!) ?? estimatedItemSize;
      ends[i] = cursor;
    }
    cumulativeEndsSV.value = ends;
  }

  /** Clear all shifts (snap to 0). Caller must ensure base positions are already current. */
  function clearShifts() {
    skipShiftAnimationSV.value = true;
    shiftsSV.value = {};
    for (const sv of cellShiftRegistryRef.current.values()) {
      sv.value = { x: 0, y: 0 };
    }
  }

  /** Recompute base positions AND clear shifts.
   *  Used by paths where base positions weren't recomputed during render
   *  (container layout change, cross-container transfer). */
  function recomputeBasePositionsAndClearShifts() {
    recomputeBasePositions();
    clearShifts();
  }

  // ── Sync external data EAGERLY during render (not in useLayoutEffect) ──
  // This ensures basePositionsRef is updated BEFORE cells render with new top values.
  // Combined with shiftsValidSV gating, both top and shifts update in same Fabric commit.
  const prevExternalDataRef = useRef(externalData);
  if (externalData !== prevExternalDataRef.current) {
    prevExternalDataRef.current = externalData;

    // Single loop: build both key→index map and ordered keys array
    const map = new Map<string, number>();
    const keys: string[] = new Array(externalData.length);
    for (let i = 0; i < externalData.length; i++) {
      const item = externalData[i];
      if (item !== undefined) {
        const k = keyExtractor(item, i);
        keys[i] = k;
        map.set(k, i);
      }
    }

    // ── Echo detection ──
    // When commitReorder fires, it saves the reordered array in awaitingEchoRef.
    // If the parent echoes back that exact array (reference equality), skip the
    // expensive forceRender — the library already committed internally.
    const isEcho = awaitingEchoRef.current !== null && externalData === awaitingEchoRef.current;
    awaitingEchoRef.current = null;

    // Always sync data source + key map
    dataRef.current = externalData;
    keyToIndexRef.current = map;

    if (isEcho) {
      // Library already committed. Shifts are permanent. Visual is correct.
      // DON'T recompute bases or clear shifts — Fabric/Reanimated race causes blink
      // (newBase + oldShift visible for 1 frame before clearShifts takes effect).
      // Permanent shifts: visual = oldBase + shift = correct. Zero work.
      echoSkipRef.current = true;
    } else if (!isDraggingRef.current) {
      orderedKeysRef.current = keys;

      // Recompute base positions EAGERLY during render so cells in THIS commit
      // get new baseX/baseY props. Without this, shifts clear to 0 in useLayoutEffect
      // but cells still have OLD base positions → 1-frame blink at original positions.
      // SV writes (orderedKeysSV, basePositionsSV, itemHeightsSV) happen in
      // useLayoutEffect via syncPositionsToWorklet (not during render).
      recomputeBasePositions();

      // Mark for shift clear in useLayoutEffect (SV writes not allowed during render).
      pendingShiftClearRef.current = true;
    }
  }

  // ── (recomputeBasePositions defined above as function, before sync block) ──

  // ── Slot detection (frozen boundaries) ──

  const frozenKeysRef = useRef<string[]>([]);
  const frozenDragKeyRef = useRef('');
  const freezeSlotBoundaries = useCallback(() => {
    const keys = orderedKeysRef.current;
    const currentDragKey = draggedKeySV.value;
    const dragKeyUnchanged = currentDragKey === frozenDragKeyRef.current;

    // Single-column: cumulativeEndsSV is kept current by syncPositionsToWorklet +
    // commitReorder. No frozenBoundariesSV write needed (saves 139-145ms).
    if (numColumns === 1 && !flexWrap) {
      frozenDragKeyRef.current = currentDragKey;
      frozenKeysRef.current = keys;
      return;
    }

    // Grid/flex-wrap: compute frozen boundaries (small N, fast SV write)
    const keysUnchanged = keys === frozenKeysRef.current && frozenBoundariesRef.current.length > 0;
    if (!keysUnchanged) {
      frozenKeysRef.current = keys;
      const shifts = shiftsSV.value;
      const basePositions = basePositionsRef.current;
      const dimensions = itemDimensionsRef.current;
      frozenBoundariesRef.current = keys.map(key => {
        const pos = basePositions.get(key) ?? { x: 0, y: 0 };
        const shift = shifts[key];
        const dim = dimensions.get(key) ?? { width: 0, height: estimatedItemSize };
        return {
          key,
          x: pos.x + (shift?.x ?? 0),
          y: pos.y + (shift?.y ?? 0),
          width: dim.width,
          height: dim.height,
        };
      });
      frozenBoundariesSV.value = frozenBoundariesRef.current;
    }

    if (dragKeyUnchanged) return;

    // Virtual slot: pack grid WITHOUT the dragged item to create a stable "gap layout."
    // Recomputed when keys OR drag key changes (different item picked up).
    frozenDragKeyRef.current = currentDragKey;
    const spanFn = getItemSpanRef.current;
    if (spanFn && numColumns > 1 && currentDragKey) {
      const gapKeys = keys.filter(k => k !== currentDragKey);
      const data = dataRef.current;
      const keyMap = keyToIndexRef.current;
      const gapPacking = packGrid(gapKeys.length, numColumns, (i) => {
        const key = gapKeys[i]!;
        const idx = keyMap.get(key);
        if (idx !== undefined && data[idx] !== undefined) {
          return spanFn(data[idx]!, idx);
        }
        return { colSpan: 1, rowSpan: 1 };
      });

      const cw = containerWidthRef.current;
      const cellSize = cw > 0
        ? (cw - gridGap * (numColumns - 1)) / numColumns
        : estimatedItemSize;
      frozenGapGeometryRef.current = {
        cellSize, gap: gridGap, numColumns, totalRows: gapPacking.totalRows,
      };

      // Build cell → key map from gap packing
      const gapCellKeyMap = new Array<string>(gapPacking.cellOwners.length);
      for (let i = 0; i < gapPacking.cellOwners.length; i++) {
        const ownerIdx = gapPacking.cellOwners[i]!;
        gapCellKeyMap[i] = ownerIdx >= 0 && ownerIdx < gapKeys.length ? gapKeys[ownerIdx]! : '';
      }
      frozenGapCellKeyMapRef.current = gapCellKeyMap;

      // Build key → insertion index map for O(1) lookup
      const keyToIdx = new Map<string, number>();
      gapKeys.forEach((k, i) => keyToIdx.set(k, i));
      frozenGapKeyToIndexRef.current = keyToIdx;
    } else if (flexWrap && getItemSizeRef.current && currentDragKey) {
      // Flex-wrap gap layout: pack without dragged item, store boundaries
      const flexSizeFn = getItemSizeRef.current;
      if (flexSizeFn) {
        const gapKeys = keys.filter(k => k !== currentDragKey);
        const data = dataRef.current;
        const keyMap = keyToIndexRef.current;
        const cw = containerWidthRef.current;
        const gapResult = packFlex(cw, gapKeys.length, (i) => {
          const key = gapKeys[i]!;
          const idx = keyMap.get(key);
          if (idx !== undefined && data[idx] !== undefined) {
            return flexSizeFn(data[idx]!, idx);
          }
          return { width: estimatedItemSize, height: estimatedItemSize };
        }, gridGap);

        const gapBoundaries = gapKeys.map((key, i) => ({
          key,
          x: gapResult.positions[i]!.x,
          y: gapResult.positions[i]!.y,
          width: gapResult.dimensions[i]!.width,
          height: gapResult.dimensions[i]!.height,
        }));
        frozenFlexGapBoundariesRef.current = gapBoundaries;

        const keyToIdx = new Map<string, number>();
        gapKeys.forEach((k, i) => keyToIdx.set(k, i));
        frozenGapKeyToIndexRef.current = keyToIdx;
      }
    }
  }, [estimatedItemSize, horizontal, gridGap, numColumns, flexWrap]);

  const getSlotFromPosition = useCallback((contentX: number, contentY: number): number => {
    const boundaries = frozenBoundariesRef.current;
    if (boundaries.length === 0) {
      return 0;
    }

    // Flex-wrap: nearest-by-distance on frozen gap boundaries
    if (flexWrap) {
      const gapBounds = frozenFlexGapBoundariesRef.current;
      const gapKeyToIndex = frozenGapKeyToIndexRef.current;
      if (gapBounds.length > 0 && gapKeyToIndex.size > 0) {
        let bestKey = '';
        let bestDist = Infinity;
        for (const b of gapBounds) {
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          const dist = Math.abs(contentX - cx) + Math.abs(contentY - cy);
          if (dist < bestDist) { bestDist = dist; bestKey = b.key; }
        }
        if (bestKey) {
          const idx = gapKeyToIndex.get(bestKey);
          return idx !== undefined ? idx : -1;
        }
      }
      return -1;
    }

    if (numColumns > 1) {
      // Mixed-size grid: virtual slot detection via frozen gap layout.
      // The gap layout (pack WITHOUT dragged item) is computed once at drag start.
      // Finger → gap cell → item key → insertion index. Frozen = no oscillation.
      const gapCellKeyMap = frozenGapCellKeyMapRef.current;
      const gapKeyToIndex = frozenGapKeyToIndexRef.current;
      const geo = frozenGapGeometryRef.current;
      if (gapCellKeyMap.length > 0 && geo && gapKeyToIndex.size > 0) {
        const step = geo.cellSize + geo.gap;
        const fingerCol = Math.max(0, Math.min(Math.floor(contentX / step), geo.numColumns - 1));
        const fingerRow = Math.max(0, Math.min(Math.floor(contentY / step), geo.totalRows - 1));

        // Look up the key at the finger's cell in the gap layout
        let targetKey = gapCellKeyMap[fingerRow * geo.numColumns + fingerCol] || '';

        // Empty cell in gap layout — spiral outward for nearest occupied cell
        if (!targetKey) {
          for (let radius = 1; radius <= Math.max(geo.totalRows, geo.numColumns); radius++) {
            let found = false;
            for (let dr = -radius; dr <= radius && !found; dr++) {
              for (let dc = -radius; dc <= radius && !found; dc++) {
                if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
                const nr = fingerRow + dr;
                const nc = fingerCol + dc;
                if (nr < 0 || nr >= geo.totalRows || nc < 0 || nc >= geo.numColumns) continue;
                const k = gapCellKeyMap[nr * geo.numColumns + nc] || '';
                if (k) { targetKey = k; found = true; }
              }
            }
            if (targetKey) break;
          }
        }

        if (!targetKey) return -1;

        // Convert gap key → insertion index (position in the post-removal array)
        const insertionIdx = gapKeyToIndex.get(targetKey);
        return insertionIdx !== undefined ? insertionIdx : -1;
      }

      // Uniform grid (no getItemSpan): find nearest slot by distance to center
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < boundaries.length; i++) {
        const b = boundaries[i]!;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const dist = Math.abs(contentX - cx) + Math.abs(contentY - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    // 1D list: gap midpoint boundary (symmetric sensitivity)
    for (let i = 0; i < boundaries.length - 1; i++) {
      const current = boundaries[i]!;
      const next = boundaries[i + 1]!;
      if (horizontal) {
        const currentEnd = current.x + current.width;
        const gap = next.x - currentEnd;
        const boundary = currentEnd + gap / 2;
        if (contentX < boundary) return i;
      } else {
        const currentEnd = current.y + current.height;
        const gap = next.y - currentEnd;
        const boundary = currentEnd + gap / 2;
        if (contentY < boundary) return i;
      }
    }
    return boundaries.length - 1;
  }, [numColumns, horizontal, flexWrap]);

  // ── Worklet: slot detection (runs on UI thread) ──

  /** Pure geometry — same as getSlotFromPosition but runs in worklet. */
  function getSlotFromPositionWorklet(
    contentX: number,
    contentY: number,
    boundaries: { key: string; x: number; y: number; width: number; height: number }[],
    cumulativeEnds: number[],
    cols: number,
    horiz: boolean,
  ): number {
    'worklet';
    // Single-column: O(log N) binary search on pre-computed cumulative ends
    if (cols === 1 && cumulativeEnds.length > 0) {
      const pos = horiz ? contentX : contentY;
      let lo = 0;
      let hi = cumulativeEnds.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulativeEnds[mid]! <= pos) lo = mid + 1;
        else hi = mid;
      }
      return Math.min(lo, cumulativeEnds.length - 1);
    }
    // Grid: O(N) center-distance (grids have small N)
    if (boundaries.length === 0) return 0;
    if (cols > 1) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < boundaries.length; i++) {
        const b = boundaries[i]!;
        const dist = Math.abs(contentX - (b.x + b.width / 2)) + Math.abs(contentY - (b.y + b.height / 2));
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      return bestIdx;
    }
    // Fallback: 1D linear scan
    for (let i = 0; i < boundaries.length - 1; i++) {
      const current = boundaries[i]!;
      const next = boundaries[i + 1]!;
      if (horiz) {
        const boundary = current.x + current.width + (next.x - (current.x + current.width)) / 2;
        if (contentX < boundary) return i;
      } else {
        const boundary = current.y + current.height + (next.y - (current.y + current.height)) / 2;
        if (contentY < boundary) return i;
      }
    }
    return boundaries.length - 1;
  }

  /** Worklet: recompute shifts for a reorder. Writes per-cell SVs on UI thread.
   *  Returns new ordered keys array, or null if no change. */
  function recomputeShiftsWorklet(
    dragKey: string,
    targetSlot: number,
    keys: string[],
    basePosRecord: Record<string, Position>,
    heightsRecord: Record<string, number>,
    cellShiftRecord: Record<string, SharedValue<Position>>,
    estItemSize: number,
    horiz: boolean,
    strategy: string,
  ): string[] | null {
    'worklet';
    const currentIdx = keys.indexOf(dragKey);
    if (currentIdx < 0 || currentIdx === targetSlot) return null;

    // Splice ordered keys
    const newKeys = [...keys];
    if (strategy === 'swap') {
      const temp = newKeys[currentIdx]!;
      newKeys[currentIdx] = newKeys[targetSlot]!;
      newKeys[targetSlot] = temp;
    } else {
      newKeys.splice(currentIdx, 1);
      newKeys.splice(targetSlot, 0, dragKey);
    }

    // Compute cumulative positions + shifts (linear list only)
    let cursor = 0;
    for (const key of newKeys) {
      const h = heightsRecord[key] ?? estItemSize;
      const basePos = basePosRecord[key];
      const targetX = horiz ? cursor : 0;
      const targetY = horiz ? 0 : cursor;
      if (basePos) {
        const shift = { x: targetX - basePos.x, y: targetY - basePos.y };
        const cellSV = cellShiftRecord[key];
        if (cellSV) {
          const cur = cellSV.value;
          if (cur.x !== shift.x || cur.y !== shift.y) {
            cellSV.value = shift;
          }
        }
      }
      cursor += h;
    }
    return newKeys;
  }

  // ── Shift computation during drag ──

  /** Returns the computeGridPositions result so callers can reuse it (e.g., for drop indicator). */
  const recomputeShiftsForReorder = useCallback((dragKey: string, targetSlot: number) => {
    const keys = [...orderedKeysRef.current];
    const currentIdx = keys.indexOf(dragKey);
    if (currentIdx < 0 || currentIdx === targetSlot) return null;

    if (reorderStrategy === 'swap') {
      const temp = keys[currentIdx]!;
      keys[currentIdx] = keys[targetSlot]!;
      keys[targetSlot] = temp;
    } else {
      keys.splice(currentIdx, 1);
      keys.splice(targetSlot, 0, dragKey);
    }
    orderedKeysRef.current = keys;

    const result = computeGridPositions(keys);
    const newShifts: Record<string, Position> = {};
    const registry = cellShiftRegistryRef.current;
    for (const key of keys) {
      const target = result.positions.get(key);
      const basePos = basePositionsRef.current.get(key);
      let shift: Position;
      if (target && basePos) {
        shift = { x: target.x - basePos.x, y: target.y - basePos.y };
      } else if (target) {
        shift = { x: target.x, y: target.y };
      } else {
        shift = { x: 0, y: 0 };
      }
      newShifts[key] = shift;
      // Write to per-cell SV only if changed (avoids restarting springs on unmoved cells)
      const cellSV = registry.get(key);
      if (cellSV) {
        const cur = cellSV.value;
        if (cur.x !== shift.x || cur.y !== shift.y) {
          cellSV.value = shift;
        }
      }
    }
    shiftsSV.value = newShifts; // Keep for JS-thread reads (visibility, snap)
    // Cache dragged item's target position for O(1) snap at drag end
    const draggedTarget = result.positions.get(dragKey);
    if (draggedTarget) snapTargetPositionRef.current = draggedTarget;
    // Grow content area during drag so shifted items aren't clipped
    if (result.totalHeight > totalContentSizeRef.current) {
      totalContentSizeRef.current = result.totalHeight;
    }
    // NOTE: Do NOT rebuild frozenCellOwnersRef/frozenBoundariesRef here.
    // Frozen geometry must stay frozen for the entire drag to prevent oscillation.
    // The cell→key map from freezeSlotBoundaries provides stable slot detection.
    return result;
  }, [reorderStrategy, shiftsSV]);

  // ── Board integration: remove/insert keys for cross-container ──

  /** Remove a key from orderedKeys and recompute shifts. Used by board when item leaves. */
  /** Recompute shifts for all items in orderedKeysRef using computeGridPositions. */
  function recomputeAllShifts() {
    const keys = orderedKeysRef.current;
    const result = computeGridPositions(keys);
    totalContentSizeRef.current = result.totalHeight;
    const newShifts: Record<string, Position> = {};
    const registry = cellShiftRegistryRef.current;
    for (const key of keys) {
      const target = result.positions.get(key);
      const basePos = basePositionsRef.current.get(key);
      let shift: Position;
      if (target && basePos) {
        shift = { x: target.x - basePos.x, y: target.y - basePos.y };
      } else if (target) {
        shift = { x: target.x, y: target.y };
      } else {
        shift = { x: 0, y: 0 };
      }
      newShifts[key] = shift;
      const cellSV = registry.get(key);
      if (cellSV) {
        const cur = cellSV.value;
        if (cur.x !== shift.x || cur.y !== shift.y) {
          cellSV.value = shift;
        }
      }
    }
    shiftsSV.value = newShifts;
  }

  const removeKey = useCallback((key: string) => {
    orderedKeysRef.current = orderedKeysRef.current.filter(k => k !== key);
    // Clean up stale entries — avoids accumulating data for transferred items
    basePositionsRef.current.delete(key);
    delete basePositionsRecordRef.current[key];
    recomputeAllShifts();
  }, []);

  const insertKey = useCallback((key: string, atIndex: number, height: number) => {
    const keys = [...orderedKeysRef.current];
    if (!keys.includes(key)) {
      keys.splice(atIndex, 0, key);
    }
    orderedKeysRef.current = keys;
    itemHeightsRef.current.set(key, height);

    // Pre-compute where the new key WILL land, set as its base position.
    // New item: shift = target - target = 0 (appears at insertion point).
    // Existing items: shift = newTarget - oldBase (animate to make room).
    // Without this, recomputeAllShifts sees no basePos for the new key and
    // sets shift = target (huge value) instead of 0.
    const preview = computeGridPositions(keys);
    const newKeyTarget = preview.positions.get(key);
    if (newKeyTarget) {
      basePositionsRef.current.set(key, newKeyTarget);
      // Create new object — Reanimated freezes objects assigned to SharedValues,
      // so basePositionsRecordRef.current may be non-extensible.
      basePositionsRecordRef.current = { ...basePositionsRecordRef.current, [key]: newKeyTarget };
    }
    totalContentSizeRef.current = preview.totalHeight;

    recomputeAllShifts();
  }, []);

  // ── Commit (called from onSnapEnd) ──

  const commitReorder = useCallback(() => {
    const fromIndex = dragStartIndexRef.current;
    const toIndex = currentSlotRef.current;

    // No-op: item returned to original position
    if (fromIndex === toIndex) {
      isDraggingRef.current = false;
      draggedKeySV.value = '';
      return;
    }

    const keys = orderedKeysRef.current;
    const currentData = dataRef.current;
    const keyMap = keyToIndexRef.current;

    const reorderedData: T[] = [];
    for (const key of keys) {
      const idx = keyMap.get(key);
      if (idx !== undefined && currentData[idx] !== undefined) {
        reorderedData.push(currentData[idx]);
      }
    }

    const fromItem = currentData[fromIndex];
    const toItem = currentData[toIndex];

    // ── Internal commit: library owns the data ──
    // Update dataRef + keyToIndexRef so the library is self-sufficient.
    // When the parent echoes this array back, data sync detects the reference match and skips.
    dataRef.current = reorderedData;
    const newKeyToIndex = new Map<string, number>();
    for (let i = 0; i < keys.length; i++) {
      newKeyToIndex.set(keys[i]!, i);
    }
    keyToIndexRef.current = newKeyToIndex;
    awaitingEchoRef.current = reorderedData;
    // PRE-SYNC orderedKeys so next drag start doesn't need O(N) copy
    orderedKeysSV.value = [...keys];
    // Update cumulative ends for binary search slot detection at next drag
    syncCumulativeEnds();

    // Clear drag state
    isDraggingRef.current = false;
    draggedKeySV.value = '';
    // Notification — parent stores data for persistence, library already committed
    if (fromItem !== undefined && toItem !== undefined) {
      onReorder({
        data: reorderedData,
        fromIndex,
        toIndex,
        fromItem,
        toItem,
      });
    }
  }, [onReorder, shiftsSV, draggedKeySV]);

  // ── Build internal ──

  const internal: SortableListInternal<T> = {
    id,
    horizontal,
    numColumns,
    reorderStrategy,
    longPressDelay,
    lockToMainAxis,
    animationConfig,
    estimatedItemSize,
    drawDistance,
    orderedKeysRef,
    basePositionsRef,
    itemHeightsRef,
    measuredAvgHeightRef,
    itemCrossAxisRef,
    totalContentSizeRef,
    containerMeasRef,
    scrollContainerOffsetRef,
    containerWidthRef,
    dataRef,
    keyExtractorRef,
    keyToIndexRef,
    renderItemRef,
    itemDimensionsRef,
    getItemSpanRef,
    sortedPositionsRef,
    shiftsSV,
    draggedKeySV,
    scrollOffsetSV,
    skipShiftAnimationSV,
    registerCellBase,
    unregisterCellBase,
    registerCellShift,
    unregisterCellShift,
    pushBasePositionsToSVs,
    frozenBoundariesSV,
    orderedKeysSV,
    basePositionsSV,
    itemHeightsSV,
    currentSlotSV,
    isDraggingSV,
    containerMeasSV,
    cellShiftRecordSV,
    cumulativeEndsSV,
    snapTargetSV,
    syncRefsToWorklet,
    syncWorkletToRefs,
    syncPositionsToWorklet,
    getSlotFromPositionWorklet,
    recomputeShiftsWorklet,
    dropIndicatorPositionSV,
    dropIndicatorVisibleSV,
    dropIndicatorGenSV,
    dropIndicatorInfoRef,
    forceRenderRef,
    isDraggingRef,
    dragStartIndexRef,
    currentSlotRef,
    frozenBoundariesRef,
    pendingShiftClearRef,
    echoSkipRef,
    frozenGridResultRef,
    snapTargetPositionRef,
    recordItemHeight,
    computeGridPositions,
    recomputeBasePositions,
    clearShifts,
    recomputeBasePositionsAndClearShifts,
    freezeSlotBoundaries,
    getSlotFromPosition,
    recomputeShiftsForReorder,
    commitReorder,
    removeKey,
    insertKey,
    recomputeAllShifts,
    onReorder,
  };

  return { _internal: internal };
};
