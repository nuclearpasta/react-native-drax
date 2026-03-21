import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { withDelay, withTiming } from 'react-native-reanimated';
import { runOnJS, runOnUI } from 'react-native-worklets';

import type { FlattenedHoverStyles } from '../HoverLayer';
import { computeAbsolutePositionWorklet, getRelativePosition } from '../math';
import {
  defaultSnapbackDelay,
  defaultSnapbackDuration,
} from '../params';
import type {
  DragPhase,
  DraxEventDraggedViewData,
  DraxEventReceiverViewData,
  DraxProviderDragEvent,
  DraxSnapbackTarget,
  DraxSnapEndEventData,
  Position,
  SpatialEntry,
  ViewRegistryEntry,
} from '../types';
import {
  DraxSnapbackTargetPreset,
  DraxViewDragStatus,
  DraxViewReceiveStatus,
  isPosition,
} from '../types';
import { isDraggable } from './useSpatialIndex';

/** Style override to strip margins — hover is positioned via translateX/Y */
const noMargin = {
  margin: 0,
  marginHorizontal: 0,
  marginVertical: 0,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
} as const;

interface CallbackDispatchDeps {
  getViewEntry: (id: string) => ViewRegistryEntry | undefined;
  spatialIndexSV: SharedValue<SpatialEntry[]>;
  scrollOffsetsSV: SharedValue<Position[]>;
  draggedIdSV: SharedValue<string>;
  receiverIdSV: SharedValue<string>;
  rejectedReceiverIdSV: SharedValue<string>;
  dragPhaseSV: SharedValue<DragPhase>;
  hoverPositionSV: SharedValue<Position>;
  grabOffsetSV: SharedValue<Position>;
  startPositionSV: SharedValue<Position>;
  setHoverContent: (content: ReactNode | null) => void;
  hoverReadySV: SharedValue<boolean>;
  hoverClearDeferredRef: { current: boolean };
  hoverStylesRef: RefObject<FlattenedHoverStyles | null>;
  // Provider-level callbacks
  onProviderDragStart?: (event: DraxProviderDragEvent) => void;
  onProviderDrag?: (event: DraxProviderDragEvent) => void;
  onProviderDragEnd?: (event: DraxProviderDragEvent & { cancelled: boolean }) => void;
  // Dropped items tracking (for capacity)
  droppedItemsRef: RefObject<Map<string, Set<string>>>;
}

/**
 * Provides JS-thread callback dispatch functions that are invoked via runOnJS
 * from gesture worklets. These handle ~5 calls per drag (start, receiver changes, end),
 * NOT per frame.
 */
