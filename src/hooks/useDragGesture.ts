import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useDraxPanGesture } from '../compat';
import { computeAbsolutePositionWorklet, hitTestWorklet } from '../math';
import type { Position } from '../types';
import { useDraxContext } from './useDraxContext';

/**
 * Creates a Pan gesture for a draggable DraxView.
 * Hit-testing runs entirely on the UI thread — zero scheduleOnRN per frame
 * unless the receiver changes.
 *
 * On RNGH v3, `enabledSV` and `longPressDelaySV` are SharedValues that
 * reconfigure the native gesture handler on the UI thread — zero JS bridge.
 * On RNGH v2, they are mirrored to plain values with gesture recreation on change.
 */
/** Worklet-accessible sortable config for UI-thread slot detection */
export interface SortableWorkletConfig {
  frozenBoundariesSV: SharedValue<{ key: string; x: number; y: number; width: number; height: number }[]>;
  orderedKeysSV: SharedValue<string[]>;
  basePositionsSV: SharedValue<Record<string, Position>>;
  itemHeightsSV: SharedValue<Record<string, number>>;
  currentSlotSV: SharedValue<number>;
  isDraggingSV: SharedValue<boolean>;
  containerMeasSV: SharedValue<{ x: number; y: number; width: number; height: number } | null>;
  cellShiftRecordSV: SharedValue<Record<string, SharedValue<Position>>>;
  cumulativeEndsSV: SharedValue<number[]>;
  draggedKeySV: SharedValue<string>;
  dropIndicatorPositionSV: SharedValue<Position>;
  scrollOffsetSV: SharedValue<number>;
  snapTargetSV: SharedValue<Position>;
  numColumns: number;
  horizontal: boolean;
  estimatedItemSize: number;
  reorderStrategy: string;
  getSlotFromPositionWorklet: (contentX: number, contentY: number, boundaries: any[], cumulativeEnds: number[], cols: number, horiz: boolean) => number;
  recomputeShiftsWorklet: (dragKey: string, targetSlot: number, keys: string[], basePosRecord: Record<string, Position>, heightsRecord: Record<string, number>, cellShiftRecord: Record<string, SharedValue<Position>>, estItemSize: number, horiz: boolean, strategy: string) => string[] | null;
}

