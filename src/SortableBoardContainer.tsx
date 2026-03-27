/**
 * SortableBoardContainer — Cross-container drag-and-drop coordinator.
 *
 * Zero React state. All visual changes via refs + SharedValues.
 * onTransfer is a notification — library already committed the visual change.
 */
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
// runOnUI/runOnJS no longer needed here — hover cleanup moved to DraxList
import type { StyleProp, ViewStyle } from 'react-native';

import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import { SortableBoardProvider } from './SortableBoardContext';
import type { SortableBoardHandle } from './hooks/useSortableBoard';
import type {
  DraxMonitorEventData,
  DraxMonitorEndEventData,
  DraxMonitorDragDropEventData,
  DraxProtocolDragEndResponse,
  DraxViewProps,
  Position,
} from './types';
import { isSortableItemPayload } from './types';

export interface SortableBoardContainerProps<T = unknown> {
  board: SortableBoardHandle<T>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  draxViewProps?: Partial<DraxViewProps>;
}

export const SortableBoardContainer = <T,>({
  board,
  style,
  children,
  draxViewProps,
}: SortableBoardContainerProps<T>) => {
  const { columns, onTransfer } = board._internal;
  const { hoverDimsSV, hoverClearDeferredRef } = useDraxContext();

  // Source info
  const sourceInfoRef = useRef<{
    colId: string;
    itemKey: string;
    dragStartIndex: number;
    item: unknown;
    height: number;
    hoverWidth: number;
    hoverHeight: number;
  } | undefined>(undefined);

  // Transfer state (ref, not React state)
  const transferRef = useRef<{
    sourceId: string;
    targetId: string;
    targetSlot: number;
    itemKey: string;
    item: unknown;
    height: number;
    dragStartIndex: number;
  } | undefined>(undefined);

  const cleanupGenRef = useRef(0);

  // ── commitTransfer: called from DraxList's onSnapEnd after cross-container drop ──
  const commitTransfer = useCallback(() => {
    const transfer = transferRef.current;
    const source = sourceInfoRef.current;
    if (!transfer || !source) {
      return;
    }


    // Keep hover visible during parent data update
    hoverClearDeferredRef.current = true;

    // DON'T clear source draggedKeySV here — that would make the cell visible (opacity 0→1)
    // before React removes it, causing a flash. Source list's useLayoutEffect clears it
    // after the cell is unbound.

    // Fire notification — parent stores data
    onTransfer({
      item: transfer.item as T,
      fromContainerId: transfer.sourceId,
      fromIndex: transfer.dragStartIndex,
      toContainerId: transfer.targetId,
      toIndex: transfer.targetSlot,
    });

    // Clear transfer state
    transferRef.current = undefined;
    sourceInfoRef.current = undefined;

    // DON'T clear hover here. DraxList's useLayoutEffect on data change will
    // clear it AFTER React has committed new cells to the DOM — no race condition.
  }, [columns, onTransfer, hoverClearDeferredRef]);

  // ── Find which column the position is over ──
  const findTargetColumn = (absPos: Position): string | undefined => {
    for (const [colId, internal] of columns.entries()) {
      const bounds = internal.containerMeasRef?.current;
      if (!bounds) continue;
      if (
        absPos.x >= bounds.x && absPos.x <= bounds.x + bounds.width &&
        absPos.y >= bounds.y && absPos.y <= bounds.y + bounds.height
      ) {
        return colId;
      }
    }
    return undefined;
  };

  // ── Monitor callbacks ──

  const onMonitorDragStart = useCallback((eventData: DraxMonitorEventData) => {
    draxViewProps?.onMonitorDragStart?.(eventData);
    cleanupGenRef.current++;
    prevTargetColRef.current = undefined;
    prevInsertIdxRef.current = -1;

    // If previous snap animation didn't complete, flush the stale transfer.
    // 1. Clear old source list's drag state (prevents stale handleSnapEnd from committing)
    // 2. Clear board refs (so new drag has clean state)
    // 3. Fire onTransfer directly (NOT commitTransfer, which sets hoverClearDeferredRef)
    if (transferRef.current && sourceInfoRef.current) {
      const staleTransfer = transferRef.current;
      const staleSource = sourceInfoRef.current;
      // Clear old source list's drag state so stale handleSnapEnd is a no-op
      const staleSourceCol = columns.get(staleSource.colId);
      if (staleSourceCol) {
        staleSourceCol.isDraggingRef.current = false;
        staleSourceCol.draggedKeySV.value = '';
      }
      transferRef.current = undefined;
      sourceInfoRef.current = undefined;
      onTransfer({
        item: staleTransfer.item as T,
        fromContainerId: staleTransfer.sourceId,
        fromIndex: staleTransfer.dragStartIndex,
        toContainerId: staleTransfer.targetId,
        toIndex: staleTransfer.targetSlot,
      });
    }

    // DON'T reset hoverDimsSV here — handleDragStart already reset it, and
    // HoverLayer's onLayout may have already written the actual content dimensions.
    // Resetting here would erase the measurement.

    const { dragged } = eventData;
    const parentId = dragged.parentId;
    if (!parentId || !columns.has(parentId)) return;
    if (!isSortableItemPayload(dragged.payload)) return;

    const col = columns.get(parentId)!;
    const { originalIndex } = dragged.payload;
    const item = col.dataRef.current[originalIndex];
    if (item === undefined) return;

    const keyFn = col.keyExtractorRef?.current;
    if (!keyFn) return;
    const itemKey = keyFn(item, originalIndex);
    const height = col.itemHeightsRef.current.get(itemKey) ?? col.estimatedItemSize;

    // Don't constrain hover to cell dimensions — let it auto-size to card content.
    // dragged.measurements = DraxView size (fills cell), not the card's own size.
    // Setting {0,0} makes HoverLayer's dimensionStyle return {} → hover wraps content.
    hoverDimsSV.value = { x: 0, y: 0 };

    const dims = dragged.measurements;
    sourceInfoRef.current = {
      colId: parentId,
      itemKey,
      dragStartIndex: originalIndex,
      item,
      height,
      hoverWidth: dims?.width ?? 0,
      hoverHeight: dims?.height ?? 0,
    };
  }, [columns, draxViewProps]);

  const prevTargetColRef = useRef<string | undefined>(undefined);
  const prevInsertIdxRef = useRef<number>(-1);

  const onMonitorDragOver = useCallback((eventData: DraxMonitorEventData) => {
    draxViewProps?.onMonitorDragOver?.(eventData);

    const source = sourceInfoRef.current;
    if (!source) return;

    const targetColId = findTargetColumn(eventData.dragAbsolutePosition);
    const transfer = transferRef.current;

    if (targetColId && targetColId !== source.colId) {
      // ── Over a different column ──
      const targetCol = columns.get(targetColId);
      if (!targetCol) return;

      // Compute insert index in target (axis-aware for horizontal columns)
      const targetBounds = targetCol.containerMeasRef?.current;
      if (!targetBounds) return;
      const isTargetHoriz = targetCol.horizontal;
      const contentX = eventData.dragAbsolutePosition.x - targetBounds.x + (isTargetHoriz ? targetCol.scrollOffsetSV.value : 0);
      const contentY = eventData.dragAbsolutePosition.y - targetBounds.y + (isTargetHoriz ? 0 : targetCol.scrollOffsetSV.value);
      targetCol.freezeSlotBoundaries(); // Refresh boundaries for cross-container
      const insertIdx = targetCol.getSlotFromPosition(contentX, contentY);

      // Skip all work if target column AND slot haven't changed (avoids per-frame overhead)
      if (targetColId === prevTargetColRef.current && insertIdx === prevInsertIdxRef.current) return;
      prevTargetColRef.current = targetColId;
      prevInsertIdxRef.current = insertIdx;

      // For cross-orientation: target's primary axis = source's cross axis.
      // source.height = source's primary axis (from itemHeightsRef).
      // source column's itemCrossAxisRef has the cross-axis measurement.
      const srcCol = columns.get(source.colId);
      const sourceIsHoriz = srcCol?.horizontal ?? false;
      const crossOrientation = sourceIsHoriz !== isTargetHoriz;
      const sourceCross = srcCol?.itemCrossAxisRef.current.get(source.itemKey);
      const insertHeight = crossOrientation && sourceCross
        ? sourceCross
        : source.height;

      // Set cross-axis on target so alignment/styling works immediately
      const targetCross = crossOrientation ? source.height : (sourceCross ?? 0);
      targetCol.itemCrossAxisRef.current.set(source.itemKey, targetCross);
      // Re-enable shift animation on target (may be disabled from a previous data sync)
      targetCol.skipShiftAnimationSV.value = false;

      let slotChanged = false;
      let gridResult: ReturnType<typeof targetCol.computeGridPositions> | null = null;

      if (!transfer) {
        // First cross — remove from source, insert into target
        const sourceCol = columns.get(source.colId);
        sourceCol?.removeKey(source.itemKey);
        targetCol.insertKey(source.itemKey, insertIdx, insertHeight);
        transferRef.current = {
          sourceId: source.colId,
          targetId: targetColId,
          targetSlot: insertIdx,
          itemKey: source.itemKey,
          item: source.item,
          height: source.height,
          dragStartIndex: source.dragStartIndex,
        };
        slotChanged = true;
      } else if (transfer.targetId !== targetColId) {
        // Crossed to a DIFFERENT target — hide previous target's indicator
        const prevTarget = columns.get(transfer.targetId);
        prevTarget?.removeKey(source.itemKey);
        if (prevTarget) prevTarget.dropIndicatorVisibleSV.value = false;
        targetCol.insertKey(source.itemKey, insertIdx, insertHeight);
        transferRef.current = { ...transfer, targetId: targetColId, targetSlot: insertIdx };
        slotChanged = true;
      } else if (transfer.targetSlot !== insertIdx) {
        // Same target, different slot — only update shifts + indicator position (no React re-render)
        gridResult = targetCol.recomputeShiftsForReorder(source.itemKey, insertIdx);
        if (gridResult) {
          transferRef.current = { ...transfer, targetSlot: insertIdx };
          // Update indicator POSITION only (SV, no re-render needed — info is unchanged)
          const indicatorPos = gridResult.positions.get(source.itemKey);
          if (indicatorPos) targetCol.dropIndicatorPositionSV.value = indicatorPos;
        }
      }

      // Full indicator setup for first-cross and different-target (needs info + forceRender for ghost content)
      if (slotChanged) {
        const sourceCol = columns.get(source.colId);
        if (sourceCol) sourceCol.dropIndicatorVisibleSV.value = false;

        const result = gridResult ?? targetCol.computeGridPositions(targetCol.orderedKeysRef.current);
        const indicatorPos = result.positions.get(source.itemKey);
        const indicatorDims = result.dimensions.get(source.itemKey);
        if (indicatorPos) {
          targetCol.dropIndicatorInfoRef.current = {
            item: source.item,
            index: transferRef.current?.targetSlot ?? insertIdx,
            width: indicatorDims?.width ?? 0,
            height: indicatorDims?.height ?? source.height,
            isCrossContainer: true,
            isSource: false,
            horizontal: targetCol.horizontal,
            hoverWidth: source.hoverWidth,
            hoverHeight: source.hoverHeight,
            sourceListId: source.colId,
            targetListId: targetColId,
            fromIndex: source.dragStartIndex,
          };
          targetCol.dropIndicatorPositionSV.value = indicatorPos;
          targetCol.dropIndicatorGenSV.value++; // New indicator on target → snap (no spring from old position)
          targetCol.dropIndicatorVisibleSV.value = true;
          targetCol.forceRenderRef.current?.(); // Only on first-cross/different-target
        }
      }

    } else if (targetColId === source.colId && transfer) {
      // ── Returned to source ── reset tracking refs
      prevTargetColRef.current = undefined;
      prevInsertIdxRef.current = -1;
      const prevTarget = columns.get(transfer.targetId);
      prevTarget?.removeKey(source.itemKey);
      // Hide target's indicator
      if (prevTarget) prevTarget.dropIndicatorVisibleSV.value = false;

      const sourceCol = columns.get(source.colId);
      if (sourceCol) {
        const srcBounds = sourceCol.containerMeasRef?.current;
        const isSrcHoriz = sourceCol.horizontal;
        const contentX = srcBounds ? eventData.dragAbsolutePosition.x - srcBounds.x + (isSrcHoriz ? sourceCol.scrollOffsetSV.value : 0) : 0;
        const contentY = srcBounds
          ? eventData.dragAbsolutePosition.y - srcBounds.y + (isSrcHoriz ? 0 : sourceCol.scrollOffsetSV.value)
          : 0;
        sourceCol.freezeSlotBoundaries(); // Refresh boundaries
        const insertIdx = sourceCol.getSlotFromPosition(contentX, contentY);
        sourceCol.insertKey(source.itemKey, insertIdx, source.height);
        // Content size updates via totalContentSizeSV (animated style) — no forceRender needed

        // Restore source indicator
        const srcIndicatorResult = sourceCol.computeGridPositions(sourceCol.orderedKeysRef.current);
        const srcIndicatorPos = srcIndicatorResult.positions.get(source.itemKey);
        if (srcIndicatorPos) {
          sourceCol.dropIndicatorPositionSV.value = srcIndicatorPos;
          sourceCol.dropIndicatorGenSV.value++; // New indicator on source → snap (no spring from old position)
          sourceCol.dropIndicatorVisibleSV.value = true;
        }
      }

      transferRef.current = undefined;
    }
  }, [columns, draxViewProps]);

  const onMonitorDragEnd = useCallback((eventData: DraxMonitorEndEventData): DraxProtocolDragEndResponse => {
    const transfer = transferRef.current;
    const source = sourceInfoRef.current;

    if (transfer && !eventData.cancelled) {
      // Successful cross-container drop — compute snap target in target column
      const targetCol = columns.get(transfer.targetId);
      if (targetCol) {
        const bounds = targetCol.containerMeasRef?.current;
        const keys = targetCol.orderedKeysRef.current;
        const isTargetHoriz = targetCol.horizontal;

        // Use computeGridPositions for correct axis handling (horizontal + vertical)
        const result = targetCol.computeGridPositions(keys);
        const itemPos = result.positions.get(transfer.itemKey);

        if (bounds && itemPos) {
          // Snap: primary axis → slot position. Cross axis → center-offset hover to align card.
          const slotDims = result.dimensions.get(transfer.itemKey);
          const scrollX = isTargetHoriz ? targetCol.scrollOffsetSV.value : 0;
          const scrollY = isTargetHoriz ? 0 : targetCol.scrollOffsetSV.value;
          const hw = source?.hoverWidth ?? 0;

          let snapX: number;
          let snapY: number;
          if (isTargetHoriz) {
            // Horizontal target: X = primary (slot position), Y = cross (top-align, no center)
            snapX = bounds.x + itemPos.x - scrollX + ((slotDims?.width ?? 0) - hw) / 2;
            snapY = bounds.y + itemPos.y;
          } else {
            // Vertical target: Y = primary (slot position), X = cross (center-offset)
            snapX = bounds.x + itemPos.x + ((slotDims?.width ?? 0) - hw) / 2;
            snapY = bounds.y + itemPos.y - scrollY;
          }
          const snapTarget = { x: snapX, y: snapY };

          // Don't clear sourceInfoRef or transferRef — commitTransfer needs both
          draxViewProps?.onMonitorDragEnd?.(eventData);
          return snapTarget;
        }
      }
    }

    // Cancel — return item to source
    if (transfer && source) {
      const prevTarget = columns.get(transfer.targetId);
      prevTarget?.removeKey(transfer.itemKey);

      const sourceCol = columns.get(source.colId);
      sourceCol?.insertKey(source.itemKey, source.dragStartIndex, source.height);
    }

    transferRef.current = undefined;
    sourceInfoRef.current = undefined;
    prevTargetColRef.current = undefined;
    prevInsertIdxRef.current = -1;
    draxViewProps?.onMonitorDragEnd?.(eventData);
    // Return void — don't override list's snap target with Default
  }, [columns, draxViewProps]);

  const onMonitorDragDrop = useCallback((eventData: DraxMonitorDragDropEventData): DraxProtocolDragEndResponse => {
    const transfer = transferRef.current;
    if (transfer) {
      return onMonitorDragEnd({ ...eventData, cancelled: false } as DraxMonitorEndEventData);
    }
    draxViewProps?.onMonitorDragDrop?.(eventData);
    // Return void — don't override list's snap target with Default
  }, [onMonitorDragEnd, draxViewProps]);

  // ── Context ──
  const contextValue: import('./SortableBoardContext').SortableBoardContextValue = {
    registerColumn: board._internal.registerColumn,
    unregisterColumn: board._internal.unregisterColumn,
    columns,
    transferRef,
    commitTransfer,
  };

  return (
    <SortableBoardProvider value={contextValue}>
      <DraxView
        {...draxViewProps}
        style={[draxViewProps?.style, style]}
        draggable={false}
        receptive={false}
        monitoring
        onMonitorDragStart={onMonitorDragStart}
        onMonitorDragOver={onMonitorDragOver}
        onMonitorDragEnd={onMonitorDragEnd}
        onMonitorDragDrop={onMonitorDragDrop}
      >
        {children}
      </DraxView>
    </SortableBoardProvider>
  );
};
