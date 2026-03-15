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
  'collisionAlgorithm',
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
    dragHandle,
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
  const measureWithHandler = useCallback((handler?: DraxViewMeasurementHandler) => {
    const view = viewRef.current;
    if (view && parentViewRef.current) {
      view.measureLayout(
        parentViewRef.current,
        (x, y, width, height) => {
          // On Fabric (new arch), measureLayout returns content-relative positions
          // (includeTransform=false in native C++ layer — scroll offset excluded).
          // No scroll adjustment needed on native.
          // On web, measureLayout returns visual positions — add scroll to convert
          // to content-relative. computeAbsolutePositionWorklet subtracts scroll
          // at hit-test time to get visual positions back.
          let scrollAdjustX = 0;
          let scrollAdjustY = 0;
          if (Platform.OS === 'web') {
            const parentData = parentId ? getViewEntry(parentId) : undefined;
            const parentScroll = parentData?.scrollPosition?.value ?? { x: 0, y: 0 };
            scrollAdjustX = parentScroll.x;
            scrollAdjustY = parentScroll.y;
          }

          const measurements: DraxViewMeasurements | undefined =
            height === undefined
              ? undefined
              : {
                  height,
                  x: x! + scrollAdjustX,
                  y: y! + scrollAdjustY,
                  width: width!,
                };

          measurementsRef.current = measurements;
          if (measurements) {
            updateMeasurementsCtx(id, measurements);
          }
          onMeasure?.(measurements);
          handler?.(measurements);
        },
        () => {}
      );
    }
  }, [id, parentId, viewRef, parentViewRef, getViewEntry, updateMeasurementsCtx, onMeasure]);

  // ── Register/unregister with context ────────────────────────────────
  // Keep a ref to the latest props so registry always has current callbacks
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    registerView({
      id,
      parentId,
      scrollPosition,
      props: propsRef.current,
    });
    // Re-measure after registration. onLayout may have fired before
    // registerView (useEffect runs after paint), causing updateMeasurements
    // to silently drop data (entry didn't exist yet in registry).
    measureWithHandler();
    return () => unregisterView(id);
  }, [id, parentId, scrollPosition, registerView, unregisterView, measureWithHandler]);

  // ── Update registry when props change ────────────────────────────────
  useEffect(() => {
    updateViewProps(id, propsRef.current);
  }, [id, updateViewProps, draggable, props.receptive, props.monitoring, props.collisionAlgorithm]);

  const onLayout = () => {
    measureWithHandler();
  };

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

  const gesture = useDragGesture(
    id,
    spatialIndexSV,
    draggableSV,
    longPressDelaySV,
    lockDragXPosition,
    lockDragYPosition
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

  // When dragHandle is true, provide the gesture via context so DraxHandle can attach it
  if (dragHandle) {
    renderedContent = (
      <DraxHandleContext.Provider value={{ gesture }}>
        {renderedContent}
      </DraxHandleContext.Provider>
    );
  }

  // ── Extract view-safe props ─────────────────────────────────────
  const viewProps = extractViewProps(props);

  // ── Render ─────────────────────────────────────────────────────────
  const viewElement = (
    <Reanimated.View
      {...viewProps}
      style={[style, animatedDragStyle]}
      ref={viewRef}
      onLayout={onLayout}
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