export const useDragGesture = (
  id: string,
  viewSpatialIndexSV: SharedValue<number>,
  enabledSV: SharedValue<boolean>,
  longPressDelaySV: SharedValue<number>,
  lockDragXPosition?: boolean,
  lockDragYPosition?: boolean,
  dragBoundsSV?: SharedValue<{ x: number; y: number; width: number; height: number } | null>,
  dragActivationFailOffset?: number,
  scrollHorizontal?: boolean,
  handleOffsetSV?: SharedValue<Position>,
  sortableWorklet?: SortableWorkletConfig,
) => {
  const {
    draggedIdSV,
    receiverIdSV,
    rejectedReceiverIdSV,
    dragPhaseSV,
    hoverPositionSV,
    dragAbsolutePositionSV,
    spatialIndexSV,
    scrollOffsetsSV,
    grabOffsetSV,
    startPositionSV,
    rootOffsetSV,
    handleDragStart,
    handleReceiverChange,
    handleDragEnd,
    isDragAllowedSV,
  } = useDraxContext();

  // On web, RNGH defaults touch-action to 'none' which blocks native scroll.
  // Allow the scroll direction so users can scroll before long-press activates.
  // SortableContainer freezes the scroll container when drag starts.
  //
  // Priority: lockDragYPosition (explicit axis lock → pan-x) > scrollHorizontal
  // (hint from SortableItem for horizontal lists without axis lock) > default pan-y.
  const touchAction = Platform.OS === 'web'
    ? ((lockDragYPosition || scrollHorizontal) ? 'pan-x' : 'pan-y')
    : undefined;

  const failOffset = dragActivationFailOffset !== undefined
    ? [-dragActivationFailOffset, dragActivationFailOffset] as [number, number]
    : undefined;

  const gesture = useDraxPanGesture({
    enabledSV,
    longPressDelaySV,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    touchAction,
    failOffsetX: failOffset,
    failOffsetY: failOffset,
    onActivate: (event) => {
      'worklet';

      // Block new drags until previous snap completes
      if (!isDragAllowedSV.value) return;
      isDragAllowedSV.value = false; // Lock — released in onSnapComplete

      // DO NOT set isDraggingSV here. It gates worklet slot detection (onUpdate).
      // syncRefsToWorklet (called from onMonitorDragStart on JS thread) writes
      // isDraggingSV=true LAST in an atomic scheduleOnUI batch with all other SVs.
      // Setting it here would let the worklet run with stale base positions,
      // computing wrong shifts that cause items to jump to incorrect positions.

      // Convert screen-absolute touch to root-view-relative
      const rootOffset = rootOffsetSV.value;
      const rootRelX = event.absoluteX - rootOffset.x;
      const rootRelY = event.absoluteY - rootOffset.y;

      // Derive the view's visual position from the gesture event.
      // event.x/y = touch relative to the gesture view's bounds (includes transforms).
      // This is correct for both normal views and shifted items with permanent transforms.
      const viewAbsPos: Position = {
        x: rootRelX - event.x,
        y: rootRelY - event.y,
      };

      // Grab offset = touch position within the view.
      // For drag handles: event.x/y is relative to the handle, not the parent DraxView.
      // Add handleOffsetSV (handle's position within parent) to correct.
      const ho = handleOffsetSV?.value ?? { x: 0, y: 0 };
      const grabOffset: Position = {
        x: event.x + ho.x,
        y: event.y + ho.y,
      };

      // Store shared state (all positions in root-relative space).
      // Kill stale hover from previous drag (content still in DOM, phase='releasing' → opacity 1).
      // Must happen on UI thread (worklet) for SAME-FRAME effect — JS writes have a 1-frame delay.
      // Cell blink is safe: hoverReadySV is false → cell opacity stays 1 until HoverLayer is ready.
      dragPhaseSV.value = 'idle';
      draggedIdSV.value = id;
      grabOffsetSV.value = grabOffset;
      startPositionSV.value = { x: rootRelX, y: rootRelY };
      dragAbsolutePositionSV.value = { x: rootRelX, y: rootRelY };

      // Compute initial hover position (root-relative)
      let hoverX = lockDragXPosition ? viewAbsPos.x : rootRelX - grabOffset.x;
      let hoverY = lockDragYPosition ? viewAbsPos.y : rootRelY - grabOffset.y;

      // Clamp to drag bounds if specified
      if (dragBoundsSV?.value) {
        const b = dragBoundsSV.value;
        const entries = spatialIndexSV.value;
        const viewEntry = entries[viewSpatialIndexSV.value];
        const vw = viewEntry ? viewEntry.width : 0;
        const vh = viewEntry ? viewEntry.height : 0;
        hoverX = Math.max(b.x, Math.min(b.x + b.width - vw, hoverX));
        hoverY = Math.max(b.y, Math.min(b.y + b.height - vh, hoverY));
      }

      hoverPositionSV.value = { x: hoverX, y: hoverY };

      // Reset receiver and rejection cache
      receiverIdSV.value = '';
      rejectedReceiverIdSV.value = '';

      // Bounce to JS for callback dispatch + hover content setup
      scheduleOnRN(handleDragStart,
        id,
        { x: rootRelX, y: rootRelY },
        grabOffset
      );
    },
    onUpdate: (event) => {
      'worklet';

      // Convert screen-absolute touch to root-view-relative
      const rootOffset = rootOffsetSV.value;
      const rootRelX = event.absoluteX - rootOffset.x;
      const rootRelY = event.absoluteY - rootOffset.y;
      const rootRelPos: Position = { x: rootRelX, y: rootRelY };

      dragAbsolutePositionSV.value = rootRelPos;

      // Compute hover position (root-relative)
      const grabOffset = grabOffsetSV.value;

      // Read current spatial index
      const spatialIndex = viewSpatialIndexSV.value;
      const entries = spatialIndexSV.value;
      const viewAbsPos = computeAbsolutePositionWorklet(
        spatialIndex,
        entries,
        scrollOffsetsSV.value
      );

      let hoverX = lockDragXPosition ? viewAbsPos.x : rootRelX - grabOffset.x;
      let hoverY = lockDragYPosition ? viewAbsPos.y : rootRelY - grabOffset.y;

      // Clamp to drag bounds if specified
      if (dragBoundsSV?.value) {
        const b = dragBoundsSV.value;
        const viewEntry = entries[spatialIndex];
        const vw = viewEntry ? viewEntry.width : 0;
        const vh = viewEntry ? viewEntry.height : 0;
        hoverX = Math.max(b.x, Math.min(b.x + b.width - vw, hoverX));
        hoverY = Math.max(b.y, Math.min(b.y + b.height - vh, hoverY));
      }

      hoverPositionSV.value = { x: hoverX, y: hoverY };

      // Hit-test at the center of the hover view (not at the raw finger position)
      // so that receiving activates when the dragged item visually overlaps the receiver.
      const viewEntry = entries[spatialIndex];
      const hitTestPos: Position = {
        x: hoverX + (viewEntry ? viewEntry.width / 2 : 0),
        y: hoverY + (viewEntry ? viewEntry.height / 2 : 0),
      };
      dragAbsolutePositionSV.value = hitTestPos;

      const result = hitTestWorklet(
        hitTestPos,
        entries,
        scrollOffsetsSV.value,
        id,
        viewEntry ? { width: viewEntry.width, height: viewEntry.height } : undefined
      );

      // Skip the rejected receiver — don't set it in receiverIdSV and don't
      // send it to JS. This prevents the reject → clear → re-detect → reject loop.
      let candidateReceiverId = result.receiverId;
      if (candidateReceiverId === rejectedReceiverIdSV.value) {
        candidateReceiverId = '';
      }

      // Clear rejection cache once drag leaves the rejected receiver's bounds
      if (result.receiverId !== rejectedReceiverIdSV.value && rejectedReceiverIdSV.value !== '') {
        rejectedReceiverIdSV.value = '';
      }

      // Always bounce to JS for callback dispatch.
      // handleReceiverChange safely handles same-receiver calls (skips exit/enter)
      // and dispatches continuous callbacks (onDrag, onDragOver, onReceiveDragOver)
      // plus monitor position updates for slot detection.
      const oldReceiver = receiverIdSV.value;
      const receiverChanged = candidateReceiverId !== oldReceiver;
      if (receiverChanged) {
        receiverIdSV.value = candidateReceiverId;
      }
      // ── UI-thread slot detection (zero JS bounce for intra-list reorder) ──
      if (sortableWorklet && sortableWorklet.isDraggingSV.value && sortableWorklet.numColumns === 1) {
        const sw = sortableWorklet;
        const cm = sw.containerMeasSV.value;
        // Only run if finger is over THIS list's bounds (prevents ghost reorder in source when finger is over target)
        const overThisList = cm &&
          hitTestPos.x >= cm.x && hitTestPos.x <= cm.x + cm.width &&
          hitTestPos.y >= cm.y && hitTestPos.y <= cm.y + cm.height;
        if (cm && overThisList) {
          const scrollOff = sw.scrollOffsetSV.value;
          const cX = hitTestPos.x - cm.x + (sw.horizontal ? scrollOff : 0);
          const cY = hitTestPos.y - cm.y + (sw.horizontal ? 0 : scrollOff);
          const slot = sw.getSlotFromPositionWorklet(cX, cY, sw.frozenBoundariesSV.value, sw.cumulativeEndsSV.value, sw.numColumns, sw.horizontal);
          if (slot !== sw.currentSlotSV.value) {
            sw.currentSlotSV.value = slot;
            const dragKey = sw.draggedKeySV.value;
            if (dragKey) {
              const newKeys = sw.recomputeShiftsWorklet(
                dragKey, slot, sw.orderedKeysSV.value, sw.basePositionsSV.value,
                sw.itemHeightsSV.value, sw.cellShiftRecordSV.value,
                sw.estimatedItemSize, sw.horizontal, sw.reorderStrategy,
              );
              if (newKeys) {
                sw.orderedKeysSV.value = newKeys;
                // Cache dragged item's target for O(1) snap at drag end
                const bp = sw.basePositionsSV.value[dragKey];
                const cs = sw.cellShiftRecordSV.value[dragKey];
                if (bp && cs) {
                  const s = cs.value;
                  sw.snapTargetSV.value = { x: bp.x + s.x, y: bp.y + s.y };
                }
              }
            }
          }
        }
      }

      // Skip JS bounce when the UI-thread sortable worklet is handling reorder
      // AND receiver hasn't changed AND no monitors need updating.
      // This eliminates ~60 cross-thread calls/sec during intra-list single-column
      // drag. For non-sortable views or views with monitors, always bounce to JS
      // so continuous callbacks (onDrag, onDragOver, onReceiveDragOver) still fire.
      const sortableHandled = sortableWorklet && sortableWorklet.isDraggingSV.value && sortableWorklet.numColumns === 1;
      const hasMonitors = result.monitorIds.length > 0;
      if (!sortableHandled || receiverChanged || hasMonitors) {
        scheduleOnRN(handleReceiverChange,
          oldReceiver,
          candidateReceiverId,
          hitTestPos,
          draggedIdSV.value,
          startPositionSV.value,
          grabOffsetSV.value,
          result.monitorIds
        );
      }
    },
    onDeactivate: (_event) => {
      'worklet';

      const currentDraggedId = draggedIdSV.value;
      if (!currentDraggedId) return; // Gesture was rejected (lock) — skip
      const currentReceiverId = receiverIdSV.value;

      // Run final hit-test to capture current monitors.
      // Monitor IDs are only updated on receiver changes, so if no receiver
      // change happened during the drag, monitors would be empty in handleDragEnd.
      const deactivateEntries = spatialIndexSV.value;
      const viewEntryFinal = deactivateEntries[viewSpatialIndexSV.value];
      const finalDims = viewEntryFinal
        ? { width: viewEntryFinal.width, height: viewEntryFinal.height }
        : undefined;
      const finalHitResult = hitTestWorklet(
        dragAbsolutePositionSV.value,
        deactivateEntries,
        scrollOffsetsSV.value,
        id,
        finalDims
      );

      // Set phase and clear receiver on UI thread so useAnimatedStyle
      // re-evaluates immediately (receiver style clears instantly).
      dragPhaseSV.value = 'releasing';
      receiverIdSV.value = '';
      // Stop worklet slot detection immediately. Without this, isDraggingSV stays
      // true between drags, letting the next drag's worklet run with stale SVs.
      if (sortableWorklet) sortableWorklet.isDraggingSV.value = false;

      // Bounce to JS for end callbacks + snap animation
      scheduleOnRN(handleDragEnd, currentDraggedId, currentReceiverId, false, finalHitResult.monitorIds);
    },
    onFinalize: (_event, didSucceed) => {
      'worklet';

      // If gesture was cancelled (not ended normally).
      // Check draggedIdSV (set in onActivate) instead of dragPhaseSV
      // because phase is now set later in handleDragStart via scheduleOnUI.
      if (!didSucceed && draggedIdSV.value !== '') {
        const currentDraggedId = draggedIdSV.value;
        const currentReceiverId = receiverIdSV.value;

        const viewEntryCancel = spatialIndexSV.value[viewSpatialIndexSV.value];
        const cancelDims = viewEntryCancel
          ? { width: viewEntryCancel.width, height: viewEntryCancel.height }
          : undefined;
        const finalHitResult = hitTestWorklet(
          dragAbsolutePositionSV.value,
          spatialIndexSV.value,
          scrollOffsetsSV.value,
          id,
          cancelDims
        );

        dragPhaseSV.value = 'releasing';
        receiverIdSV.value = '';
        if (sortableWorklet) sortableWorklet.isDraggingSV.value = false;

        scheduleOnRN(handleDragEnd, currentDraggedId, currentReceiverId, true, finalHitResult.monitorIds);
      }
    },
  });

  return gesture;
};
