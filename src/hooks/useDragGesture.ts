import { usePanGesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

import { computeAbsolutePositionWorklet, hitTestWorklet } from '../math';
import type { Position } from '../types';
import { useDraxContext } from './useDraxContext';

/**
 * Creates a Pan gesture for a draggable DraxView.
 * Hit-testing runs entirely on the UI thread — zero runOnJS per frame
 * unless the receiver changes.
 *
 * `enabledSV`, `longPressDelaySV`, and `viewSpatialIndexSV` are SharedValues so RNGH 3.0
 * reconfigures the native gesture handler on the UI thread — zero JS bridge,
 * zero React rerender.
 */
export const useDragGesture = (
  id: string,
  viewSpatialIndexSV: SharedValue<number>,
  enabledSV: SharedValue<boolean>,
  longPressDelaySV: SharedValue<number>,
  lockDragXPosition?: boolean,
  lockDragYPosition?: boolean
) => {
  const {
    draggedIdSV,
    receiverIdSV,
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
  } = useDraxContext();

  const gesture = usePanGesture({
    enabled: enabledSV,
    activateAfterLongPress: longPressDelaySV,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onActivate: (event) => {
      'worklet';

      // Convert screen-absolute touch to root-view-relative
      const rootOffset = rootOffsetSV.value;
      const rootRelX = event.absoluteX - rootOffset.x;
      const rootRelY = event.absoluteY - rootOffset.y;

      // Derive the view's visual position from the gesture event.
      // event.x/y = touch relative to the view's bounds (accounts for transforms).
      // This is more accurate than the spatial index for sortable items where
      // permanent shifts move views via CSS transform without updating layout.
      const viewAbsPos: Position = {
        x: rootRelX - event.x,
        y: rootRelY - event.y,
      };

      // Grab offset = touch position within the view
      const grabOffset: Position = {
        x: event.x,
        y: event.y,
      };

      // Store shared state (all positions in root-relative space).
      // DO NOT set dragPhaseSV here — it's set by HoverLayer's useLayoutEffect
      // AFTER hover content is committed to the DOM. This prevents the grab blink
      // (item going invisible before hover is visible).
      draggedIdSV.value = id;
      grabOffsetSV.value = grabOffset;
      startPositionSV.value = { x: rootRelX, y: rootRelY };
      dragAbsolutePositionSV.value = { x: rootRelX, y: rootRelY };

      // Compute initial hover position (root-relative)
      const hoverX = lockDragXPosition ? viewAbsPos.x : rootRelX - grabOffset.x;
      const hoverY = lockDragYPosition ? viewAbsPos.y : rootRelY - grabOffset.y;
      hoverPositionSV.value = { x: hoverX, y: hoverY };

      // Reset receiver
      receiverIdSV.value = '';

      // Bounce to JS for callback dispatch + hover content setup
      runOnJS(handleDragStart)(
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

      const hoverX = lockDragXPosition ? viewAbsPos.x : rootRelX - grabOffset.x;
      const hoverY = lockDragYPosition ? viewAbsPos.y : rootRelY - grabOffset.y;
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

      // Bounce to JS when receiver changes OR monitors need continuous updates.
      // handleReceiverChange safely handles same-receiver calls (skips exit/enter)
      // so monitors get continuous position updates for slot detection.
      const receiverChanged = result.receiverId !== receiverIdSV.value;
      if (receiverChanged || result.monitorIds.length > 0) {
        const oldReceiver = receiverIdSV.value;
        if (receiverChanged) {
          receiverIdSV.value = result.receiverId;
        }
        runOnJS(handleReceiverChange)(
          oldReceiver,
          result.receiverId,
          hitTestPos,
          result.monitorIds
        );
      }
    },
    onDeactivate: (_event) => {
      'worklet';

      const currentDraggedId = draggedIdSV.value;
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

      // Bounce to JS for end callbacks + snap animation
      runOnJS(handleDragEnd)(currentDraggedId, currentReceiverId, false, finalHitResult.monitorIds);
    },
    onFinalize: (_event, didSucceed) => {
      'worklet';

      // If gesture was cancelled (not ended normally).
      // Check draggedIdSV (set in onActivate) instead of dragPhaseSV
      // because phase is now set later in handleDragStart via runOnUI.
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

        runOnJS(handleDragEnd)(currentDraggedId, currentReceiverId, true, finalHitResult.monitorIds);
      }
    },
  });

  return gesture;
};
