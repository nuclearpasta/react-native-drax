import type { ComponentRef, ReactNode } from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { DraxHandleContext } from './DraxHandleContext';
import { DraxSubprovider } from './DraxSubprovider';
import { useDraxContext, useDraxId } from './hooks';
import { useDragGesture } from './hooks/useDragGesture';
import { isDraggable as computeIsDraggable } from './hooks/useSpatialIndex';
import { useViewStyles } from './hooks/useViewStyles';
import { defaultLongPressDelay } from './params';
import type {
  DraxViewMeasurementHandler,
  DraxViewMeasurements,
  DraxViewProps,
  Position,
} from './types';
import { DraxViewDragStatus, DraxViewReceiveStatus } from './types';

/** Keys that should NOT be passed through to Reanimated.View */
const DRAX_PROP_KEYS: ReadonlySet<string> = new Set([
  'renderContent',
  'renderHoverContent',
  'noHover',
  'registration',
  'onMeasure',
  'parent',
  'isParent',
  'scrollPosition',
  'longPressDelay',
  'lockDragXPosition',
  'lockDragYPosition',
  'id',
  // Callback props
  'onDragStart',
  'onDrag',
  'onDragEnter',
  'onDragOver',
  'onDragExit',
  'onDragEnd',
  'onDragDrop',
  'onSnapEnd',
  'onReceiveSnapEnd',
  'onReceiveDragEnter',
  'onReceiveDragOver',
  'onReceiveDragExit',
  'onReceiveDragDrop',
  'onMonitorDragStart',
  'onMonitorDragEnter',
  'onMonitorDragOver',
  'onMonitorDragExit',
  'onMonitorDragEnd',
  'onMonitorDragDrop',
  'animateSnap',
  'snapDelay',
  'snapDuration',
  'snapAnimator',
  'dragPayload',
  'receiverPayload',
  'payload',
  'draggable',
  'receptive',
  'monitoring',
  'rejectOwnChildren',
  'disableHoverViewMeasurementsOnLayout',
  'dynamicReceptiveCallback',
  'acceptsDrag',
  'dragBoundsRef',
  // Style props (handled by useViewStyles)
  'style',
  'dragInactiveStyle',
  'draggingStyle',
  'draggingWithReceiverStyle',
  'draggingWithoutReceiverStyle',
  'dragReleasedStyle',
  'hoverStyle',
  'hoverDraggingStyle',
  'hoverDraggingWithReceiverStyle',
  'hoverDraggingWithoutReceiverStyle',
  'hoverDragReleasedStyle',
  'receiverInactiveStyle',
  'receivingStyle',
  'otherDraggingStyle',
  'otherDraggingWithReceiverStyle',
  'otherDraggingWithoutReceiverStyle',
  'dragHandle',
  'dragActivationFailOffset',
  'collisionAlgorithm',
  'scrollHorizontal',
  '_contentPosition',
]);

/** Extract only ViewProps-compatible props by filtering out Drax-specific keys */
function extractViewProps(props: DraxViewProps): Record<string, unknown> {
  const viewProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!DRAX_PROP_KEYS.has(key)) {
      viewProps[key] = value;
    }
  }
  return viewProps;
}

/**
 * Isolated hook for scroll-position → spatial-index sync.
 * Kept separate from DraxView so the worklet closure only captures
 * SharedValues — never React refs from the component scope. The worklets
 * serializer recursively freezes all plain objects in a worklet's closure,
 * which would freeze useRef objects and trigger "Tried to modify key `current`"
 * warnings when React nullifies refs on unmount.
 */
function useScrollPositionSync(
  scrollPosition: SharedValue<Position> | undefined,
  spatialIndexSV: SharedValue<number>,
  scrollOffsetsSV: SharedValue<Position[]>
) {
  useAnimatedReaction(
    () => scrollPosition?.value,
    (pos, prev) => {
      'worklet';
      if (!pos) return;
      if (prev && pos.x === prev.x && pos.y === prev.y) return;
      const idx = spatialIndexSV.value;
      if (idx < 0) return;
      scrollOffsetsSV.modify((offsets) => {
        if (idx >= 0 && idx < offsets.length) {
          offsets[idx] = pos;
        }
        return offsets;
      });
    }
  );
}

