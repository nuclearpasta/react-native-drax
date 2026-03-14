import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { runOnUI } from 'react-native-worklets';

import {
  defaultAutoScrollBackThreshold,
  defaultAutoScrollForwardThreshold,
  defaultAutoScrollJumpRatio,
  defaultListItemLongPressDelay,
} from '../params';
import type {
  DraxSnapbackTarget,
  DraxViewMeasurements,
  Position,
  SortableItemMeasurement,
  SortableListHandle,
  SortableListInternal,
  UseSortableListOptions,
} from '../types';
import { DraxSnapbackTargetPreset } from '../types';
import { useDraxId } from './useDraxId';

/** Stable identity — avoids FlatList cell unmounting on data reorder. */
function useStableKeyExtractor<T>() {
  return useCallback((_item: T, index: number) => `__drax_${index}`, []);
}

/**
 * Core hook for list-agnostic sortable reordering.
 *
 * During drag, order changes are tracked in a ref (no React re-render)
 * and items are visually repositioned via shift transforms (SharedValues).
 * The data reorder is committed to state only on drop, while the hover
 * view covers any layout transition.
 */
export const useSortableList = <T,>(
  options: UseSortableListOptions<T>
): SortableListHandle<T> => {
  const {
    data: rawData,
    keyExtractor,
    onReorder,
    horizontal = false,
    numColumns = 1,
    reorderStrategy = 'insert',
    longPressDelay = defaultListItemLongPressDelay,
    lockToMainAxis = false,
    autoScrollJumpRatio = defaultAutoScrollJumpRatio,
    autoScrollBackThreshold = defaultAutoScrollBackThreshold,
    autoScrollForwardThreshold = defaultAutoScrollForwardThreshold,
    onDragStart,
    onDragPositionChange,
    onDragEnd,
  } = options;

  const id = useDraxId(options.id);

  // ── SharedValues (UI-thread state) ────────────────────────────────
  const draggedItem = useSharedValue<number | undefined>(undefined);
  const dropTargetPositionSV = useSharedValue<{ x: number; y: number }>({ x: 0, y: 0 });
  const dropTargetVisibleSV = useSharedValue(false);

  /**
   * Per-item shift transforms keyed by item key.
   * Written from JS thread during drag, read on UI thread via useAnimatedStyle.
   */
  const shiftsRef = useSharedValue<Record<string, Position>>({});

  /**
   * When true, SortableItem applies shifts with duration 0 (instant).
   * Set during reorder commit so items don't animate from old shift→0
   * while the FlatList re-renders (which would cause a double-offset flash).
   * Reset at the start of the next drag session.
   */
  const instantClearSV = useSharedValue(false);

  /**
   * When false, SortableItem ignores all shifts (treats them as 0).
   * Written SYNCHRONOUSLY from useLayoutEffect (direct JSI write) when
   * rawData changes, so the animated style picks it up in the same UI
   * frame as the Fabric commit. This prevents the 1-frame blink where
   * cells show new content but the animated style still has stale shifts.
   */
  const shiftsValidSV = useSharedValue(true);

  // ── JS-thread state ───────────────────────────────────────────────
  const [originalIndexes, setOriginalIndexes] = useState<number[]>([]);

  /**
   * Buffered FlatList data. Only updated on external data changes, NOT on
   * accepted reorders. This ensures FlatList never re-renders on reorder
   * commit, eliminating the Fabric-vs-Reanimated race that caused the blink.
   */
  const [stableData, setStableData] = useState(rawData);

  const itemMeasurements = useRef<Map<string, SortableItemMeasurement>>(
    new Map()
  );
  const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
    undefined
  );
  const contentSizeRef = useRef<Position | undefined>(undefined);
  const scrollPosition = useSharedValue<Position>({ x: 0, y: 0 });

  // ── Drag tracking (refs, no re-render) ────────────────────────────
  const draggedDisplayIndexRef = useRef<number | undefined>(undefined);
  const dragStartIndexRef = useRef<number | undefined>(undefined);
  /**
   * Pending reorder during drag. Tracks the desired display order
   * as indices into rawData. Updated by moveDraggedItem (ref, not state).
   */
  const pendingOrderRef = useRef<number[]>([]);

  /**
   * Committed visual order — the pending order from the last completed drag.
   * FlatList data is NOT changed on reorder; items are positioned entirely
   * via shifts. This ref allows the next drag to start from the visual state.
   * Empty means FlatList data matches the visual order (identity).
   */
  const committedOrderRef = useRef<number[]>([]);
  /** Shifts corresponding to the committed visual order (for cancel revert). */
  const committedShiftsRef = useRef<Record<string, Position>>({});
  /** Item keys in committed visual order — detects when parent data matches. */
  const committedKeyOrderRef = useRef<string[]>([]);

  // ── Handle data changes ──────────────────────────────────────────────
  // With permanent shifts, FlatList data is NOT changed on reorder.
  // When rawData changes (parent updated state after onReorder, or external
  // data change), check if it matches the committed visual order. If so,
  // clear shifts (items now at correct FlatList positions). Otherwise reset.
  useLayoutEffect(() => {
    console.log('[useLayoutEffect rawData] fired, committedOrder.length:', committedOrderRef.current.length);
    // Always keep originalIndexes as identity — permanent shifts handle visual order.
    setOriginalIndexes((prev) => {
      const isIdentity = prev.length === rawData.length && prev.every((v, i) => v === i);
      if (isIdentity) return prev;
      return rawData.length > 0 ? [...Array(rawData.length).keys()] : [];
    });

    const committedKeys = committedKeyOrderRef.current;
    if (committedKeys.length > 0 && committedKeys.length === rawData.length) {
      // Check if new data order matches committed visual order by keys.
      let matches = true;
      for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];
        if (item === undefined || keyExtractor(item, i) !== committedKeys[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        // Parent accepted our reorder — stableData stays unchanged.
        // FlatList keeps rendering the original data order; permanent shifts
        // handle the visual reorder. No Fabric commit → no race → no blink.
        console.log('[useLayoutEffect rawData] parent accepted reorder — no-op (stableData unchanged)');
        return;
      }
    }

    // External data change or initial mount — update stableData and reset.
    console.log('[useLayoutEffect rawData] external change, updating stableData');
    setStableData(rawData);
    committedOrderRef.current = [];
    committedKeyOrderRef.current = [];
    committedShiftsRef.current = {};
    // Invalidate shifts immediately, clear on next UI frame.
    shiftsValidSV.value = false;
    runOnUI(() => {
      'worklet';
      instantClearSV.value = true;
      shiftsRef.value = {};
      shiftsValidSV.value = true;
    })();
  }, [rawData, keyExtractor, shiftsRef, instantClearSV, shiftsValidSV]);

  console.log('[useSortableList] stableData[0]:', stableData[0] && keyExtractor(stableData[0], 0));

  // ── Helpers ─────────────────────────────────────────────────────────

  const getMeasurementByOriginalIndex = (
    originalIndex: number
  ): SortableItemMeasurement | undefined => {
    const item = stableData[originalIndex];
    if (item === undefined) return undefined;
    const key = keyExtractor(item, originalIndex);
    return itemMeasurements.current.get(key);
  };

  /**
   * Get the measurement for an item by its original data index.
   * Returns {x, y, width, height} or undefined.
   */
  const getMeasForOrigIdx = (origIdx: number) => {
    const item = stableData[origIdx];
    if (item === undefined) return undefined;
    const key = keyExtractor(item, origIdx);
    return itemMeasurements.current.get(key);
  };

  // ── Shift computation ─────────────────────────────────────────────

  /**
   * Compute the gap between items from current FlatList measurements.
   * Uses the first two items in originalIndexes to detect separator/padding.
   */
  const computeItemGap = (): number => {
    if (originalIndexes.length < 2) return 0;
    const meas0 = getMeasForOrigIdx(originalIndexes[0]!);
    const meas1 = getMeasForOrigIdx(originalIndexes[1]!);
    if (!meas0 || !meas1) return 0;

    if (numColumns > 1) {
      // Grid: gap between rows (check items in different rows)
      const firstRowEnd = Math.min(numColumns, originalIndexes.length);
      if (originalIndexes.length > firstRowEnd) {
        const lastInRow0 = getMeasForOrigIdx(originalIndexes[firstRowEnd - 1]!);
        const firstInRow1 = getMeasForOrigIdx(originalIndexes[firstRowEnd]!);
        if (lastInRow0 && firstInRow1) {
          return horizontal
            ? firstInRow1.x - (lastInRow0.x + lastInRow0.width)
            : firstInRow1.y - (lastInRow0.y + lastInRow0.height);
        }
      }
      return 0;
    }

    // List: gap = nextItem.y - (thisItem.y + thisItem.height)
    return horizontal
      ? meas1.x - (meas0.x + meas0.width)
      : meas1.y - (meas0.y + meas0.height);
  };

  /**
   * Compute shifts for items in the given order. Returns a map of
   * item key → {x, y} shift, or undefined if measurements are missing.
   *
   * @param order Array of original data indices in desired display order
   * @param skipIndex Optional display index to skip (dragged item during drag)
   */
  const computeShiftsForOrder = (
    order: number[],
    skipIndex?: number,
  ): Record<string, Position> | undefined => {
    if (order.length === 0) return undefined;

    const measurements = order.map((origIdx) => getMeasForOrigIdx(origIdx));
    const missingShiftIdx = measurements.findIndex((m) => !m);
    if (missingShiftIdx >= 0) {
      console.log('[computeShiftsForOrder] MISSING measurement at idx:', missingShiftIdx, 'origIdx:', order[missingShiftIdx]);
      return undefined;
    }

    const gap = computeItemGap();

    const firstOrigIdx = originalIndexes[0];
    const startMeas = firstOrigIdx !== undefined ? getMeasForOrigIdx(firstOrigIdx) : undefined;
    if (!startMeas) {
      console.log('[computeShiftsForOrder] MISSING startMeas for firstOrigIdx:', firstOrigIdx);
      return undefined;
    }

    const targetPositions = new Map<number, Position>();

    if (numColumns <= 1) {
      let cursor = horizontal ? startMeas.x : startMeas.y;
      for (let i = 0; i < order.length; i++) {
        const meas = measurements[i]!;
        if (horizontal) {
          targetPositions.set(i, { x: cursor, y: startMeas.y });
          cursor += meas.width + gap;
        } else {
          targetPositions.set(i, { x: startMeas.x, y: cursor });
          cursor += meas.height + gap;
        }
      }
    } else {
      let cursorY = startMeas.y;
      const colXPositions: number[] = [];
      for (let c = 0; c < numColumns && c < originalIndexes.length; c++) {
        const colMeas = getMeasForOrigIdx(originalIndexes[c]!);
        colXPositions.push(colMeas ? colMeas.x : 0);
      }
      for (let i = 0; i < order.length; i++) {
        const col = i % numColumns;
        targetPositions.set(i, { x: colXPositions[col] ?? 0, y: cursorY });
        if (col === numColumns - 1 || i === order.length - 1) {
          const rowStart = i - col;
          let rowHeight = 0;
          for (let j = rowStart; j <= i; j++) {
            rowHeight = Math.max(rowHeight, measurements[j]!.height);
          }
          cursorY += rowHeight + gap;
        }
      }
    }

    const newShifts: Record<string, Position> = {};
    for (let i = 0; i < order.length; i++) {
      if (skipIndex !== undefined && i === skipIndex) continue;
      const origIdx = order[i]!;
      const item = stableData[origIdx];
      if (item === undefined) continue;
      const key = keyExtractor(item, origIdx);
      const currentMeas = getMeasForOrigIdx(origIdx);
      if (!currentMeas) continue;
      const target = targetPositions.get(i);
      if (!target) continue;
      const dx = target.x - currentMeas.x;
      const dy = target.y - currentMeas.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        newShifts[key] = { x: dx, y: dy };
      }
    }
    return newShifts;
  };

  /** Compute and apply shifts during drag (skips the invisible dragged item). */
  const computeShifts = () => {
    const shifts = computeShiftsForOrder(
      pendingOrderRef.current,
      draggedDisplayIndexRef.current,
    );
    if (shifts) shiftsRef.value = shifts;
  };

  // ── Reorder during drag (ref-only, no state) ─────────────────────

  const moveDraggedItem = (toDisplayIndex: number) => {
    const fromIdx = draggedDisplayIndexRef.current;
    console.log('[moveDraggedItem] from:', fromIdx, 'to:', toDisplayIndex);
    if (fromIdx === undefined || fromIdx === toDisplayIndex) return;

    const prev = pendingOrderRef.current;
    if (prev.length === 0) return;

    let newOrder: number[];
    if (reorderStrategy === 'swap') {
      newOrder = [...prev];
      const temp = newOrder[fromIdx];
      newOrder[fromIdx] = newOrder[toDisplayIndex]!;
      newOrder[toDisplayIndex] = temp!;
    } else {
      newOrder = [...prev];
      const [removed] = newOrder.splice(fromIdx, 1);
      if (removed !== undefined) {
        newOrder.splice(toDisplayIndex, 0, removed);
      }
    }

    pendingOrderRef.current = newOrder;
    draggedDisplayIndexRef.current = toDisplayIndex;

    // Update visual shifts
    computeShifts();
  };

  // ── Commit visual order (permanent shifts, no FlatList data change) ──

  /**
   * Store the current pending order as the committed visual order.
   * Called after drag ends — FlatList data is NOT changed. Items stay
   * at their FlatList positions and shifts provide the visual reorder.
   */
  const commitVisualOrder = () => {
    const pending = pendingOrderRef.current;
    if (pending.length === 0) return;

    committedOrderRef.current = [...pending];
    committedKeyOrderRef.current = pending.map((origIdx) => {
      const item = stableData[origIdx];
      return item !== undefined ? keyExtractor(item, origIdx) : '';
    });
    // Store final shifts (all items including formerly-dragged) for cancel revert.
    const finalShifts = computeShiftsForOrder(pending);
    committedShiftsRef.current = finalShifts ?? {};
    console.log('[commitVisualOrder] stored committed order, keys, and shifts');
  };

  // ── Drag state methods ─────────────────────────────────────────────

  const setDraggedItem = (index: number) => {
    draggedItem.value = index;
  };

  const resetDraggedItem = () => {
    draggedItem.value = undefined;
    draggedDisplayIndexRef.current = undefined;
    dragStartIndexRef.current = undefined;
    pendingOrderRef.current = [];
  };

  /**
   * Initialize pending order from current originalIndexes at drag start.
   */
  const initPendingOrder = () => {
    // Start from the committed visual order (what the user sees),
    // NOT originalIndexes (always identity with permanent shifts).
    const committed = committedOrderRef.current;
    pendingOrderRef.current = committed.length > 0
      ? [...committed]
      : [...originalIndexes];
    instantClearSV.value = false;
  };

  /**
   * Cancel drag without reorder — clears shifts instantly and makes item visible.
   * Used when the drag ends but no reorder happened (item snaps back to origin).
   */
  const cancelDrag = () => {
    instantClearSV.value = true;
    // Revert to committed shifts from the previous drag (if any).
    // If no previous drag, clears to empty (identity positions).
    shiftsRef.value = committedShiftsRef.current;
  };

  /**
   * Compute the display slot (index) from a container-local content position.
   * Used when dragging over empty space (no receiver hit) to determine
   * which slot the dragged item should occupy.
   */
  const getSlotFromPosition = (contentPos: Position): number => {
    const pending = pendingOrderRef.current;
    if (pending.length === 0) return 0;

    // Use ORIGINAL layout positions for stable slot boundaries.
    // Key insight: slot boundaries must NOT shift when items are reordered
    // during drag. Using pending-order measurements causes oscillation:
    // move changes boundaries → same position maps to new slot → another
    // move → boundaries shift again → gap keeps running from the finger.
    // Original layout positions are fixed throughout the drag.
    const measurements = originalIndexes.map((origIdx) => getMeasForOrigIdx(origIdx));
    const missingIdx = measurements.findIndex((m) => !m);
    if (missingIdx >= 0) {
      console.log('[getSlotFromPosition] MISSING measurement at idx:', missingIdx, 'origIdx:', originalIndexes[missingIdx], 'returning:', draggedDisplayIndexRef.current ?? 0);
      return draggedDisplayIndexRef.current ?? 0;
    }

    const gap = computeItemGap();

    if (numColumns <= 1) {
      // Single-column list — find which slot the position falls in.
      // Boundary is at the gap midpoint between adjacent items, making
      // forward and backward equally responsive (distance = size/2 + gap/2).
      // Using item centers (50%) would be asymmetric: the hover center
      // starts AT the forward boundary but a full item-height from the
      // backward boundary, making forward too sensitive and backward too sluggish.
      const firstMeas = measurements[0]!;
      let cursor = horizontal ? firstMeas.x : firstMeas.y;

      for (let i = 0; i < pending.length; i++) {
        const meas = measurements[i]!;
        const size = horizontal ? meas.width : meas.height;
        const boundary = cursor + size + gap / 2; // midpoint of gap after item
        const pos = horizontal ? contentPos.x : contentPos.y;

        if (pos < boundary) return i;
        cursor += size + gap;
      }
      return pending.length - 1;
    } else {
      // Multi-column grid — find row then column
      const firstMeas = measurements[0]!;
      let cursorY = firstMeas.y;

      // Find row — use full row boundary (not center) so the bottom
      // half of a row doesn't spill into the next row.
      let targetRow = 0;
      const totalRows = Math.ceil(pending.length / numColumns);
      for (let row = 0; row < totalRows; row++) {
        const rowStart = row * numColumns;
        const rowEnd = Math.min(rowStart + numColumns, pending.length);
        let rowHeight = 0;
        for (let col = rowStart; col < rowEnd; col++) {
          rowHeight = Math.max(rowHeight, measurements[col]!.height);
        }
        if (contentPos.y < cursorY + rowHeight + gap / 2) {
          targetRow = row;
          break;
        }
        cursorY += rowHeight + gap;
        targetRow = row;
      }

      // Find column within row — use gap midpoint for symmetric sensitivity
      const colXPositions: number[] = [];
      for (let c = 0; c < numColumns && c < originalIndexes.length; c++) {
        const colMeas = getMeasForOrigIdx(originalIndexes[c]!);
        colXPositions.push(colMeas ? colMeas.x : 0);
      }
      const colGap = numColumns >= 2 && colXPositions.length >= 2
        ? colXPositions[1]! - (colXPositions[0]! + measurements[0]!.width)
        : 0;

      let targetCol = 0;
      for (let c = 0; c < numColumns; c++) {
        const colX = colXPositions[c] ?? 0;
        const colMeas = measurements[Math.min(c, measurements.length - 1)]!;
        const colBoundary = colX + colMeas.width + colGap / 2;
        if (contentPos.x < colBoundary) {
          targetCol = c;
          break;
        }
        targetCol = c;
      }

      return Math.min(targetRow * numColumns + targetCol, pending.length - 1);
    }
  };

  // ── Snapback target ─────────────────────────────────────────────────

  const getSnapbackTarget = (): DraxSnapbackTarget => {
    const containerMeasurements = containerMeasurementsRef.current;
    if (!containerMeasurements) return DraxSnapbackTargetPreset.Default;

    const displayIdx = draggedDisplayIndexRef.current;
    if (displayIdx === undefined) return DraxSnapbackTargetPreset.Default;

    const pending = pendingOrderRef.current;
    if (pending.length === 0) return DraxSnapbackTargetPreset.Default;

    // Compute the target position for the dragged item by laying out
    // items in the pending order and accumulating dimensions.
    // This is the same logic as computeShifts but we only need the
    // position at displayIdx.
    const measurements = pending.map((origIdx) => getMeasForOrigIdx(origIdx));
    if (measurements.some((m) => !m)) return DraxSnapbackTargetPreset.Default;

    let targetPos: Position;

    const gap = computeItemGap();

    // Use FlatList's actual starting position, not pending[0] which
    // may be the dragged item at the wrong FlatList slot.
    const snapFirstOrigIdx = originalIndexes[0];
    const snapStartMeas = snapFirstOrigIdx !== undefined
      ? getMeasForOrigIdx(snapFirstOrigIdx)
      : undefined;
    if (!snapStartMeas) return DraxSnapbackTargetPreset.Default;

    if (numColumns <= 1) {
      // Single-column list
      let cursor = horizontal ? snapStartMeas.x : snapStartMeas.y;

      for (let i = 0; i < displayIdx; i++) {
        const meas = measurements[i]!;
        cursor += (horizontal ? meas.width : meas.height) + gap;
      }

      targetPos = horizontal
        ? { x: cursor, y: snapStartMeas.y }
        : { x: snapStartMeas.x, y: cursor };
    } else {
      // Multi-column grid
      let cursorY = snapStartMeas.y;
      const targetRow = Math.floor(displayIdx / numColumns);
      const targetCol = displayIdx % numColumns;

      for (let row = 0; row < targetRow; row++) {
        const rowStart = row * numColumns;
        const rowEnd = Math.min(rowStart + numColumns, pending.length);
        let rowHeight = 0;
        for (let col = rowStart; col < rowEnd; col++) {
          rowHeight = Math.max(rowHeight, measurements[col]!.height);
        }
        cursorY += rowHeight + gap;
      }

      const colMeas = getMeasForOrigIdx(originalIndexes[targetCol]!);
      targetPos = { x: colMeas ? colMeas.x : 0, y: cursorY };
    }

    return {
      x: containerMeasurements.x + targetPos.x - scrollPosition.value.x,
      y: containerMeasurements.y + targetPos.y - scrollPosition.value.y,
    };
  };

  // ── Scroll event handlers ─────────────────────────────────────────

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    runOnUI((_event: NativeScrollEvent) => {
      'worklet';
      scrollPosition.value = {
        x: _event.contentOffset.x,
        y: _event.contentOffset.y,
      };
    })(event.nativeEvent);
  };

  const onContentSizeChange = (width: number, height: number) => {
    contentSizeRef.current = { x: width, y: height };
  };

  // ── Build the internal object ─────────────────────────────────────
  const internal: SortableListInternal<T> = {
    id,
    horizontal,
    numColumns,
    reorderStrategy,
    longPressDelay,
    lockToMainAxis,
    draggedItem,
    itemMeasurements,
    originalIndexes,
    keyExtractor,
    data: stableData,
    rawData: stableData,
    moveDraggedItem,
    getSnapbackTarget,
    setDraggedItem,
    resetDraggedItem,
    scrollPosition,
    containerMeasurementsRef,
    contentSizeRef,
    autoScrollJumpRatio,
    autoScrollBackThreshold,
    autoScrollForwardThreshold,
    onDragStart,
    onDragPositionChange,
    onDragEnd,
    onReorder,
    getMeasurementByOriginalIndex,
    dropTargetPositionSV,
    dropTargetVisibleSV,
    draggedDisplayIndexRef,
    dragStartIndexRef,
    shiftsRef,
    instantClearSV,
    shiftsValidSV,
    initPendingOrder,
    commitVisualOrder,
    computeShiftsForOrder,
    committedOrderRef,
    pendingOrderRef,
    cancelDrag,
    getSlotFromPosition,
  };

  // Stable index-based keyExtractor prevents FlatList from unmounting cells
  // when data reorders. Cells stay at their FlatList index and React updates
  // content in place (no unmount/remount), eliminating the multi-frame blink.
  const stableKeyExtractor = useStableKeyExtractor<T>();

  return {
    data: stableData,
    onScroll,
    onContentSizeChange,
    stableKeyExtractor,
    _internal: internal,
  };
};
