import type { ReactNode, RefObject } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { runOnJS, runOnUI } from 'react-native-worklets';
import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import { useWebScrollFreeze } from './hooks/useWebScrollFreeze';
import { defaultAutoScrollIntervalLength, ITEM_SHIFT_ANIMATION_DURATION } from './params';
import { useSortableBoardContext } from './SortableBoardContext';
import type {
  DropIndicatorProps,
  Position,
  DraxDragEventData,
  DraxMonitorDragDropEventData,
  DraxMonitorEndEventData,
  DraxMonitorEventData,
  DraxProtocolDragEndResponse,
  DraxViewProps,
  SortableListHandle,
} from './types';
import {
  AutoScrollDirection,
  isSortableItemPayload,
  isWithCancelledFlag,
} from './types';

/**
 * Touch sensor jitter threshold in pixels.
 * Computes actual finger displacement from drag start and ignores
 * reorder when the finger hasn't meaningfully moved.
 */
const FINGER_JITTER_THRESHOLD = 5;

function computeFingerDisplacement(eventData: DraxDragEventData): number {
  const { grabOffset, measurements } = eventData.dragged;
  if (!measurements) return Infinity;
  const dx =
    grabOffset.x - measurements.width / 2 + eventData.dragTranslation.x;
  const dy =
    grabOffset.y - measurements.height / 2 + eventData.dragTranslation.y;
  return Math.abs(dx) + Math.abs(dy);
}

export interface SortableContainerProps {
  sortable: SortableListHandle<any>;
  scrollRef: RefObject<any>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  draxViewProps?: Partial<DraxViewProps>;
  renderDropIndicator?: (props: DropIndicatorProps) => ReactNode;
}

