import type { ReactNode, RefObject } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { FlattenedHoverStyles } from '../types';
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
  DraxViewMeasurements,
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
/** Styles to strip from the hover content — margins and absolute positioning
 *  are not needed since hover is positioned via translateX/Y. */
const hoverResetStyle = {
  margin: 0,
  marginHorizontal: 0,
  marginVertical: 0,
  marginTop: 0,
  marginBottom: 0,
  marginLeft: 0,
  marginRight: 0,
  position: 'relative',
  left: 0,
  top: 0,
  right: undefined,
  bottom: undefined,
  flex: undefined,
  flexGrow: undefined,
  flexShrink: undefined,
  flexBasis: undefined,
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
  hoverDimsSV: SharedValue<Position>;
  grabOffsetSV: SharedValue<Position>;
  startPositionSV: SharedValue<Position>;
  setHoverContent: (content: ReactNode | null) => void;
  hoverReadySV: SharedValue<boolean>;
  hoverClearDeferredRef: { current: boolean };
  isDragAllowedSV: SharedValue<boolean>;
  hoverStylesRef: RefObject<FlattenedHoverStyles | null>;
  // Provider-level callbacks
  onProviderDragStart?: (event: DraxProviderDragEvent) => void;
  onProviderDrag?: (event: DraxProviderDragEvent) => void;
  onProviderDragEnd?: (event: DraxProviderDragEvent & { cancelled: boolean }) => void;
  // Dropped items tracking (for capacity)
  droppedItemsRef: RefObject<Map<string, Set<string>>>;
}