export const useCallbackDispatch = (deps: CallbackDispatchDeps) => {
  const {
    getViewEntry,
    spatialIndexSV,
    scrollOffsetsSV,
    draggedIdSV,
    dragPhaseSV,
    hoverPositionSV,
    grabOffsetSV,
    startPositionSV,
    setHoverContent,
    hoverReadySV,
    onProviderDragStart,
    onProviderDrag,
    onProviderDragEnd,
    droppedItemsRef,
  } = deps;

  // Track current monitor ids for exit events
  const currentMonitorIdsRef = useRef<string[]>([]);


  /** Build dragged view event data from current state */
  const buildDraggedViewData = (
    draggedId: string,
    absolutePosition: Position
  ): DraxEventDraggedViewData | undefined => {
    const entry = getViewEntry(draggedId);
    if (!entry) return undefined;

    const startPos = startPositionSV.value;
    const grabOffset = grabOffsetSV.value;
    const dragTranslation = {
      x: absolutePosition.x - startPos.x,
      y: absolutePosition.y - startPos.y,
    };

    const measurements = entry.measurements;
    // Use || instead of ?? intentionally: zero dimensions would cause division by zero below
    const width = measurements?.width || 1;
    const height = measurements?.height || 1;

    return {
      id: draggedId,
      parentId: entry.parentId,
      payload: entry.props.dragPayload ?? entry.props.payload,
      measurements,
      dragTranslationRatio: {
        x: dragTranslation.x / width,
        y: dragTranslation.y / height,
      },
      dragOffset: {
        x: absolutePosition.x - (measurements?.x ?? 0),
        y: absolutePosition.y - (measurements?.y ?? 0),
      },
      grabOffset,
      grabOffsetRatio: {
        x: grabOffset.x / width,
        y: grabOffset.y / height,
      },
      hoverPosition: hoverPositionSV.value,
    };
  };

  /** Build receiver view event data */
  const buildReceiverViewData = (
    receiverId: string,
    absolutePosition: Position
  ): DraxEventReceiverViewData | undefined => {
    const entry = getViewEntry(receiverId);
    if (!entry?.measurements) return undefined;

    // Compute absolute measurements of receiver
    const idx = entry.spatialIndex;
    const entries = spatialIndexSV.value;
    const offsets = scrollOffsetsSV.value;
    const absPos = computeAbsolutePositionWorklet(idx, entries, offsets);
    const absMeasurements = {
      ...absPos,
      width: entry.measurements.width,
      height: entry.measurements.height,
    };

    const { relativePosition, relativePositionRatio } = getRelativePosition(
      absolutePosition,
      absMeasurements
    );

    return {
      id: receiverId,
      parentId: entry.parentId,
      payload: entry.props.receiverPayload ?? entry.props.payload,
      measurements: entry.measurements,
      receiveOffset: relativePosition,
      receiveOffsetRatio: relativePositionRatio,
    };
  };

  /** Called via runOnJS when drag starts */
  const handleDragStart = (
    draggedId: string,
    absolutePosition: Position,
    _grabOffset: Position
  ) => {
    const draggedEntry = getViewEntry(draggedId);
    if (!draggedEntry) return;

    const dragged = buildDraggedViewData(draggedId, absolutePosition);
    if (!dragged) return;

    const startPos = startPositionSV.value;
    const dragTranslation = {
      x: absolutePosition.x - startPos.x,
      y: absolutePosition.y - startPos.y,
    };

    // Fire onDragStart callback
    draggedEntry.props.onDragStart?.({
      dragAbsolutePosition: absolutePosition,
      dragTranslation,
      dragged,
    });

    // Setup hover styles — set BEFORE setHoverContent so HoverLayer
    // captures them when it re-renders on hoverVersion change.
    deps.hoverStylesRef.current = {
      hoverStyle: flattenOrNull(draggedEntry.props.hoverStyle),
      hoverDraggingStyle: flattenOrNull(draggedEntry.props.hoverDraggingStyle),
      hoverDraggingWithReceiverStyle: flattenOrNull(draggedEntry.props.hoverDraggingWithReceiverStyle),
      hoverDraggingWithoutReceiverStyle: flattenOrNull(draggedEntry.props.hoverDraggingWithoutReceiverStyle),
      hoverDragReleasedStyle: flattenOrNull(draggedEntry.props.hoverDragReleasedStyle),
    };

    // Setup hover content
    if (isDraggable(draggedEntry.props) && !draggedEntry.props.noHover) {
      const renderFn =
        draggedEntry.props.renderHoverContent ??
        draggedEntry.props.renderContent;
      if (renderFn) {
        const content = renderFn({
          viewState: {
            dragStatus: DraxViewDragStatus.Dragging,
            receiveStatus: DraxViewReceiveStatus.Inactive,
            grabOffset: dragged.grabOffset,
            grabOffsetRatio: dragged.grabOffsetRatio,
          },
          trackingStatus: { dragging: true, receiving: false },
          hover: true,
          children: null,
          dimensions: draggedEntry.measurements
            ? {
                width: draggedEntry.measurements.width,
                height: draggedEntry.measurements.height,
              }
            : undefined,
        });
        setHoverContent(content);
      } else {
        // Default hover: wrap children with original view style and dimensions.
        // Strip margins since hover is positioned via translateX/Y.
        const dims = draggedEntry.measurements;
        const viewStyle = draggedEntry.props.style;
        setHoverContent(
          <View style={[
            viewStyle,
            dims && { width: dims.width, height: dims.height },
            noMargin,
          ]}>
            {draggedEntry.props.children}
          </View>
        );
      }
    }

    // Phase activation is handled by HoverLayer's useLayoutEffect — it fires
    // AFTER React commits the hover content, ensuring both opacity:1 and
    // draggingStyle apply on the same frame. See HoverLayer.tsx.

    // Fire provider-level onDragStart
    onProviderDragStart?.({ draggedId, position: absolutePosition });

    // Fire monitor onMonitorDragStart callbacks
    currentMonitorIdsRef.current = [];
  };

  /** Called via runOnJS on every gesture update for callback dispatch.
   *  Handles: enter/exit (on receiver change), onDragOver/onReceiveDragOver
   *  (continuous, same receiver), onDrag (continuous, no receiver), and monitors. */
  const handleReceiverChange = (
    oldReceiverId: string,
    newReceiverId: string,
    absolutePosition: Position,
    monitorIds?: string[]
  ) => {
    const draggedId = draggedIdSV.value;
    const dragged = buildDraggedViewData(draggedId, absolutePosition);
    if (!dragged) return;

    const draggedEntry = getViewEntry(draggedId);
    const draggedPayload = draggedEntry?.props.dragPayload ?? draggedEntry?.props.payload;

    const startPos = startPositionSV.value;
    const dragTranslation = {
      x: absolutePosition.x - startPos.x,
      y: absolutePosition.y - startPos.y,
    };
    const baseEventData = {
      dragAbsolutePosition: absolutePosition,
      dragTranslation,
      dragged,
    };

    // ── Check dynamicReceptiveCallback / acceptsDrag on new receiver ──
    let acceptedReceiverId = newReceiverId;
    if (newReceiverId && oldReceiverId !== newReceiverId) {
      const newReceiverEntry = getViewEntry(newReceiverId);
      if (newReceiverEntry) {
        // Check acceptsDrag first (simpler convenience prop)
        const acceptsDrag = newReceiverEntry.props.acceptsDrag;
        if (acceptsDrag && !acceptsDrag(draggedPayload)) {
          acceptedReceiverId = '';
        }

        // Check capacity
        const capacity = newReceiverEntry.props.capacity;
        if (acceptedReceiverId && capacity !== undefined) {
          const droppedSet = droppedItemsRef.current.get(newReceiverId);
          const count = droppedSet ? droppedSet.size : 0;
          if (count >= capacity) {
            acceptedReceiverId = '';
          }
        }

        // Check dynamicReceptiveCallback (more detailed)
        const dynamicCallback = newReceiverEntry.props.dynamicReceptiveCallback;
        if (acceptedReceiverId && dynamicCallback && newReceiverEntry.measurements) {
          const accepted = dynamicCallback({
            targetId: newReceiverId,
            targetMeasurements: newReceiverEntry.measurements,
            draggedId,
            draggedPayload,
          });
          if (!accepted) {
            acceptedReceiverId = '';
          }
        }
      }

      // If rejected, tell the gesture worklet to skip this receiver on future frames.
      // Also clear receiverIdSV so animated styles don't flash the receiving state.
      if (!acceptedReceiverId) {
        runOnUI((
          _receiverIdSV: typeof deps.receiverIdSV,
          _rejectedReceiverIdSV: typeof deps.rejectedReceiverIdSV,
          _rejectedId: string,
        ) => {
          'worklet';
          _receiverIdSV.value = '';
          _rejectedReceiverIdSV.value = _rejectedId;
        })(deps.receiverIdSV, deps.rejectedReceiverIdSV, newReceiverId);
      }
    }

    // Fire exit on old receiver (only when receiver actually changed)
    if (oldReceiverId && oldReceiverId !== acceptedReceiverId) {
      const oldReceiverEntry = getViewEntry(oldReceiverId);
      const oldReceiverData = buildReceiverViewData(
        oldReceiverId,
        absolutePosition
      );
      if (oldReceiverEntry && oldReceiverData) {
        // Dragged view: onDragExit
        draggedEntry?.props.onDragExit?.({
          ...baseEventData,
          receiver: oldReceiverData,
        });

        // Receiver view: onReceiveDragExit
        oldReceiverEntry.props.onReceiveDragExit?.({
          ...baseEventData,
          receiver: oldReceiverData,
          cancelled: false,
        });
      }
    }

    // Fire enter on new receiver (only when receiver actually changed)
    if (acceptedReceiverId && oldReceiverId !== acceptedReceiverId) {
      const newReceiverEntry = getViewEntry(acceptedReceiverId);
      const newReceiverData = buildReceiverViewData(
        acceptedReceiverId,
        absolutePosition
      );
      if (newReceiverEntry && newReceiverData) {
        // Dragged view: onDragEnter
        draggedEntry?.props.onDragEnter?.({
          ...baseEventData,
          receiver: newReceiverData,
        });

        // Receiver view: onReceiveDragEnter
        newReceiverEntry.props.onReceiveDragEnter?.({
          ...baseEventData,
          receiver: newReceiverData,
        });
      }
    }

    // ── Continuous callbacks: onDragOver / onReceiveDragOver / onDrag ──
    if (acceptedReceiverId && oldReceiverId === acceptedReceiverId) {
      // Dragging over the same receiver — fire onDragOver + onReceiveDragOver
      const receiverEntry = getViewEntry(acceptedReceiverId);
      const receiverData = buildReceiverViewData(acceptedReceiverId, absolutePosition);
      if (receiverEntry && receiverData) {
        draggedEntry?.props.onDragOver?.({
          ...baseEventData,
          receiver: receiverData,
        });
        receiverEntry.props.onReceiveDragOver?.({
          ...baseEventData,
          receiver: receiverData,
        });
      }
    } else if (!acceptedReceiverId) {
      // No receiver — fire onDrag (continuous, not over any receiver)
      draggedEntry?.props.onDrag?.(baseEventData);
    }

    // ── Dispatch monitor events ──────────────────────────────────────
    const newMonitorIds = monitorIds ?? [];
    const prevMonitorIds = currentMonitorIdsRef.current;
    const prevWasEmpty = prevMonitorIds.length === 0;

    // Build receiver data for monitor event payload (use accepted receiver, not raw hit-test)
    const receiverData = acceptedReceiverId
      ? buildReceiverViewData(acceptedReceiverId, absolutePosition)
      : undefined;

    // Fire events on current monitors (start/enter before over)
    for (const monitorId of newMonitorIds) {
      const monitorEntry = getViewEntry(monitorId);
      if (!monitorEntry?.measurements) continue;

      const {
        relativePosition: monitorOffset,
        relativePositionRatio: monitorOffsetRatio,
      } = getRelativePosition(absolutePosition, monitorEntry.measurements);

      const monitorEventData = {
        ...baseEventData,
        receiver: receiverData,
        monitorOffset,
        monitorOffsetRatio,
      };

      const isNew = !prevMonitorIds.includes(monitorId);

      // First time we see any monitor after drag start → fire onMonitorDragStart
      if (isNew && prevWasEmpty) {
        monitorEntry.props.onMonitorDragStart?.(monitorEventData);
      }

      // New monitor → fire onMonitorDragEnter
      if (isNew) {
        monitorEntry.props.onMonitorDragEnter?.(monitorEventData);
      }

      // All current monitors → fire onMonitorDragOver
      monitorEntry.props.onMonitorDragOver?.(monitorEventData);
    }

    // Fire exit on monitors that are no longer hit
    for (const prevMonitorId of prevMonitorIds) {
      if (newMonitorIds.includes(prevMonitorId)) continue;

      const monitorEntry = getViewEntry(prevMonitorId);
      if (!monitorEntry?.measurements) continue;

      const {
        relativePosition: monitorOffset,
        relativePositionRatio: monitorOffsetRatio,
      } = getRelativePosition(absolutePosition, monitorEntry.measurements);

      monitorEntry.props.onMonitorDragExit?.({
        ...baseEventData,
        receiver: receiverData,
        monitorOffset,
        monitorOffsetRatio,
      });
    }

    currentMonitorIdsRef.current = newMonitorIds;

    // Fire provider-level onDrag (use acceptedReceiverId, not raw newReceiverId)
    onProviderDrag?.({ draggedId: draggedIdSV.value, receiverId: acceptedReceiverId || undefined, position: absolutePosition });
  };

  /** Called via runOnJS when drag ends or is cancelled */
  const handleDragEnd = (
    draggedId: string,
    receiverId: string,
    cancelled: boolean,
    finalMonitorIds?: string[]
  ) => {
    // receiverIdSV is already cleared on the UI thread in onDeactivate/onFinalize,
    // so the receiver's animated style resets immediately.

    const draggedEntry = getViewEntry(draggedId);
    if (!draggedEntry) {
      // Reset drag state atomically on UI thread to avoid one-frame flash
      runOnUI((
        _hoverReadySV: typeof hoverReadySV,
        _dragPhaseSV: typeof dragPhaseSV,
        _draggedIdSV: typeof draggedIdSV,
        _hoverPositionSV: typeof hoverPositionSV,
      ) => {
        'worklet';
        _hoverReadySV.value = false;
        _dragPhaseSV.value = 'idle';
        _draggedIdSV.value = '';
        _hoverPositionSV.value = { x: 0, y: 0 };
      })(hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
      return;
    }

    const absolutePosition = { ...hoverPositionSV.value };
    const dragged = buildDraggedViewData(draggedId, absolutePosition);
    if (!dragged) {
      runOnUI((
        _hoverReadySV: typeof hoverReadySV,
        _dragPhaseSV: typeof dragPhaseSV,
        _draggedIdSV: typeof draggedIdSV,
        _hoverPositionSV: typeof hoverPositionSV,
      ) => {
        'worklet';
        _hoverReadySV.value = false;
        _dragPhaseSV.value = 'idle';
        _draggedIdSV.value = '';
        _hoverPositionSV.value = { x: 0, y: 0 };
      })(hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
      return;
    }

    const startPos = startPositionSV.value;
    const dragTranslation = {
      x: absolutePosition.x - startPos.x,
      y: absolutePosition.y - startPos.y,
    };
    const baseEventData = {
      dragAbsolutePosition: absolutePosition,
      dragTranslation,
      dragged,
    };

    let snapTarget: DraxSnapbackTarget = DraxSnapbackTargetPreset.Default;

    if (receiverId && !cancelled) {
      // Successful drop — default snap to receiver position
      const receiverEntry = getViewEntry(receiverId);
      const receiverData = buildReceiverViewData(
        receiverId,
        absolutePosition
      );

      if (receiverData && receiverEntry) {
        // Compute receiver's absolute position and center the dragged item within it
        const receiverAbsPos = computeAbsolutePositionWorklet(
          receiverEntry.spatialIndex,
          spatialIndexSV.value,
          scrollOffsetsSV.value
        );
        const draggedDims = draggedEntry.measurements;
        const receiverDims = receiverEntry.measurements;
        if (receiverDims && draggedDims) {
          snapTarget = {
            x: receiverAbsPos.x + (receiverDims.width - draggedDims.width) / 2,
            y: receiverAbsPos.y + (receiverDims.height - draggedDims.height) / 2,
          };
        } else {
          snapTarget = receiverAbsPos;
        }

        // Fire onDragDrop on dragged (can override snap target)
        const dragDropResponse = draggedEntry.props.onDragDrop?.({
          ...baseEventData,
          receiver: receiverData,
        });
        if (dragDropResponse !== undefined)
          snapTarget = dragDropResponse as DraxSnapbackTarget;

        // Fire onReceiveDragDrop on receiver (can override snap target)
        const receiveDropResponse = receiverEntry.props.onReceiveDragDrop?.({
          ...baseEventData,
          receiver: receiverData,
        });
        if (receiveDropResponse !== undefined)
          snapTarget = receiveDropResponse as DraxSnapbackTarget;

        // Track the drop for capacity enforcement
        if (!droppedItemsRef.current.has(receiverId)) {
          droppedItemsRef.current.set(receiverId, new Set());
        }
        droppedItemsRef.current.get(receiverId)!.add(draggedId);
      }
    } else {
      // No receiver or cancelled
      const dragEndResponse = draggedEntry.props.onDragEnd?.({
        ...baseEventData,
        cancelled,
      });
      if (dragEndResponse !== undefined)
        snapTarget = dragEndResponse as DraxSnapbackTarget;
    }

    // Fire monitor end events — use final hit-test monitors from onDeactivate
    // if available, falling back to tracked monitors from receiver changes.
    const monitorIdsToUse = finalMonitorIds ?? currentMonitorIdsRef.current;
    for (const monitorId of monitorIdsToUse) {
      const monitorEntry = getViewEntry(monitorId);
      if (!monitorEntry?.measurements) continue;

      const {
        relativePosition: monitorOffset,
        relativePositionRatio: monitorOffsetRatio,
      } = getRelativePosition(absolutePosition, monitorEntry.measurements);

      if (receiverId && !cancelled) {
        const receiverData = buildReceiverViewData(
          receiverId,
          absolutePosition
        );
        if (receiverData) {
          const monitorDropResponse =
            monitorEntry.props.onMonitorDragDrop?.({
              ...baseEventData,
              receiver: receiverData,
              monitorOffset,
              monitorOffsetRatio,
            });
          if (monitorDropResponse !== undefined)
            snapTarget = monitorDropResponse as DraxSnapbackTarget;
        }
      } else {
        const monitorEndResponse = monitorEntry.props.onMonitorDragEnd?.({
          ...baseEventData,
          monitorOffset,
          monitorOffsetRatio,
          cancelled,
        });
        if (monitorEndResponse !== undefined)
          snapTarget = monitorEndResponse as DraxSnapbackTarget;
      }
    }

    // Resolve Default snap target to root-relative visual position.
    // Default triggers when monitors are empty or all callbacks return undefined.
    // draggedEntry.measurements are content-relative (from measureLayout), so we
    // use the spatial index to compute root-relative visual position instead.
    if (snapTarget === DraxSnapbackTargetPreset.Default) {
      const absPos = computeAbsolutePositionWorklet(
        draggedEntry.spatialIndex,
        spatialIndexSV.value,
        scrollOffsetsSV.value
      );
      snapTarget = absPos;
    }

    // Handle snap-back animation
    performSnapback(
      snapTarget,
      draggedEntry,
      receiverId ? getViewEntry(receiverId) : undefined,
      hoverPositionSV,
      dragPhaseSV,
      draggedIdSV,
      hoverReadySV,
      setHoverContent,
      deps.hoverClearDeferredRef
    );

    // Fire provider-level onDragEnd (use last known hover position)
    onProviderDragEnd?.({ draggedId, receiverId: receiverId || undefined, position: hoverPositionSV.value, cancelled });
  };

  return {
    handleDragStart,
    handleReceiverChange,
    handleDragEnd,
  };
};

/**
 * Perform the snap-back animation after drag ends.
 *
 * CRITICAL ORDERING: When the snap animation completes, we must:
 *   1. Fire onSnapEnd callbacks → triggers finalizeDrag → commits reorder / cancels drag
 *   2. THEN clear drag state (hover disappears, item becomes visible)
 *
 * This ordering ensures shifted items are cleaned up BEFORE the hover disappears.
 * Without this, there's a visible gap where shifted items are at shifted positions
 * but the hover is already gone (the "drop blink").
 */
function performSnapback(
  target: DraxSnapbackTarget,
  draggedEntry: ViewRegistryEntry,
  receiverEntry: ViewRegistryEntry | undefined,
  hoverPositionSV: SharedValue<Position>,
  dragPhaseSV: SharedValue<DragPhase>,
  draggedIdSV: SharedValue<string>,
  hoverReadySV: SharedValue<boolean>,
  setHoverContent: (content: ReactNode | null) => void,
  hoverClearDeferredRef: { current: boolean }
) {
  const animateSnap = draggedEntry.props.animateSnap ?? true;
  const snapDelay = draggedEntry.props.snapDelay ?? defaultSnapbackDelay;
  const snapDuration =
    draggedEntry.props.snapDuration ?? defaultSnapbackDuration;
  const snapAnimator = draggedEntry.props.snapAnimator;

  // Build snap event data for callbacks
  const snapEventData: DraxSnapEndEventData = {
    dragged: {
      id: draggedEntry.id,
      parentId: draggedEntry.parentId,
      payload: draggedEntry.props.dragPayload ?? draggedEntry.props.payload,
    },
    receiver: receiverEntry
      ? {
          id: receiverEntry.id,
          parentId: receiverEntry.parentId,
          payload:
            receiverEntry.props.receiverPayload ?? receiverEntry.props.payload,
        }
      : undefined,
  };

  /**
   * Called when snap animation completes. Fires callbacks FIRST (so finalizeDrag
   * can set permanent shifts + clear hover), THEN clears hover & drag state.
   *
   * For REORDER: finalizeDrag sets permanent shifts + clears hover via runOnUI
   *   in a single atomic block. No FlatList data change, so no blink.
   *
   * For CANCEL: finalizeDrag → cancelDrag → reverts to committed shifts.
   *   Then hover clears on next UI frame. Items at visual positions. No blink.
   */
  const onSnapComplete = () => {

    // Reset the deferred flag before firing callbacks.
    // finalizeDrag (called via onSnapEnd) may set it to true for reorder.
    hoverClearDeferredRef.current = false;

    // Step 1: Fire callbacks → finalizeDrag runs synchronously.
    draggedEntry.props.onSnapEnd?.(snapEventData);
    receiverEntry?.props.onReceiveSnapEnd?.(snapEventData);


    // Step 2: Clear hover if NOT deferred by a sortable reorder.
    if (!hoverClearDeferredRef.current) {
      runOnUI((
        _hoverReadySV: typeof hoverReadySV,
        _dragPhaseSV: typeof dragPhaseSV,
        _draggedIdSV: typeof draggedIdSV,
        _hoverPositionSV: typeof hoverPositionSV,
      ) => {
        'worklet';
        _hoverReadySV.value = false;
        _dragPhaseSV.value = 'idle';
        _draggedIdSV.value = '';
        _hoverPositionSV.value = { x: 0, y: 0 };
      })(hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
    } else {
      // Do NOT call setHoverContent(null) here — the hover must remain visible
      // until the FlatList re-renders. The deferred cleanup in useLayoutEffect
      // will clear SharedValues, and setHoverContent(null) is called there too.
    }
  };

  if (target === DraxSnapbackTargetPreset.None || !animateSnap) {
    // No snap animation — run cleanup immediately
    onSnapComplete();
    return;
  }

  // Determine snap-to position
  let toValue: Position;
  if (isPosition(target)) {
    toValue = target;
  } else {
    // Default: snap back to original view position
    toValue = draggedEntry.measurements
      ? { x: draggedEntry.measurements.x, y: draggedEntry.measurements.y }
      : { x: 0, y: 0 };
  }

  if (snapAnimator) {
    // Custom snap animation
    snapAnimator({
      hoverPosition: hoverPositionSV,
      toValue,
      delay: snapDelay,
      duration: snapDuration,
      finishedCallback: (finished: boolean) => {
        if (finished) {
          onSnapComplete();
        }
      },
    });
  } else {
    // Default withTiming snap animation.
    // When animation finishes, bounce to JS for ordered cleanup.
    hoverPositionSV.value = withDelay(
      snapDelay,
      withTiming(toValue, { duration: snapDuration }, (finished) => {
        'worklet';
        if (finished) {
          runOnJS(onSnapComplete)();
        }
      })
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function flattenOrNull(s: unknown): ViewStyle | null {
  if (!s) return null;
  return StyleSheet.flatten(s as ViewStyle) ?? null;
}
