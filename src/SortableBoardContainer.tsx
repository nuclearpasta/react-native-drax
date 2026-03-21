import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { withDelay, withTiming } from 'react-native-reanimated';
import { runOnJS, runOnUI } from 'react-native-worklets';
import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import { defaultSnapbackDelay, defaultSnapbackDuration } from './params';
import { SortableBoardContext } from './SortableBoardContext';
import type {
  DraxMonitorEndEventData,
  DraxMonitorEventData,
  DraxMonitorDragDropEventData,
  DraxProtocolDragEndResponse,
  DraxViewProps,
  Position,
  SortableBoardContextValue,
  SortableBoardHandle,
  SortableBoardInternal,
  SortableListInternal,
  ViewDimensions,
} from './types';
import { isSortableItemPayload } from './types';

export interface SortableBoardContainerProps<TItem = unknown> {
  board: SortableBoardHandle<TItem>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  draxViewProps?: Partial<DraxViewProps>;
}

export const SortableBoardContainer = <TItem,>({
  board,
  style,
  children,
  draxViewProps,
}: SortableBoardContainerProps<TItem>) => {
  const boardInternal = board._internal;
  const columns = boardInternal.columns;
  const transferStateRef = boardInternal.transferState;

  const {
    hoverClearDeferredRef,
    draggedIdSV,
    hoverReadySV,
    dragPhaseSV,
    hoverPositionSV,
    hoverDimsSV,
    setHoverContent,
  } = useDraxContext();

  // Source info recorded on drag start
  const sourceInfoRef = useRef<{
    colId: string;
    originalIndex: number;
    itemKey: string;
    dragStartIndex: number;
    dimensions: ViewDimensions;
  } | undefined>(undefined);

  // ── Find which column contains the given absolute position ──────────
  const findTargetColumn = (absolutePos: Position): string | undefined => {
    for (const [colId, internal] of columns.entries()) {
      const bounds = internal.containerMeasurementsRef.current;
      if (!bounds) continue;
      if (
        absolutePos.x >= bounds.x &&
        absolutePos.x <= bounds.x + bounds.width &&
        absolutePos.y >= bounds.y &&
        absolutePos.y <= bounds.y + bounds.height
      ) {
        return colId;
      }
    }
    return undefined;
  };

  // ── Convert absolute position to column content position ────────────
  const toContentPos = (
    absolutePos: Position,
    col: SortableListInternal<unknown>
  ): Position => {
    const bounds = col.containerMeasurementsRef.current;
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: absolutePos.x - bounds.x + col.scrollPosition.value.x,
      y: absolutePos.y - bounds.y + col.scrollPosition.value.y,
    };
  };

  // ── Finalize cross-container transfer ─────────────────────────────────
  // 1. Clear source/target JS-thread drag refs
  // 2. Clear source draggedItem on UI thread
  // 3. rAF → onTransfer → parent setState → useLayoutEffect updates stableData
  //    (hover covers any brief re-layout; React 18 flushes setStableData
  //    synchronously from useLayoutEffect, so FlatList re-renders before paint)
  // 4. Guarded rAF → rAF → clear hover (skipped if a new drag already started)
  const finalizeTransferRef = useRef<(() => void) | undefined>(undefined);
  /** Generation counter — incremented on each new drag start.
   *  Deferred hover cleanup checks this to skip if a new drag has started. */
  const cleanupGenRef = useRef(0);

  finalizeTransferRef.current = () => {
    const transfer = transferStateRef.current;
    if (!transfer || !transfer.targetId) return;

    const source = columns.get(transfer.sourceId);
    const target = columns.get(transfer.targetId);
    if (!source || !target) return;

    const phantomIndex = target.phantomRef.current?.atDisplayIndex ?? transfer.targetSlot ?? 0;

    const item = source.rawData[transfer.sourceOriginalIndex] as TItem;


    // 1. Clear source drag refs
    source.draggedDisplayIndexRef.current = undefined;
    source.dragStartIndexRef.current = undefined;
    source.pendingOrderRef.current = [];

    // Clear target phantom ref (JS-thread only, shifts stay for now).
    target.phantomRef.current = undefined;
    target.pendingOrderRef.current = [];

    // Keep hover visible during transition
    hoverClearDeferredRef.current = true;

    // Clear board/transfer state
    transferStateRef.current = undefined;
    sourceInfoRef.current = undefined;

    // 2. Clear source draggedItem AND draggedIdSV on UI thread.
    const sourceItemKey = transfer.itemKey;

    runOnUI((
      _srcDraggedItem: typeof source.draggedItem,
      _draggedIdSV: typeof draggedIdSV,
      _shiftsRef: typeof source.shiftsRef,
      _key: string,
    ) => {
      'worklet';
      const current = _shiftsRef.value;
      _shiftsRef.value = { ...current, [_key]: { x: -9999, y: -9999 } };
      _srcDraggedItem.value = -1;
      _draggedIdSV.value = '';
    })(source.draggedItem, draggedIdSV, source.shiftsRef, sourceItemKey);

    // 3. rAF → onTransfer → parent setState
    const gen = ++cleanupGenRef.current;

    requestAnimationFrame(() => {

      boardInternal.onTransfer({
        item,
        fromContainerId: transfer.sourceId,
        fromIndex: transfer.dragStartIndex,
        toContainerId: transfer.targetId!,
        toIndex: phantomIndex,
      });

      // 4. Wait for React render + Fabric commit, then clear hover.
      requestAnimationFrame(() => {

        requestAnimationFrame(() => {

          if (cleanupGenRef.current !== gen) {

            return;
          }

          runOnUI((
            _hoverReadySV: typeof hoverReadySV,
            _dragPhaseSV: typeof dragPhaseSV,
            _draggedIdSV: typeof draggedIdSV,
            _hoverPositionSV: typeof hoverPositionSV,
            _hoverDimsSV: typeof hoverDimsSV,
            _setHoverContent: typeof setHoverContent,
          ) => {
            'worklet';
            _hoverReadySV.value = false;
            _dragPhaseSV.value = 'idle';
            _draggedIdSV.value = '';
            _hoverPositionSV.value = { x: 0, y: 0 };
            _hoverDimsSV.value = { x: 0, y: 0 };
            runOnJS(_setHoverContent)(null);
          })(hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV, hoverDimsSV, setHoverContent);
        });
      });
    });
  };
  useEffect(() => {
    boardInternal.finalizeTransfer = () => finalizeTransferRef.current?.();
  });

  // ── Monitor callbacks ──────────────────────────────────────────────

  const onMonitorDragStart = (eventData: DraxMonitorEventData) => {
    draxViewProps?.onMonitorDragStart?.(eventData);

    // Invalidate any pending deferred hover cleanup from a previous transfer
    cleanupGenRef.current++;

    // Reset hover dimensions from any previous cross-container transfer
    hoverDimsSV.value = { x: 0, y: 0 };

    const { dragged } = eventData;
    const parentId = dragged.parentId;
    if (!parentId || !columns.has(parentId)) return;
    if (!isSortableItemPayload(dragged.payload)) return;

    const sourceCol = columns.get(parentId)!;
    const { originalIndex } = dragged.payload;
    const item = sourceCol.rawData[originalIndex];
    if (item === undefined) return;

    const itemKey = sourceCol.keyExtractor(item, originalIndex);
    const dims = dragged.measurements
      ? { width: dragged.measurements.width, height: dragged.measurements.height }
      : { width: 0, height: 0 };

    // Determine display index (accounting for committed visual order)
    const committed = sourceCol.committedOrderRef.current;
    let displayIndex = dragged.payload.index;
    if (committed.length > 0) {
      const pos = committed.indexOf(originalIndex);
      if (pos >= 0) displayIndex = pos;
    }

    // Set hover dimensions to source item size for cross-container dimension animation
    if (dims.width > 0 && dims.height > 0) {
      hoverDimsSV.value = { x: dims.width, y: dims.height };
    }

    sourceInfoRef.current = {
      colId: parentId,
      originalIndex,
      itemKey,
      dragStartIndex: displayIndex,
      dimensions: dims,
    };
  };

  const onMonitorDragOver = (eventData: DraxMonitorEventData) => {
    draxViewProps?.onMonitorDragOver?.(eventData);

    const source = sourceInfoRef.current;
    if (!source) return;

    const targetColId = findTargetColumn(eventData.dragAbsolutePosition);
    const transfer = transferStateRef.current;

    if (targetColId && targetColId !== source.colId) {
      // ── Drag is over a different column → cross-container ──────
      const targetCol = columns.get(targetColId);
      if (!targetCol) return;

      // Ensure target column's pending order is initialized for slot computation
      if (targetCol.pendingOrderRef.current.length === 0) {
        const committed = targetCol.committedOrderRef.current;
        targetCol.pendingOrderRef.current = committed.length > 0
          ? [...committed]
          : [...targetCol.originalIndexes];
      }

      const contentPos = toContentPos(eventData.dragAbsolutePosition, targetCol);
      const insertIdx = targetCol.getSlotFromPosition(contentPos);

      if (!transfer) {
        // First time crossing — eject from source, set phantom in target
        const sourceCol = columns.get(source.colId);
        sourceCol?.ejectDraggedItem();

        transferStateRef.current = {
          sourceId: source.colId,
          sourceOriginalIndex: source.originalIndex,
          itemKey: source.itemKey,
          itemDimensions: source.dimensions,
          dragStartIndex: source.dragStartIndex,
          targetId: targetColId,
          targetSlot: insertIdx,
        };

        targetCol.setPhantomSlot(insertIdx, source.dimensions.width, source.dimensions.height);
      } else if (transfer.targetId !== targetColId) {
        // Crossed to a DIFFERENT target column — clear old target, set new
        if (transfer.targetId) {
          const prevTarget = columns.get(transfer.targetId);
          prevTarget?.clearPhantomSlot();
        }
        transferStateRef.current = { ...transfer, targetId: targetColId, targetSlot: insertIdx };
        targetCol.setPhantomSlot(insertIdx, source.dimensions.width, source.dimensions.height);
      } else if (transfer.targetSlot !== insertIdx) {
        // Same target column — update phantom position only if slot changed
        transferStateRef.current = { ...transfer, targetSlot: insertIdx };
        targetCol.setPhantomSlot(insertIdx, source.dimensions.width, source.dimensions.height);
      }
    } else if (targetColId === source.colId && transfer) {
      // ── Drag returned to source column ─────────────────────────
      // Clear target phantom
      if (transfer.targetId) {
        const prevTarget = columns.get(transfer.targetId);
        prevTarget?.clearPhantomSlot();
      }

      // Reinject item into source
      const sourceCol = columns.get(source.colId);
      if (sourceCol) {
        const contentPos = toContentPos(eventData.dragAbsolutePosition, sourceCol);
        const insertIdx = sourceCol.pendingOrderRef.current.length > 0
          ? sourceCol.getSlotFromPosition(contentPos)
          : source.dragStartIndex;
        sourceCol.reinjectDraggedItem(insertIdx, source.originalIndex);
      }

      // Clear transfer state — source column's monitor handles from here
      transferStateRef.current = undefined;
    } else if (!targetColId && transfer) {
      // ── Drag is outside all columns but transfer was active ────
      if (transfer.targetId) {
        const prevTarget = columns.get(transfer.targetId);
        prevTarget?.clearPhantomSlot();
      }

      // Reinject into source at original position
      const sourceCol = columns.get(source.colId);
      sourceCol?.reinjectDraggedItem(source.dragStartIndex, source.originalIndex);

      transferStateRef.current = undefined;
    }
  };

  const onMonitorDragEnd = (eventData: DraxMonitorEndEventData): DraxProtocolDragEndResponse => {
    const transfer = transferStateRef.current;
    const cancelled = eventData.cancelled;

    if (transfer && transfer.targetId && !cancelled) {
      // Successful drop during cross-container transfer — snap to phantom position
      const targetCol = columns.get(transfer.targetId);
      if (targetCol) {
        const snapTarget = targetCol.getPhantomSnapTarget();
        // Clear source info to prevent spurious re-triggers during snap animation
        sourceInfoRef.current = undefined;

        // Animate hover dimensions from source to target size during snap.
        // This causes the hover content to reflow naturally (width/height change,
        // not scale) so the card smoothly transitions to the target column's size.
        const sourceDims = transfer.itemDimensions;
        const firstItemMeas = targetCol.itemMeasurements.current.values().next().value;
        if (sourceDims && firstItemMeas && sourceDims.width > 0 && sourceDims.height > 0) {
          if (Math.abs(firstItemMeas.width - sourceDims.width) > 2 ||
              Math.abs(firstItemMeas.height - sourceDims.height) > 2) {
            const snapDelay = draxViewProps?.snapDelay ?? defaultSnapbackDelay;
            const snapDuration = draxViewProps?.snapDuration ?? defaultSnapbackDuration;
            hoverDimsSV.value = withDelay(snapDelay,
              withTiming(
                { x: firstItemMeas.width, y: firstItemMeas.height },
                { duration: snapDuration },
              ),
            );
          }
        }

        draxViewProps?.onMonitorDragEnd?.(eventData);
        return snapTarget;
      }
    }

    if (transfer) {
      // Cancelled or no target — clear phantom and reinject
      if (transfer.targetId) {
        const prevTarget = columns.get(transfer.targetId);
        prevTarget?.clearPhantomSlot();
      }
      const sourceCol = columns.get(transfer.sourceId);
      if (sourceCol) {
        sourceCol.reinjectDraggedItem(
          transfer.dragStartIndex,
          transfer.sourceOriginalIndex,
        );
      }
      transferStateRef.current = undefined;
    }

    sourceInfoRef.current = undefined;

    const provided = draxViewProps?.onMonitorDragEnd?.(eventData);
    return provided;
  };

  const onMonitorDragDrop = (eventData: DraxMonitorDragDropEventData): DraxProtocolDragEndResponse => {
    // For cross-container, drops go through onMonitorDragEnd (no receiver).
    // This handles the case where a receiver exists.
    const transfer = transferStateRef.current;

    if (transfer && transfer.targetId) {
      const targetCol = columns.get(transfer.targetId);
      if (targetCol) {
        const snapTarget = targetCol.getPhantomSnapTarget();
        sourceInfoRef.current = undefined;
        draxViewProps?.onMonitorDragDrop?.(eventData);
        return snapTarget;
      }
    }

    sourceInfoRef.current = undefined;
    return draxViewProps?.onMonitorDragDrop?.(eventData);
  };

  // ── Context value ──────────────────────────────────────────────────

  // Pass boardInternal directly — NOT a copy. The useEffect above mutates
  // boardInternal.finalizeTransfer after render. A snapshot copy would capture
  // `undefined` and memoization would never update it.
  // Cast needed: SortableBoardInternal<TItem> → SortableBoardInternal<unknown>
  // is safe because consumers only read transferState and finalizeTransfer.
  const contextValue: SortableBoardContextValue = {
    registerColumn: boardInternal.registerColumn,
    unregisterColumn: boardInternal.unregisterColumn,
    boardInternal: boardInternal as SortableBoardInternal<unknown>,
  };

  return (
    <SortableBoardContext.Provider value={contextValue}>
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
    </SortableBoardContext.Provider>
  );
};