export const DraxView = memo((props: DraxViewProps): ReactNode => {
  const {
    renderContent,
    registration,
    onMeasure,
    parent: parentProp,
    isParent,
    scrollPosition,
    longPressDelay = defaultLongPressDelay,
    lockDragXPosition,
    lockDragYPosition,
    scrollHorizontal,
    dragHandle,
    dragBoundsRef,
    children,
    style,
    id: idProp,
  } = props;

  // Determine capabilities from props (shared with useSpatialIndex)
  const draggable = computeIsDraggable(props);

  // Unique id
  const id = useDraxId(idProp);

  // Connect with Drax context
  const {
    registerView,
    unregisterView,
    updateMeasurements: updateMeasurementsCtx,
    updateViewProps,
    getViewEntry,
    rootViewRef,
    scrollOffsetsSV,
    parent: contextParent,
  } = useDraxContext();

  // Parent view (from prop or context)
  const parent = parentProp ?? contextParent;
  const parentId = parent?.id;
  const parentViewRef = parent ? parent.viewRef : rootViewRef;

  // View ref for measuring
  const viewRef = useRef<ComponentRef<typeof Reanimated.View>>(null);
  const measurementsRef = useRef<DraxViewMeasurements | undefined>(undefined);

  // ── Measurement ────────────────────────────────────────────────────

  /** Finalize measurements and notify consumers.
   *  `transformDetected` = 1 when auto-detection found transform-based positioning
   *  (visual measurement used instead of Yoga layout). Consumers can check
   *  `measurements._transformDetected` to know whether shift subtraction is needed. */
  const finalizeMeasurement = useCallback(
    (x: number, y: number, width: number, height: number, handler?: DraxViewMeasurementHandler, transformDetected = 0) => {
      // Skip expensive downstream work when measurement hasn't changed.
      // measureLayout (JSI) still runs, but spatial index update + callbacks are avoided.
      const prev = measurementsRef.current;
      if (prev && prev.x === x && prev.y === y
          && prev.width === width && prev.height === height
          && prev._transformDetected === transformDetected) {
        handler?.(prev);
        return;
      }
      const measurements: DraxViewMeasurements = { height, x, y, width, _transformDetected: transformDetected };
      measurementsRef.current = measurements;
      updateMeasurementsCtx(id, measurements);
      onMeasure?.(measurements);
      handler?.(measurements);
    },
    [id, updateMeasurementsCtx, onMeasure],
  );

  const measureWithHandler = useCallback((handler?: DraxViewMeasurementHandler) => {
    const view = viewRef.current;
    if (!view || !parentViewRef.current) return;

    // Fast path: recycled list cells provide authoritative position from basePositionsRef.
    // Bypasses view.measure() which returns stale transform positions due to the
    // timing gap between SharedValue writes (JS) and UI-thread transform application.
    // LegendList avoids this by applying transforms as React props (committed before
    // measurement). Our RecycledCell uses SVs for zero-render position updates, so
    // we provide the known-correct position directly instead of measuring.
    const contentPos = props._contentPosition;
    if (contentPos) {
      view.measureLayout(
        parentViewRef.current,
        (_x, _y, width, height) => {
          finalizeMeasurement(contentPos.x, contentPos.y, width!, height!, handler, 1);
        },
        () => {}
      );
      return;
    }

    view.measureLayout(
      parentViewRef.current,
      (x, y, width, height) => {
        if (Platform.OS === 'web') {
          // On web, measureLayout returns visual positions — add scroll to
          // convert to content-relative.
          const parentData = parentId ? getViewEntry(parentId) : undefined;
          const parentScroll = parentData?.scrollPosition?.value ?? { x: 0, y: 0 };
          finalizeMeasurement(x! + parentScroll.x, y! + parentScroll.y, width!, height!, handler);
          return;
        }

        // On Fabric, measureLayout uses includeTransform=false → returns Yoga
        // layout positions. This is correct for FlatList/FlashList, but wrong
        // for LegendList (which positions items via translateY, so all report y=0).
        //
        // Auto-detect: when measureLayout returns position=0 (the hallmark of
        // transform-positioned items: position:absolute, top:0), also call
        // measure() to get the visual position. If it differs, the item is
        // transform-positioned. Only check when layoutPosition=0 to avoid
        // false positives on shifted items (whose measureLayout is non-zero).
        const layoutX = x!;
        const layoutY = y!;
        if (layoutX !== 0 && layoutY !== 0) {
          // Non-zero layout position → normal Yoga layout, trust measureLayout.
          finalizeMeasurement(layoutX, layoutY, width!, height!, handler);
          return;
        }
        const parentView = parentViewRef.current;
        if (!parentView) {
          finalizeMeasurement(layoutX, layoutY, width!, height!, handler);
          return;
        }
        view.measure((_vx: number, _vy: number, _vw: number, _vh: number, pageX: number, pageY: number) => {
          parentView.measure((_px: number, _py: number, _pw: number, _ph: number, parentPageX: number, parentPageY: number) => {
            const parentData = parentId ? getViewEntry(parentId) : undefined;
            const parentScroll = parentData?.scrollPosition?.value ?? { x: 0, y: 0 };
            const visualX = pageX - parentPageX + parentScroll.x;
            const visualY = pageY - parentPageY + parentScroll.y;
            // If visual position differs from layout, the view is transform-positioned.
            if (Math.abs(visualX - layoutX) > 1 || Math.abs(visualY - layoutY) > 1) {
              finalizeMeasurement(visualX, visualY, width!, height!, handler, 1);
            } else {
              finalizeMeasurement(layoutX, layoutY, width!, height!, handler);
            }
          });
        });
      },
      () => {}
    );
  }, [id, parentId, viewRef, parentViewRef, getViewEntry, finalizeMeasurement, props._contentPosition]);

  // ── Register/unregister with context ────────────────────────────────
  // Keep a ref to the latest props so registry always has current callbacks
  const propsRef = useRef(props);
  propsRef.current = props;

  useLayoutEffect(() => {
    registerView({
      id,
      parentId,
      scrollPosition,
      props: propsRef.current,
    });
    measureWithHandler();
    return () => unregisterView(id);
  }, [id, parentId, scrollPosition, registerView, unregisterView, measureWithHandler]);

  // ── Update registry when payload or children change.
  // Only writes when something meaningful changed — avoids 30+ registry writes per render pass.
  const lastPayloadRef = useRef<unknown>(undefined);
  const lastChildrenRef = useRef<ReactNode>(undefined);
  useLayoutEffect(() => {
    const p = propsRef.current;
    if (p.payload !== lastPayloadRef.current || p.children !== lastChildrenRef.current) {
      lastPayloadRef.current = p.payload;
      lastChildrenRef.current = p.children;
      updateViewProps(id, p);
    }
  });

  // New Architecture: useLayoutEffect + measure() runs synchronously before paint.
  // Replaces onLayout callback — measurement happens in same commit as render.
  useLayoutEffect(() => {
    measureWithHandler();
    if (dragBoundsRef?.current && rootViewRef.current) {
      dragBoundsRef.current.measureLayout(
        rootViewRef.current,
        (x: number, y: number, width: number, height: number) => {
          dragBoundsSV.value = { x, y, width, height };
        },
        () => {}
      );
    }
  });

  // External registration — useLayoutEffect so SortableItem's FLIP
  // useLayoutEffect (which runs after children) sees measureFnRef.
  useLayoutEffect(() => {
    if (registration) {
      registration({ id, measure: measureWithHandler });
      return () => registration(undefined);
    }
    return undefined;
  }, [id, measureWithHandler, registration]);

  // ── Gesture (per-view, UI thread) ──────────────────────────────────
  // Use a SharedValue for spatialIndex so it updates reactively after registration
  const spatialIndexSV = useSharedValue(-1);

  // Update spatialIndex after registration completes
  useEffect(() => {
    const entry = getViewEntry(id);
    const index = entry?.spatialIndex ?? -1;
    spatialIndexSV.value = index;
  }, [id, getViewEntry, spatialIndexSV]);

  // Sync scroll position to spatial index — delegated to a separate hook
  // so the worklet closure only contains SharedValues (no refs from DraxView scope).
  useScrollPositionSync(scrollPosition, spatialIndexSV, scrollOffsetsSV);

  // SharedValues for gesture config — RNGH 3.0 reconfigures the native
  // handler on the UI thread, bypassing JS→native bridge entirely.
  const draggableSV = useSharedValue(draggable);
  const longPressDelaySV = useSharedValue(longPressDelay);

  // Update SharedValues when props change (in useEffect to avoid render-time writes)
  useEffect(() => {
    draggableSV.value = draggable;
    longPressDelaySV.value = longPressDelay;
  }, [draggable, longPressDelay, draggableSV, longPressDelaySV]);

  // Drag bounds: measure the bounds view relative to root and store in SharedValue
  const dragBoundsSV = useSharedValue<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (dragBoundsRef?.current && rootViewRef.current) {
      dragBoundsRef.current.measureLayout(
        rootViewRef.current,
        (x: number, y: number, width: number, height: number) => {
          dragBoundsSV.value = { x, y, width, height };
        },
        () => {}
      );
    } else {
      dragBoundsSV.value = null;
    }
  }, [dragBoundsRef, rootViewRef, dragBoundsSV]);

  const handleOffsetSV = useSharedValue<Position>({ x: 0, y: 0 });
  const gesture = useDragGesture(
    id,
    spatialIndexSV,
    draggableSV,
    longPressDelaySV,
    lockDragXPosition,
    lockDragYPosition,
    dragBoundsSV,
    props.dragActivationFailOffset,
    scrollHorizontal,
    dragHandle ? handleOffsetSV : undefined,
    props.sortableWorklet as import('./hooks/useDragGesture').SortableWorkletConfig | undefined,
  );

  // ── Animated styles ────────────────────────────────────────────────
  const { animatedDragStyle } = useViewStyles(id, props);

  // ── Memoize parent for DraxSubprovider ──────────────────────────────
  const subproviderParent = useMemo(
    () => ({ id, viewRef }),
    [id, viewRef]
  );

  // ── Rendered children ──────────────────────────────────────────────
  let renderedContent: ReactNode;
  if (renderContent) {
    renderedContent = renderContent({
      viewState: {
        dragStatus: DraxViewDragStatus.Inactive,
        receiveStatus: DraxViewReceiveStatus.Inactive,
      },
      hover: false,
      children,
      dimensions: measurementsRef.current
        ? {
            width: measurementsRef.current.width,
            height: measurementsRef.current.height,
          }
        : undefined,
    });
  } else {
    renderedContent = children;
  }

  if (isParent) {
    renderedContent = (
      <DraxSubprovider parent={subproviderParent}>{renderedContent}</DraxSubprovider>
    );
  }

  // Handle offset SharedValue is always created (hooks can't be conditional)
  // but only used when dragHandle is true.
  if (dragHandle) {
    renderedContent = (
      <DraxHandleContext.Provider value={{ gesture, handleOffsetSV, parentViewRef: viewRef }}>
        {renderedContent}
      </DraxHandleContext.Provider>
    );
  }

  // ── Extract view-safe props ─────────────────────────────────────
  // DraxView is memo()'d so props identity is stable between renders.
  const viewProps = useMemo(() => extractViewProps(props), [props]);

  // ── Render ─────────────────────────────────────────────────────────
  const viewElement = (
    <Reanimated.View
      {...viewProps}
      style={[style, animatedDragStyle]}
      ref={viewRef}
      collapsable={false}
    >
      {renderedContent}
    </Reanimated.View>
  );

  // When dragHandle is true, skip the GestureDetector wrapper —
  // the gesture is attached to the DraxHandle child instead.
  if (dragHandle) {
    return viewElement;
  }

  return <GestureDetector gesture={gesture}>{viewElement}</GestureDetector>;
});
