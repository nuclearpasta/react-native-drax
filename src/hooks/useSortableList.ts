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

import type {
  GridItemSpan,
  Position,
  SortableAnimationConfig,
  SortableReorderStrategy,
} from '../types';
import { packGrid } from '../math';
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
  /** Cross-axis measurements (width for vertical items, height for horizontal items) */
  itemCrossAxisRef: React.RefObject<Map<string, number>>;
  totalContentSizeRef: React.RefObject<number>;
  containerMeasRef: React.RefObject<{ x: number; y: number; width: number; height: number } | undefined>;
  containerWidthRef: React.RefObject<number>;
  dataRef: React.RefObject<T[]>;
  keyExtractorRef: React.RefObject<(item: unknown, index: number) => string>;
  keyToIndexRef: React.RefObject<Map<string, number>>;
  renderItemRef: React.RefObject<((info: any) => ReactNode) | undefined>;
  /** Per-item dimensions (for mixed-size grids) */
  itemDimensionsRef: React.RefObject<Map<string, { width: number; height: number }>>;
  getItemSpanRef: React.RefObject<((item: unknown, index: number) => GridItemSpan) | undefined>;

  // ── SharedValues (UI thread animation) ──
  shiftsSV: ReturnType<typeof useSharedValue<Record<string, Position>>>;
  draggedKeySV: ReturnType<typeof useSharedValue<string>>;
  scrollOffsetSV: ReturnType<typeof useSharedValue<number>>;
  /** When true, cells snap shifts instantly (no spring/timing). Set during cross-container reset. */
  skipShiftAnimationSV: ReturnType<typeof useSharedValue<boolean>>;

  // ── Per-cell shift SharedValues (UI-thread perf: only moved cells re-evaluate) ──
  registerCellShift: (key: string, sv: SharedValue<Position>) => void;
  unregisterCellShift: (key: string) => void;

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
  getSlotFromPositionWorklet: (
    contentX: number, contentY: number,
    boundaries: { key: string; x: number; y: number; width: number; height: number }[],
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

  // ── Layout engine ──
  computeGridPositions: (keys: string[]) => { positions: Map<string, Position>; dimensions: Map<string, { width: number; height: number }>; totalHeight: number };
  recomputeBasePositions: () => void;
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
  } = options;

  const id = useDraxId(options.id);

  // ── Refs (all internal state, no re-renders) ──
  // Initialize from externalData so first render has correct positions
  const orderedKeysRef = useRef<string[]>(externalData.map((item, i) => keyExtractor(item, i)));
  const basePositionsRef = useRef<Map<string, Position>>(new Map());
  const itemHeightsRef = useRef<Map<string, number>>(new Map());
  const itemCrossAxisRef = useRef<Map<string, number>>(new Map());
  const totalContentSizeRef = useRef(0);
  const containerMeasRef = useRef<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
  const containerWidthRef = useRef(0);
  const dataRef = useRef<T[]>(externalData);
  const keyToIndexRef = useRef<Map<string, number>>(new Map());
  const renderItemRef = useRef<((info: any) => ReactNode) | undefined>(undefined);
  const keyExtractorRef = useRef<(item: unknown, index: number) => string>(keyExtractor as (item: unknown, index: number) => string);
  const itemDimensionsRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const getItemSpanRef = useRef<((item: unknown, index: number) => GridItemSpan) | undefined>(
    getItemSpan as ((item: unknown, index: number) => GridItemSpan) | undefined
  );
  keyExtractorRef.current = keyExtractor as (item: unknown, index: number) => string;
  getItemSpanRef.current = getItemSpan as ((item: unknown, index: number) => GridItemSpan) | undefined;

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
  const containerMeasSV = useSharedValue<{ x: number; y: number; width: number; height: number } | null>(null);

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

  // ── Per-cell shift SharedValues (UI-thread perf: only moved cells re-evaluate) ──
  const cellShiftRegistryRef = useRef(new Map<string, SharedValue<Position>>());
  // Shadow Record maintained incrementally — avoids full Map-to-Record rebuild on register/unregister
  const cellShiftRecordRef = useRef<Record<string, SharedValue<Position>>>({});
  const registerCellShift = useCallback((key: string, sv: SharedValue<Position>) => {
    cellShiftRegistryRef.current.set(key, sv);
    cellShiftRecordRef.current[key] = sv;

    // During drag, keep worklet record in sync and set correct initial shift
    // for recycled cells. Without this, cellShiftRecordSV is a stale snapshot
    // from drag start — worklet writes to wrong SVs / skips new cells.
    if (isDraggingRef.current) {
      // Compute correct shift for single-column (worklet path).
      // Grid path recomputes all shifts via JS on next dragOver.
      if (numColumns === 1) {
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

      // Incremental update: assign shadow Record (already has the new key)
      cellShiftRecordSV.value = { ...cellShiftRecordRef.current };
    }
  }, []);
  const unregisterCellShift = useCallback((key: string) => {
    cellShiftRegistryRef.current.delete(key);
    delete cellShiftRecordRef.current[key];

    // Remove stale key from worklet record so it stops writing to
    // this SV (which will be re-registered under a different item key).
    if (isDraggingRef.current) {
      cellShiftRecordSV.value = { ...cellShiftRecordRef.current };
    }
  }, []);

  /** Sync JS refs → SharedValues for worklet slot detection. Called at drag start. */
  function syncRefsToWorklet() {
    orderedKeysSV.value = [...orderedKeysRef.current];
    currentSlotSV.value = currentSlotRef.current;
    isDraggingSV.value = isDraggingRef.current;
    containerMeasSV.value = containerMeasRef.current ?? null;
    // Base positions: Map → Record
    const bp: Record<string, Position> = {};
    for (const [k, v] of basePositionsRef.current) bp[k] = v;
    basePositionsSV.value = bp;
    // Item heights: Map → Record
    const ih: Record<string, number> = {};
    for (const [k, v] of itemHeightsRef.current) ih[k] = v;
    itemHeightsSV.value = ih;
    // Cell shift registry: use shadow Record (already maintained incrementally)
    cellShiftRecordSV.value = { ...cellShiftRecordRef.current };
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

  // ── Drag state refs ──
  const isDraggingRef = useRef(false);
  const dragStartIndexRef = useRef(0);
  const currentSlotRef = useRef(0);
  const frozenBoundariesRef = useRef<SlotBoundary[]>([]);
  /** Set during render when cross-container adds new keys. Cleared in useLayoutEffect. */
  const pendingShiftClearRef = useRef(false);

  // ── Layout helpers ──

  // Pooled Maps for computeGridPositions — reused across calls to avoid allocation
  // MUST be declared before the initialization block below that calls recomputeBasePositions → computeGridPositions
  const positionsPoolRef = useRef(new Map<string, Position>());
  const dimensionsPoolRef = useRef(new Map<string, { width: number; height: number }>());

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

  /** Compute pixel positions from keys using packGrid (mixed-size) or modulo (uniform).
   *  Returns pooled Maps — caller must read before next call (Maps are reused). */
  function computeGridPositions(keys: string[]) {
    const cw = containerWidthRef.current;
    const cellSize = cw > 0
      ? (cw - gridGap * (numColumns - 1)) / numColumns
      : estimatedItemSize;
    const gap = gridGap;
    const positions = positionsPoolRef.current;
    const dimensions = dimensionsPoolRef.current;
    positions.clear();
    dimensions.clear();

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
      return { positions, dimensions, totalHeight: totalH };
    }

    if (numColumns > 1 && cw > 0) {
      // Uniform grid
      const heights = itemHeightsRef.current;
      let cursorY = 0;
      let maxRowHeight = 0;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!;
        const col = i % numColumns;
        if (col === 0 && i > 0) { cursorY += maxRowHeight; maxRowHeight = 0; }
        const h = heights.get(key) ?? estimatedItemSize;
        positions.set(key, { x: col * cellSize, y: cursorY });
        dimensions.set(key, { width: cellSize, height: h });
        maxRowHeight = Math.max(maxRowHeight, h);
      }
      return { positions, dimensions, totalHeight: cursorY + maxRowHeight };
    }

    // Linear list — alignment handled by inner wrapper's alignSelf (from contentContainerStyle.alignItems)
    const heights = itemHeightsRef.current;
    let cursor = 0;
    for (const key of keys) {
      const h = heights.get(key) ?? estimatedItemSize;
      if (horizontal) {
        positions.set(key, { x: cursor, y: 0 });
        dimensions.set(key, { width: h, height: cw || 0 });
      } else {
        positions.set(key, { x: 0, y: cursor });
        dimensions.set(key, { width: cw || 0, height: h });
      }
      cursor += h;
    }
    return { positions, dimensions, totalHeight: cursor };
  }

  // ── Layout engine ──
  /** Recompute base positions. Does NOT clear shifts (caller decides). */
  function recomputeBasePositions() {
    const keys = orderedKeysRef.current;
    const result = computeGridPositions(keys);
    // Copy from pooled Maps into stable refs (pooled Maps get cleared on next call)
    basePositionsRef.current = new Map(result.positions);
    itemDimensionsRef.current = new Map(result.dimensions);
    totalContentSizeRef.current = result.totalHeight;
  }

  /** Recompute base positions AND clear shifts (used after layout changes, not during drag). */
  function recomputeBasePositionsAndClearShifts() {
    // Set skipShift HERE (not just in caller) to ensure it's in the same Reanimated
    // SV write batch as the cell clears. Writing from the caller and reading .value
    // back can return the old value (JSI getter reads UI-thread state, not pending JS write).
    skipShiftAnimationSV.value = true;
    recomputeBasePositions();
    shiftsSV.value = {};
    // Clear per-cell SVs
    for (const sv of cellShiftRegistryRef.current.values()) {
      sv.value = { x: 0, y: 0 };
    }
  }

  // ── Sync external data EAGERLY during render (not in useLayoutEffect) ──
  // This ensures basePositionsRef is updated BEFORE cells render with new top values.
  // Combined with shiftsValidSV gating, both top and shifts update in same Fabric commit.
  const prevExternalDataRef = useRef(externalData);
  if (externalData !== prevExternalDataRef.current) {
    prevExternalDataRef.current = externalData;
    dataRef.current = externalData;

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
    keyToIndexRef.current = map;

    if (!isDraggingRef.current) {
      orderedKeysRef.current = keys;

      // ALWAYS reset base positions + clear shifts after data change.
      // "Permanent shifts" kept Yoga touch at OLD base positions → wrong item grabbed.
      // useLayoutEffect handles: skipShiftAnimation → recomputeBasePositionsAndClearShifts → forceRender.
      // No visual change: newBase + 0 = oldBase + oldShift. But Yoga touch now correct.
      pendingShiftClearRef.current = true;
    }
  }

  // No flush needed. Base positions (top) stay frozen. Shifts are permanent.
  // Visual is always correct: top + shift = correct position.
  // Touch is correct because keyToIndexRef is synced eagerly.
  // Next drag starts from committed shifts (via orderedKeysRef + frozen boundaries).

  // ── (recomputeBasePositions defined above as function, before sync block) ──

  // ── Slot detection (frozen boundaries) ──

  const frozenKeysRef = useRef<string[]>([]);
  const freezeSlotBoundaries = useCallback(() => {
    const keys = orderedKeysRef.current;
    // Skip if keys haven't changed since last freeze (avoids redundant computeGridPositions)
    if (keys === frozenKeysRef.current && frozenBoundariesRef.current.length > 0) return;
    frozenKeysRef.current = keys;

    const result = computeGridPositions(keys);
    const boundaries = keys.map(key => {
      const pos = result.positions.get(key) ?? { x: 0, y: 0 };
      const dim = result.dimensions.get(key) ?? { width: 0, height: estimatedItemSize };
      return { key, x: pos.x, y: pos.y, width: dim.width, height: dim.height };
    });
    frozenBoundariesRef.current = boundaries;
    frozenBoundariesSV.value = boundaries; // Sync to UI thread for worklet slot detection
  }, [estimatedItemSize, horizontal]);

  const getSlotFromPosition = useCallback((contentX: number, contentY: number): number => {
    const boundaries = frozenBoundariesRef.current;
    if (boundaries.length === 0) {
      return 0;
    }

    if (numColumns > 1) {
      // 2D grid: find nearest slot by distance to center
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
  }, [numColumns, horizontal]);

  // ── Worklet: slot detection (runs on UI thread) ──

  /** Pure geometry — same as getSlotFromPosition but runs in worklet. */
  function getSlotFromPositionWorklet(
    contentX: number,
    contentY: number,
    boundaries: { key: string; x: number; y: number; width: number; height: number }[],
    cols: number,
    horiz: boolean,
  ): number {
    'worklet';
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
    // Copy pooled Maps — callers may hold the reference across future computeGridPositions calls
    return { positions: new Map(result.positions), dimensions: new Map(result.dimensions), totalHeight: result.totalHeight };
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
    const keys = orderedKeysRef.current;
    const idx = keys.indexOf(key);
    if (idx >= 0) keys.splice(idx, 1);
    recomputeAllShifts();
  }, []);

  const insertKey = useCallback((key: string, atIndex: number, height: number) => {
    const keys = [...orderedKeysRef.current];
    if (!keys.includes(key)) {
      keys.splice(atIndex, 0, key);
    }
    orderedKeysRef.current = keys;
    itemHeightsRef.current.set(key, height);
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


    // Clear drag state
    isDraggingRef.current = false;
    draggedKeySV.value = '';

    // Fire notification — parent stores data, visual already correct
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
    itemCrossAxisRef,
    totalContentSizeRef,
    containerMeasRef,
    containerWidthRef,
    dataRef,
    keyExtractorRef,
    keyToIndexRef,
    renderItemRef,
    itemDimensionsRef,
    getItemSpanRef,
    shiftsSV,
    draggedKeySV,
    scrollOffsetSV,
    skipShiftAnimationSV,
    registerCellShift,
    unregisterCellShift,
    frozenBoundariesSV,
    orderedKeysSV,
    basePositionsSV,
    itemHeightsSV,
    currentSlotSV,
    isDraggingSV,
    containerMeasSV,
    cellShiftRecordSV,
    syncRefsToWorklet,
    syncWorkletToRefs,
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
    computeGridPositions,
    recomputeBasePositions,
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