export const SortableContainer = ({
  sortable,
  scrollRef,
  style,
  children,
  draxViewProps,
  renderDropIndicator,
}: SortableContainerProps) => {
  const {
    id,
    horizontal,
    draggedItem,
    rawData,
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
    onDragStart: onDragStartCallback,
    onDragPositionChange: onDragPositionChangeCallback,
    onDragEnd: onDragEndCallback,
    onReorder,
    getMeasurementByOriginalIndex,
    dropTargetPositionSV,
    dropTargetVisibleSV,
    draggedDisplayIndexRef,
    dragStartIndexRef,
    initPendingOrder,
    commitVisualOrder,
    computeShiftsForOrder,
    pendingOrderRef,
    committedOrderRef,
    cancelDrag,
    shiftsRef,
    instantClearSV,
    shiftsValidSV,
    getSlotFromPosition,
  } = sortable._internal;

  // Access hover SharedValues from DraxContext for deferred clearing.
  const {
    hoverReadySV,
    dragPhaseSV,
    draggedIdSV,
    hoverPositionSV,
    hoverClearDeferredRef,
    setHoverContent,
  } = useDraxContext();

  const boardContext = useSortableBoardContext();

  useEffect(() => {
    if (!boardContext) return;
    boardContext.registerColumn(id, sortable._internal);
    return () => boardContext.unregisterColumn(id);
  }, [boardContext, id, sortable._internal]);

  const itemCount = rawData.length;
  const scrollStateRef = useRef(AutoScrollDirection.None);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const draggedToIndex = useRef<number | undefined>(undefined);
  const jitterExceededRef = useRef(false);
  // Track last receiver that triggered a reorder to prevent oscillation.
  // After moveDraggedItem inserts at position R, the receiver shifts to R-1.
  // Next frame, same receiver at R-1 would move backward — skip it.
  const lastMoveReceiverRef = useRef<number | undefined>(undefined);
  const lastMoveDirectionRef = useRef<number>(0); // +1 forward, -1 backward


  const { freeze: freezeScroll, unfreeze: unfreezeScroll } = useWebScrollFreeze(scrollRef);

  // ── Finalize drag (called after snap animation completes) ──────────

  const finalizeDrag = () => {
    unfreezeScroll();

    if (boardContext?.boardInternal.transferState.current?.targetId) {
      boardContext.boardInternal.finalizeTransfer?.();
      return;
    }

    const startIdx = dragStartIndexRef.current;
    const endIdx = draggedDisplayIndexRef.current;

    const pending = pendingOrderRef.current;
    const didReorder = startIdx !== undefined && endIdx !== undefined
      && startIdx !== endIdx && pending.length > 0;

    if (didReorder) {
      // Build final data BEFORE clearing refs
      const finalData = pending
        .map((idx) => rawData[idx])
        .filter((item): item is any => item !== undefined);
      const draggedOrigIdx = pending[endIdx];
      const displacedOrigIdx = pending[startIdx];

      const reorderEvent = {
        data: finalData,
        fromIndex: startIdx,
        toIndex: endIdx,
        fromItem: draggedOrigIdx !== undefined ? rawData[draggedOrigIdx] as any : undefined as any,
        toItem: displacedOrigIdx !== undefined ? rawData[displacedOrigIdx] as any : undefined as any,
        isExternalDrag: false,
      };

      {
        // ── PERMANENT SHIFTS: blink-free for all contexts ──
        const finalShifts = computeShiftsForOrder(pending) ?? {};
        commitVisualOrder();

        // Clear JS-thread refs BEFORE the runOnUI block.
        draggedDisplayIndexRef.current = undefined;
        dragStartIndexRef.current = undefined;
        pendingOrderRef.current = [];

        hoverClearDeferredRef.current = true;
        runOnUI((_shifts: Record<string, Position>) => {
          'worklet';
          instantClearSV.value = true;
          shiftsValidSV.value = true;
          shiftsRef.value = _shifts;
          draggedItem.value = -1;
          hoverReadySV.value = false;
          dragPhaseSV.value = 'idle';
          draggedIdSV.value = '';
          hoverPositionSV.value = { x: 0, y: 0 };
          runOnJS(setHoverContent)(null);
        })(finalShifts);

        requestAnimationFrame(() => {
          onReorder(reorderEvent);
          if (boardContext) {
            setTimeout(() => {
              sortable._internal.flushVisualOrder();
            }, 300);
          } else if (Platform.OS === 'web') {
            // On web, flush synchronously after onReorder so FlatList cells
            // move to correct positions immediately. The delayed flush caused
            // races when the user grabbed another item before it fired.
            sortable._internal.flushVisualOrder();
          }
        });
      }
    } else {
      // No reorder — cancel drag: revert to committed shifts + make item visible.
      cancelDrag();
      resetDraggedItem();
    }
  };

  // Register finalizeDrag via the stable ref so SortableItem always
  // calls the latest version, even if it has a stale _internal reference
  // (e.g., after MATCH path skips FlatList re-render).
  useLayoutEffect(() => {
    sortable._internal.onItemSnapEnd = finalizeDrag;
  }, [sortable._internal, finalizeDrag]);

  // ── Auto-scroll ─────────────────────────────────────────────────────

  const doScroll = () => {
    const containerMeasurements = containerMeasurementsRef.current;
    const contentSize = contentSizeRef.current;
    if (!scrollRef.current || !containerMeasurements || !contentSize) return;

    let containerLength: number;
    let contentLength: number;
    let prevOffset: number;
    if (horizontal) {
      containerLength = containerMeasurements.width;
      contentLength = contentSize.x;
      prevOffset = scrollPosition.value.x;
    } else {
      containerLength = containerMeasurements.height;
      contentLength = contentSize.y;
      prevOffset = scrollPosition.value.y;
    }

    const jumpLength = containerLength * autoScrollJumpRatio;
    let offset: number | undefined;
    if (scrollStateRef.current === AutoScrollDirection.Forward) {
      const maxOffset = contentLength - containerLength;
      if (prevOffset < maxOffset) {
        offset = Math.min(prevOffset + jumpLength, maxOffset);
      }
    } else if (scrollStateRef.current === AutoScrollDirection.Back) {
      if (prevOffset > 0) {
        offset = Math.max(prevOffset - jumpLength, 0);
      }
    }

    if (offset !== undefined && scrollRef.current.scrollToOffset) {
      scrollRef.current.scrollToOffset({ offset });
      if (scrollRef.current.flashScrollIndicators) {
        scrollRef.current.flashScrollIndicators();
      }
    }
  };

  const startScroll = () => {
    if (scrollIntervalRef.current) return;
    doScroll();
    scrollIntervalRef.current = setInterval(
      doScroll,
      defaultAutoScrollIntervalLength
    );
  };

  const stopScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = undefined;
    }
  };

  // ── Internal drag end handler ───────────────────────────────────────

  const handleInternalDragEnd = (
    eventData:
      | DraxMonitorEventData
      | DraxMonitorEndEventData
      | DraxMonitorDragDropEventData,
    totalDragEnd: boolean
  ): DraxProtocolDragEndResponse => {
    scrollStateRef.current = AutoScrollDirection.None;
    stopScroll();
    unfreezeScroll();
    dropTargetVisibleSV.value = false;

    const { dragged, receiver } = eventData;
    const draggedPayload = isSortableItemPayload(dragged.payload)
      ? dragged.payload
      : undefined;
    const externalDrag = dragged.parentId !== id || !draggedPayload;

    const fromIndex = dragStartIndexRef.current ?? draggedPayload?.index ?? 0;
    const fromOriginalIndex = draggedPayload?.originalIndex ?? fromIndex;
    const fromItem = externalDrag ? undefined : rawData[fromOriginalIndex];

    const receiverPayload = isSortableItemPayload(receiver?.payload)
      ? receiver?.payload
      : undefined;
    const toPayload =
      receiver?.parentId === id ? receiverPayload : undefined;

    if (totalDragEnd) {
      onDragEndCallback?.({
        index: fromIndex,
        item: fromItem as any,
        toIndex: draggedDisplayIndexRef.current,
        cancelled: isWithCancelledFlag(eventData)
          ? eventData.cancelled
          : false,
      });
    }

    // Reset drag position tracking
    if (draggedToIndex.current !== undefined) {
      if (!totalDragEnd) {
        onDragPositionChangeCallback?.({
          index: fromIndex,
          item: fromItem as any,
          toIndex: undefined,
          previousIndex: draggedToIndex.current,
        });
      }
      draggedToIndex.current = undefined;
    }

    // User hasn't moved — skip reorder, snap back to origin.
    // Don't clean up here — finalizeDrag handles it after snap completes.
    if (
      toPayload !== undefined &&
      computeFingerDisplacement(eventData) < FINGER_JITTER_THRESHOLD
    ) {
      return undefined;
    }

    // Reorder happened — return snap target. Don't commit yet;
    // finalizeDrag commits after the snap animation completes so
    // the hover covers any FlatList re-render.
    if (totalDragEnd && draggedDisplayIndexRef.current !== undefined) {
      // Shifts stay active during snap animation — items remain at their
      // shifted positions. finalizeDrag will set permanent shifts after snap.
      const snapbackTarget = getSnapbackTarget();
      return snapbackTarget;
    }

    // Dropped on a receiver outside this sortable list
    if (receiver && receiver.parentId !== id) {
      return undefined;
    }

    // External drag (item from another container) with no reorder — snap back
    // to original position. Without this, getMeasurementByOriginalIndex would
    // look up the wrong item in this container's data by the source index.
    if (externalDrag) {
      return undefined;
    }

    // No receiver — snap back to the dragged item's current position
    const containerMeasurements = containerMeasurementsRef.current;
    const fromMeas = getMeasurementByOriginalIndex(fromOriginalIndex);
    if (fromMeas && containerMeasurements) {
      return {
        x: containerMeasurements.x + fromMeas.x - scrollPosition.value.x,
        y: containerMeasurements.y + fromMeas.y - scrollPosition.value.y,
      };
    }
    return undefined;
  };

  // ── Monitor callbacks ───────────────────────────────────────────────

  const onMonitorDragStart = (eventData: DraxMonitorEventData) => {
    draxViewProps?.onMonitorDragStart?.(eventData);
    jitterExceededRef.current = false;
    lastMoveReceiverRef.current = undefined;
    lastMoveDirectionRef.current = 0;
    // Clear any stale freeze from a previous drag that failed to unfreeze
    // (e.g., fast cross-container gesture where onMonitorDragExit was skipped).
    unfreezeScroll();
    freezeScroll();

    const { dragged } = eventData;

    // No guard on draggedItem.value — Reanimated 4 doesn't reliably sync
    // SharedValue writes from runOnUI worklets, so the value may be stale.
    // onMonitorDragStart only fires at the start of a new gesture, so
    // setDraggedItem + initPendingOrder safely overwrite any stale state.

    if (
      dragged.parentId === id &&
      isSortableItemPayload(dragged.payload)
    ) {
      const { index, originalIndex } = dragged.payload;
      setDraggedItem(originalIndex);
      // Initialize pending order BEFORE setting display index.
      // initPendingOrder copies the committed visual order into pendingOrderRef.
      initPendingOrder();
      // Map FlatList index to committed visual order position.
      // With stableData, FlatList renders original data and permanent shifts
      // handle visual order. The dragged item at FlatList cell `index`
      // may be at a different visual position in the committed order.
      const committed = committedOrderRef.current;
      let displayIndex = index;
      if (committed.length > 0) {
        const pos = committed.indexOf(originalIndex);
        if (pos >= 0) displayIndex = pos;
      }
      draggedDisplayIndexRef.current = displayIndex;
      dragStartIndexRef.current = displayIndex;
      // Item visibility is controlled by hoverReadySV from DraxContext.
      onDragStartCallback?.({
        index: displayIndex,
        item: rawData[originalIndex] as any,
      });
    }
  };

  const onMonitorDragOver = (eventData: DraxMonitorEventData) => {
    const displacement = computeFingerDisplacement(eventData);
    if (!jitterExceededRef.current) {
      if (displacement < FINGER_JITTER_THRESHOLD) {
        draxViewProps?.onMonitorDragOver?.(eventData);
        return;
      }
      jitterExceededRef.current = true;
      // Item visibility is now controlled by hoverReadySV from DraxContext —
      // SortableItem hides when hoverReadySV && draggedIdSV match.
      // No need for setDraggedKey here.
    }

    draxViewProps?.onMonitorDragOver?.(eventData);

    const { dragged, monitorOffset, monitorOffsetRatio } = eventData;
    const draggedPayload = isSortableItemPayload(dragged.payload)
      ? dragged.payload
      : undefined;
    const externalDrag = dragged.parentId !== id || !draggedPayload;
    const fromIndex = dragStartIndexRef.current ?? draggedPayload?.index ?? 0;
    const fromItem = externalDrag
      ? undefined
      : rawData[draggedPayload?.originalIndex ?? fromIndex];

    if (typeof draggedItem.value !== 'number' || draggedItem.value < 0) {
      setDraggedItem(itemCount);
    }

    // ── Position-based slot detection ──────────────────────────────────
    // Use the hover center's content position. Slot boundaries are based
    // on original layout positions (stable, never shift during drag).
    const contentPos = {
      x: monitorOffset.x + scrollPosition.value.x,
      y: monitorOffset.y + scrollPosition.value.y,
    };
    const targetSlot = getSlotFromPosition(contentPos);

    // Track drag position changes (log only on slot change to avoid per-frame noise)
    if (targetSlot !== draggedToIndex.current) {
      onDragPositionChangeCallback?.({
        toIndex: targetSlot,
        index: fromIndex,
        item: fromItem as any,
        previousIndex: draggedToIndex.current,
      });
      draggedToIndex.current = targetSlot;

      // Update drop indicator
      if (renderDropIndicator) {
        const pending = pendingOrderRef.current;
        const slotOrigIdx = pending.length > targetSlot ? pending[targetSlot] : undefined;
        const toMeas = slotOrigIdx !== undefined
          ? getMeasurementByOriginalIndex(slotOrigIdx)
          : undefined;
        if (toMeas) {
          const currentDragIdx = draggedDisplayIndexRef.current ?? fromIndex;
          const isForward = currentDragIdx < targetSlot;
          if (horizontal) {
            dropTargetPositionSV.value = {
              x: isForward ? toMeas.x + toMeas.width : toMeas.x,
              y: toMeas.y,
            };
          } else {
            dropTargetPositionSV.value = {
              x: toMeas.x,
              y: isForward ? toMeas.y + toMeas.height : toMeas.y,
            };
          }
          dropTargetVisibleSV.value = true;
        }
      } else {
        dropTargetVisibleSV.value = false;
      }
    }

    // Reorder via position-based slot (not receiver-based).
    // Receiver detection uses the spatial index which stores FlatList layout
    // positions. With stableData, these become stale after the first reorder
    // because shifts move items visually but don't update the spatial index.
    const currentDragIdx = draggedDisplayIndexRef.current;
    if (currentDragIdx !== undefined && targetSlot !== currentDragIdx) {
      const direction = Math.sign(targetSlot - currentDragIdx);
      const sameTarget = lastMoveReceiverRef.current === targetSlot;
      const wouldReverse = sameTarget && direction !== 0
        && direction !== lastMoveDirectionRef.current;

      if (!wouldReverse) {
        if (direction !== 0) {
          lastMoveReceiverRef.current = targetSlot;
          lastMoveDirectionRef.current = direction;
        }
        moveDraggedItem(targetSlot);
      }
    }

    // Auto-scroll
    const ratio = horizontal ? monitorOffsetRatio.x : monitorOffsetRatio.y;
    if (ratio > autoScrollBackThreshold && ratio < autoScrollForwardThreshold) {
      scrollStateRef.current = AutoScrollDirection.None;
      stopScroll();
    } else {
      if (ratio >= autoScrollForwardThreshold) {
        scrollStateRef.current = AutoScrollDirection.Forward;
      } else if (ratio <= autoScrollBackThreshold) {
        scrollStateRef.current = AutoScrollDirection.Back;
      }
      startScroll();
    }
  };

  const onMonitorDragExit = (eventData: DraxMonitorEventData) => {
    stopScroll();
    if (scrollIntervalRef.current) {
      draxViewProps?.onMonitorDragExit?.(eventData);
      return;
    }
    handleInternalDragEnd(eventData, false);
    draxViewProps?.onMonitorDragExit?.(eventData);
  };

  const onMonitorDragEnd = (eventData: DraxMonitorEndEventData) => {
    if (boardContext?.boardInternal.transferState.current?.targetId) {
      unfreezeScroll();
      draxViewProps?.onMonitorDragEnd?.(eventData);
      return undefined;
    }
    const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
    const providedSnapTarget =
      draxViewProps?.onMonitorDragEnd?.(eventData);

    return providedSnapTarget ?? defaultSnapbackTarget;
  };

  const onMonitorDragDrop = (eventData: DraxMonitorDragDropEventData) => {
    if (boardContext?.boardInternal.transferState.current?.targetId) {
      unfreezeScroll();
      draxViewProps?.onMonitorDragDrop?.(eventData);
      return undefined;
    }
    const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
    const providedSnapTarget =
      draxViewProps?.onMonitorDragDrop?.(eventData);

    return providedSnapTarget ?? defaultSnapbackTarget;
  };

  const handleMeasure = (event: any) => {
    draxViewProps?.onMeasure?.(event);
    containerMeasurementsRef.current = event;
  };

  return (
    <DraxView
      {...draxViewProps}
      style={[draxViewProps?.style, style]}
      id={id}
      isParent
      scrollPosition={scrollPosition}
      monitoring
      onMeasure={handleMeasure}
      onMonitorDragStart={onMonitorDragStart}
      onMonitorDragOver={onMonitorDragOver}
      onMonitorDragExit={onMonitorDragExit}
      onMonitorDragEnd={onMonitorDragEnd}
      onMonitorDragDrop={onMonitorDragDrop}
    >
      {children}
      {renderDropIndicator && (
        <DropIndicatorOverlay
          dropTargetPositionSV={dropTargetPositionSV}
          dropTargetVisibleSV={dropTargetVisibleSV}
          horizontal={horizontal}
          renderDropIndicator={renderDropIndicator}
        />
      )}
    </DraxView>
  );
};

/** Extracted so useAnimatedStyle is always called when the component mounts. */
const DropIndicatorOverlay = ({
  dropTargetPositionSV,
  dropTargetVisibleSV,
  horizontal,
  renderDropIndicator,
}: {
  dropTargetPositionSV: SharedValue<Position>;
  dropTargetVisibleSV: SharedValue<boolean>;
  horizontal: boolean;
  renderDropIndicator: (props: DropIndicatorProps) => ReactNode;
}) => {
  const indicatorStyle = useAnimatedStyle(() => {
    const pos = dropTargetPositionSV.value;
    const visible = dropTargetVisibleSV.value;
    return {
      opacity: visible ? 1 : 0,
      transform: [
        { translateX: withTiming(pos.x, { duration: ITEM_SHIFT_ANIMATION_DURATION }) },
        { translateY: withTiming(pos.y, { duration: ITEM_SHIFT_ANIMATION_DURATION }) },
      ] as const,
    };
  });

  return (
    <Reanimated.View
      style={[dropIndicatorStyles.container, indicatorStyle]}
      pointerEvents="none"
    >
      {renderDropIndicator({ visible: true, horizontal })}
    </Reanimated.View>
  );
};

const dropIndicatorStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
