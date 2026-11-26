import { Platform } from 'react-native';
import { measure } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { runOnJS, runOnUI } from 'react-native-worklets';

import { useDraxPanGesture } from '../compat';
import { computeAbsolutePositionWorklet, computeGrabOffsetWorklet, hitTestWorklet } from '../math';
import type { Position } from '../types';
import { useDraxInternalContext } from './useDraxContext';

/**
 * Creates a Pan gesture for a draggable DraxView.
 * Hit-testing runs entirely on the UI thread. It hops to JS when the receiver
 * or the monitor set changes. Otherwise it hops only while JS reports that
 * continuous updates are needed, with at most one such hop in flight.
 *
 * `enabled` and `longPressDelay` are plain values so the gesture config built
 * in the render where they change already carries them (#267).
 */
export const useDragGesture = (
  id: string,
  viewSpatialIndexSV: SharedValue<number>,
  enabled: boolean,
  longPressDelay: number,
  lockDragXPosition?: boolean,
  lockDragYPosition?: boolean,
  dragBoundsSV?: SharedValue<{ x: number; y: number; width: number; height: number } | null>,
  dragActivationFailOffset?: number,
  scrollHorizontal?: boolean,
  handleOffsetSV?: SharedValue<Position>
) => {
  const {
    draggedIdSV,
    receiverIdSV,
    rejectedReceiverIdSV,
    dragPhaseSV,
    hoverReadySV,
    hoverPositionSV,
    dragAbsolutePositionSV,
    spatialIndexSV,
    scrollOffsetsSV,
    grabOffsetSV,
    startPositionSV,
    rootOffsetSV,
    rootViewRef,
    needsUpdatesSV,
    jsPendingSV,
    lastMonitorKeySV,
    skippedSV,
    handleDragStart,
    handleReceiverChange,
    handleDragEnd,
  } = useDraxInternalContext();

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

  const continuousHop = (...args: Parameters<typeof handleReceiverChange>) => {
    handleReceiverChange(...args);
    runOnUI(endContinuousHop)();
  };
  // Ends a continuous hop on the UI thread: resend the latest state once if
  // updates were skipped while it was in flight, else allow the next hop.
  const endContinuousHop = () => {
    'worklet';
    if (skippedSV.value) {
      skippedSV.value = false;
      const receiverId = receiverIdSV.value;
      const monitorKey = lastMonitorKeySV.value;
      runOnJS(continuousHop)(
        receiverId,
        receiverId,
        dragAbsolutePositionSV.value,
        monitorKey ? monitorKey.split('|') : []
      );
    } else {
      jsPendingSV.value = false;
    }
  };

  const gesture = useDraxPanGesture({
    enabled,
    longPressDelay,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    touchAction,
    failOffsetX: failOffset,
    failOffsetY: failOffset,
    onActivate: (event) => {
      'worklet';

      // Re-measure the root view on drag start in case DraxProvider is nested
      // inside an outer ScrollView/FlatList that has scrolled since onLayout.
      // On web, measure() uses getBoundingClientRect (viewport coords, same
      // space as event.absoluteX/Y). The offset is refreshed only here, so an
      // outer scroll during the drag still drifts the hover.
      const measuredRoot = measure(rootViewRef);
      if (measuredRoot) {
        rootOffsetSV.value = { x: measuredRoot.pageX, y: measuredRoot.pageY };
      }

      // Convert screen-absolute touch to root-view-relative
      const rootOffset = rootOffsetSV.value;
      const rootRelX = event.absoluteX - rootOffset.x;
      const rootRelY = event.absoluteY - rootOffset.y;

      // Derive the view's visual position from the gesture event.
      // event.x/y = touch relative to the view's bounds (accounts for transforms).
      // This is more accurate than the spatial index for sortable items where
      // permanent shifts move views via CSS transform without updating layout.
      // With a drag handle, event.x/y is relative to the DraxHandle, so add the
      // handle's offset within the DraxView.
      const grabOffset = computeGrabOffsetWorklet(
        { x: event.x, y: event.y },
        handleOffsetSV ? handleOffsetSV.value : { x: 0, y: 0 }
      );
      const viewAbsPos: Position = {
        x: rootRelX - grabOffset.x,
        y: rootRelY - grabOffset.y,
      };
      const spatialIndex = viewSpatialIndexSV.value;
      const entries = spatialIndexSV.value;

      // A drag still snapping is superseded: handleDragStart finalizes it,
      // and its deferred clear must leave this drag's state alone. Start
      // from the idle state, like any drag (HoverLayer sets ready/dragging).
      if (dragPhaseSV.value === 'releasing') {
        dragPhaseSV.value = 'idle';
        hoverReadySV.value = false;
      }

      // Store shared state (all positions in root-relative space).
      // DO NOT set dragPhaseSV here — it's set by HoverLayer's useLayoutEffect
      // AFTER hover content is committed to the DOM. This prevents the grab blink
      // (item going invisible before hover is visible).
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
        const viewEntry = entries[spatialIndex];
        const vw = viewEntry ? viewEntry.width : 0;
        const vh = viewEntry ? viewEntry.height : 0;
        hoverX = Math.max(b.x, Math.min(b.x + b.width - vw, hoverX));
        hoverY = Math.max(b.y, Math.min(b.y + b.height - vh, hoverY));
      }

      hoverPositionSV.value = { x: hoverX, y: hoverY };

      // Reset receiver and rejection cache
      receiverIdSV.value = '';
      rejectedReceiverIdSV.value = '';
      // Until JS answers, hop on every update as if continuous updates are needed.
      needsUpdatesSV.value = true;
      jsPendingSV.value = false;
      skippedSV.value = false;
      lastMonitorKeySV.value = '';

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
      // Receivers with collisionAlgorithm 'touch' test the finger (rootRelPos) instead.
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
        viewEntry ? { width: viewEntry.width, height: viewEntry.height } : undefined,
        rootRelPos
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

      // Bounce to JS for callback dispatch. A receiver or monitor set change always
      // hops (enter/exit). Otherwise hop only if JS said the current state needs
      // continuous callbacks (onDrag, onDragOver, onReceiveDragOver, monitors), and
      // only if the previous such hop has run, so the JS queue stays bounded and a
      // drop is never queued behind a backlog of stale updates.
      const oldReceiver = receiverIdSV.value;
      const receiverChanged = candidateReceiverId !== oldReceiver;
      if (receiverChanged) {
        receiverIdSV.value = candidateReceiverId;
      }
      const monitorKey = result.monitorIds.join('|');
      const monitorsChanged = monitorKey !== lastMonitorKeySV.value;
      if (monitorsChanged) {
        lastMonitorKeySV.value = monitorKey;
      }
      if (receiverChanged || monitorsChanged) {
        runOnJS(handleReceiverChange)(
          oldReceiver,
          candidateReceiverId,
          hitTestPos,
          result.monitorIds
        );
      } else if (needsUpdatesSV.value) {
        if (jsPendingSV.value) {
          skippedSV.value = true;
        } else {
          jsPendingSV.value = true;
          runOnJS(continuousHop)(
            oldReceiver,
            candidateReceiverId,
            hitTestPos,
            result.monitorIds
          );
        }
      }
    },
    onDeactivate: (event, didSucceed) => {
      'worklet';

      // A cancelled gesture is not a drop: onFinalize runs the cancel path.
      if (!didSucceed) return;

      // Root-relative finger position at release
      const touchPos: Position = {
        x: event.absoluteX - rootOffsetSV.value.x,
        y: event.absoluteY - rootOffsetSV.value.y,
      };

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
        finalDims,
        touchPos
      );

      // Set phase and clear receiver on UI thread so useAnimatedStyle
      // re-evaluates immediately (receiver style clears instantly).
      dragPhaseSV.value = 'releasing';
      receiverIdSV.value = '';
      skippedSV.value = false;

      // Continuous callbacks see the release position before the drop (FIFO).
      if (needsUpdatesSV.value) {
        runOnJS(handleReceiverChange)(
          currentReceiverId,
          currentReceiverId,
          dragAbsolutePositionSV.value,
          finalHitResult.monitorIds
        );
      }

      // Bounce to JS for end callbacks + snap animation
      runOnJS(handleDragEnd)(currentDraggedId, currentReceiverId, false, finalHitResult.monitorIds, touchPos);
    },
    onFinalize: (event, didSucceed) => {
      'worklet';

      // If gesture was cancelled (not ended normally).
      // Check draggedIdSV (set in onActivate) instead of dragPhaseSV
      // because phase is now set later in handleDragStart via runOnUI.
      if (!didSucceed && draggedIdSV.value !== '') {
        const currentDraggedId = draggedIdSV.value;
        const currentReceiverId = receiverIdSV.value;
        const touchPos: Position = {
          x: event.absoluteX - rootOffsetSV.value.x,
          y: event.absoluteY - rootOffsetSV.value.y,
        };

        const viewEntryCancel = spatialIndexSV.value[viewSpatialIndexSV.value];
        const cancelDims = viewEntryCancel
          ? { width: viewEntryCancel.width, height: viewEntryCancel.height }
          : undefined;
        const finalHitResult = hitTestWorklet(
          dragAbsolutePositionSV.value,
          spatialIndexSV.value,
          scrollOffsetsSV.value,
          id,
          cancelDims,
          touchPos
        );

        dragPhaseSV.value = 'releasing';
        receiverIdSV.value = '';
        skippedSV.value = false;

        runOnJS(handleDragEnd)(currentDraggedId, currentReceiverId, true, finalHitResult.monitorIds, touchPos);
      }
    },
  });

  return gesture;
};