/**
 * Provides JS-thread callback dispatch functions that are invoked via scheduleOnRN
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
    hoverDimsSV,
    grabOffsetSV,
    startPositionSV,
    setHoverContent,
    hoverReadySV,
    isDragAllowedSV,
    onProviderDragStart,
    onProviderDrag,
    onProviderDragEnd,
    droppedItemsRef,
  } = deps;

  // Track current monitor ids for exit events
  const currentMonitorIdsRef = useRef<string[]>([]);


  /** Build dragged view event data. Position data is passed as params
   *  (from the worklet) to avoid cross-thread SV.value reads on JS thread. */
  const buildDraggedViewData = (
    draggedId: string,
    absolutePosition: Position,
    startPosition: Position,
    grabOffset: Position
  ): DraxEventDraggedViewData | undefined => {
    const entry = getViewEntry(draggedId);
    if (!entry) return undefined;

    const dragTranslation = {
      x: absolutePosition.x - startPosition.x,
      y: absolutePosition.y - startPosition.y,
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
      hoverPosition: absolutePosition,
    };
  };

  /** Build receiver view event data. Spatial entries + scroll offsets passed
   *  as params (cached once per handler call) to avoid redundant SV.value reads. */
  const buildReceiverViewData = (
    receiverId: string,
    absolutePosition: Position,
    spatialEntries: SpatialEntry[],
    scrollOffsets: Position[]
  ): DraxEventReceiverViewData | undefined => {
    const entry = getViewEntry(receiverId);
    if (!entry?.measurements) return undefined;

    // Compute absolute measurements of receiver
    const idx = entry.spatialIndex;
    const absPos = computeAbsolutePositionWorklet(idx, spatialEntries, scrollOffsets);
    const absMeasurements: DraxViewMeasurements = {
      ...absPos,
      width: entry.measurements.width,
      height: entry.measurements.height,
      _transformDetected: 0,
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

  /** Called via scheduleOnRN when drag starts.
   *  absolutePosition IS the startPosition at drag start (set in onActivate). */
  const handleDragStart = (
    draggedId: string,
    absolutePosition: Position,
    grabOffset: Position
  ) => {
    const draggedEntry = getViewEntry(draggedId);
    if (!draggedEntry) return;

    // At drag start, absolutePosition === startPosition (both set from rootRelPos in onActivate)
    const dragged = buildDraggedViewData(draggedId, absolutePosition, absolutePosition, grabOffset);
    if (!dragged) return;

    // At drag start, dragTranslation is always {0,0}
    const dragTranslation = { x: 0, y: 0 };

    // Fire onDragStart callback
    draggedEntry.props.onDragStart?.({
      dragAbsolutePosition: absolutePosition,
      dragTranslation,
      dragged,
    });

    // Reset hover dimensions — let HoverLayer auto-size to card content.
    // Must happen BEFORE setHoverContent so HoverLayer's onLayout can write
    // actual content dimensions AFTER rendering. Board reads these for cross-orientation gaps.
    hoverDimsSV.value = { x: 0, y: 0 };

    // Use pre-flattened styles from registration — avoids 5 StyleSheet.flatten calls
    // in the drag-start hot path. Set BEFORE setHoverContent so HoverLayer captures
    // them when it re-renders.
    deps.hoverStylesRef.current = draggedEntry.flattenedHoverStyles ?? null;

    // Setup hover content — synchronous, renders HoverLayer in same frame.
    // hoverReadySV gates visibility (opacity 0) until HoverLayer's useLayoutEffect fires.
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
            hoverResetStyle,
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

  /** Called via scheduleOnRN on every gesture update for callback dispatch.
   *  Handles: enter/exit (on receiver change), onDragOver/onReceiveDragOver
   *  (continuous, same receiver), onDrag (continuous, no receiver), and monitors. */
  const handleReceiverChange = (
    oldReceiverId: string,
    newReceiverId: string,
    absolutePosition: Position,
    draggedId: string,
    startPosition: Position,
    grabOffset: Position,
    monitorIds?: string[]
  ) => {

    // Fast path: receiver unchanged, no monitors (now AND previously),
    // and no continuous callbacks → skip event data construction entirely.
    const newMonitorIds = monitorIds ?? [];
    const prevMonitorIds = currentMonitorIdsRef.current;
    if (
      oldReceiverId === newReceiverId &&
      newMonitorIds.length === 0 &&
      prevMonitorIds.length === 0
    ) {
      const draggedEntry = getViewEntry(draggedId);
      if (!draggedEntry) return;
      const hasOnDragOver = newReceiverId && draggedEntry.props.onDragOver;
      const receiverEntry = newReceiverId ? getViewEntry(newReceiverId) : undefined;
      const hasOnReceiveDragOver = newReceiverId && receiverEntry?.props.onReceiveDragOver;
      const hasOnDrag = !newReceiverId && (draggedEntry.props.onDrag || onProviderDrag);
      if (!hasOnDragOver && !hasOnReceiveDragOver && !hasOnDrag) return;
    }

    const dragged = buildDraggedViewData(draggedId, absolutePosition, startPosition, grabOffset);
    if (!dragged) return;

    // Cache spatial data once per handler call — avoids redundant cross-thread SV reads
    const cachedSpatialEntries = spatialIndexSV.value;
    const cachedScrollOffsets = scrollOffsetsSV.value;

    const draggedEntry = getViewEntry(draggedId);
    const draggedPayload = draggedEntry?.props.dragPayload ?? draggedEntry?.props.payload;

    // startPosition passed as arg from worklet — avoids cross-thread SV read per frame
    const dragTranslation = {
      x: absolutePosition.x - startPosition.x,
      y: absolutePosition.y - startPosition.y,
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
        scheduleOnUI((
          _receiverIdSV: typeof deps.receiverIdSV,
          _rejectedReceiverIdSV: typeof deps.rejectedReceiverIdSV,
          _rejectedId: string,
        ) => {
          'worklet';
          _receiverIdSV.value = '';
          _rejectedReceiverIdSV.value = _rejectedId;
        }, deps.receiverIdSV, deps.rejectedReceiverIdSV, newReceiverId);
      }
    }

    // Fire exit on old receiver (only when receiver actually changed)
    if (oldReceiverId && oldReceiverId !== acceptedReceiverId) {
      const oldReceiverEntry = getViewEntry(oldReceiverId);
      const oldReceiverData = buildReceiverViewData(
        oldReceiverId,
        absolutePosition,
        cachedSpatialEntries,
        cachedScrollOffsets
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
        absolutePosition,
        cachedSpatialEntries,
        cachedScrollOffsets
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
      const receiverData = buildReceiverViewData(acceptedReceiverId, absolutePosition, cachedSpatialEntries, cachedScrollOffsets);
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
    const prevWasEmpty = prevMonitorIds.length === 0;

    // Build receiver data for monitor event payload (use accepted receiver, not raw hit-test)
    const receiverData = acceptedReceiverId
      ? buildReceiverViewData(acceptedReceiverId, absolutePosition, cachedSpatialEntries, cachedScrollOffsets)
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
    onProviderDrag?.({ draggedId, receiverId: acceptedReceiverId || undefined, position: absolutePosition });
  };

  /** Called via scheduleOnRN when drag ends or is cancelled */
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
      scheduleOnUI((
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
      }, hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
      return;
    }

    // Cache all SV reads once at the top — avoids redundant cross-thread syncs
    const absolutePosition = { ...hoverPositionSV.value };
    const startPos = startPositionSV.value;
    const grabOffset = grabOffsetSV.value;
    const cachedSpatialEntries = spatialIndexSV.value;
    const cachedScrollOffsets = scrollOffsetsSV.value;

    const dragged = buildDraggedViewData(draggedId, absolutePosition, startPos, grabOffset);
    if (!dragged) {
      scheduleOnUI((
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
      }, hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
      return;
    }

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
        absolutePosition,
        cachedSpatialEntries,
        cachedScrollOffsets
      );

      if (receiverData && receiverEntry) {
        // Compute receiver's absolute position and center the dragged item within it
        const receiverAbsPos = computeAbsolutePositionWorklet(
          receiverEntry.spatialIndex,
          cachedSpatialEntries,
          cachedScrollOffsets
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
          absolutePosition,
          cachedSpatialEntries,
          cachedScrollOffsets
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
    if (snapTarget === DraxSnapbackTargetPreset.Default) {
      const absPos = computeAbsolutePositionWorklet(
        draggedEntry.spatialIndex,
        cachedSpatialEntries,
        cachedScrollOffsets
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
      deps.hoverClearDeferredRef,
      isDragAllowedSV,
    );

    // Fire provider-level onDragEnd (use last known hover position)
    onProviderDragEnd?.({ draggedId, receiverId: receiverId || undefined, position: absolutePosition, cancelled });
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
  hoverClearDeferredRef: { current: boolean },
  isDragAllowedSV: SharedValue<boolean>,
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
   * For REORDER: finalizeDrag sets permanent shifts + clears hover via scheduleOnUI
   *   in a single atomic block. No FlatList data change, so no blink.
   *
   * For CANCEL: finalizeDrag → cancelDrag → reverts to committed shifts.
   *   Then hover clears on next UI frame. Items at visual positions. No blink.
   */
  const onSnapComplete = () => {

    try {
      // Reset the deferred flag before firing callbacks.
      // finalizeDrag (called via onSnapEnd) may set it to true for reorder.
      hoverClearDeferredRef.current = false;

      // Step 1: Fire callbacks → finalizeDrag runs synchronously.
      draggedEntry.props.onSnapEnd?.(snapEventData);
      receiverEntry?.props.onReceiveSnapEnd?.(snapEventData);

      // Step 2: Skip hover cleanup if a new drag started during our snap animation.
      if (draggedIdSV.value !== '' && draggedIdSV.value !== draggedEntry.id) {
        return;
      }

      // Step 3: Clear hover if NOT deferred by a sortable reorder.
      if (!hoverClearDeferredRef.current) {
        scheduleOnUI((
          _hoverReadySV: typeof hoverReadySV,
          _dragPhaseSV: typeof dragPhaseSV,
          _draggedIdSV: typeof draggedIdSV,
          _hoverPositionSV: typeof hoverPositionSV,
          _isDragAllowedSV: typeof isDragAllowedSV,
        ) => {
          'worklet';
          _hoverReadySV.value = false;
          _dragPhaseSV.value = 'idle';
          _draggedIdSV.value = '';
          _hoverPositionSV.value = { x: 0, y: 0 };
          _isDragAllowedSV.value = true; // Unlock — allow new drags
        }, hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV, isDragAllowedSV);
        setHoverContent(null);
      } else {
        // Do NOT call setHoverContent(null) here — the hover must remain visible
        // until the FlatList re-renders. The deferred cleanup in useLayoutEffect
        // will clear SharedValues, and setHoverContent(null) is called there too.
      }
    } catch (e) {
      // If ANYTHING throws, ensure the lock is released and hover is cleaned up.
      // Without this, a crash leaves isDragAllowedSV=false (locked forever) and
      // hover stuck on screen.
      console.error('[snap] onSnapComplete crashed — emergency cleanup', e);
      isDragAllowedSV.value = true;
      hoverClearDeferredRef.current = false;
      scheduleOnUI((
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
      }, hoverReadySV, dragPhaseSV, draggedIdSV, hoverPositionSV);
      setHoverContent(null);
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
          scheduleOnRN(onSnapComplete);
        }
      })
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
