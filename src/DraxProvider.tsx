import type { ReactNode, RefObject } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { HostInstance } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { DraxContext } from './DraxContext';
import { HoverLayer } from './HoverLayer';
import { useCallbackDispatch } from './hooks/useCallbackDispatch';
import { useSpatialIndex } from './hooks/useSpatialIndex';
import type {
  DragPhase,
  DraxContextValue,
  DraxProviderProps,
  Position,
} from './types';

export const DraxProvider = ({
  style = styles.provider,
  children,
}: DraxProviderProps): ReactNode => {
  // ── Split SharedValues (by update frequency) ───────────────────────
  // Changes ~2x per drag. Read by all DraxView useAnimatedStyle.
  const draggedIdSV = useSharedValue<string>('');
  // Changes ~3-5x per drag. Read by all DraxView useAnimatedStyle.
  const receiverIdSV = useSharedValue<string>('');
  // Changes ~3x per drag. Read by all DraxView useAnimatedStyle.
  const dragPhaseSV = useSharedValue<DragPhase>('idle');
  // Changes every frame during drag. Read ONLY by HoverLayer (1 component).
  const hoverPositionSV = useSharedValue<Position>({ x: 0, y: 0 });
  // Changes every frame during drag. Used by gesture worklet for hit-testing.
  // NOT read by any useAnimatedStyle.
  const dragAbsolutePositionSV = useSharedValue<Position>({ x: 0, y: 0 });
  // Set once per drag start.
  const grabOffsetSV = useSharedValue<Position>({ x: 0, y: 0 });
  const startPositionSV = useSharedValue<Position>({ x: 0, y: 0 });
  // Screen offset of the root view (measured on layout).
  const rootOffsetSV = useSharedValue<Position>({ x: 0, y: 0 });
  // True after hover content is committed to DOM. False after snap completes.
  const hoverReadySV = useSharedValue(false);
  // Set by SortableContainer.finalizeDrag to defer hover clearing to useLayoutEffect.
  const hoverClearDeferredRef = useRef(false);
  // Animated dimensions for hover content during cross-container transfer.
  // x = width, y = height. {0,0} = no constraint (natural size).
  const hoverDimsSV = useSharedValue<Position>({ x: 0, y: 0 });

  // ── Spatial index + registry ───────────────────────────────────────
  const {
    spatialIndexSV,
    scrollOffsetsSV,
    registerView,
    unregisterView,
    updateMeasurements,
    updateScrollOffset,
    updateViewProps,
    getViewEntry,
  } = useSpatialIndex();

  // ── Hover content (ref-based to avoid provider re-renders) ─────────
  // Store content in a ref so changing it doesn't re-render the entire tree.
  // Only HoverLayer re-renders via the version counter.
  const hoverContentRef: RefObject<ReactNode> = useRef<ReactNode>(null);
  const [hoverVersion, setHoverVersion] = useState(0);
  const setHoverContent = useCallback((content: ReactNode | null) => {
    hoverContentRef.current = content;
    setHoverVersion((v) => v + 1);
  }, []);

  // ── Callback dispatch ──────────────────────────────────────────────
  const { handleDragStart, handleReceiverChange, handleDragEnd } =
    useCallbackDispatch({
      getViewEntry,
      spatialIndexSV,
      scrollOffsetsSV,
      draggedIdSV,
      receiverIdSV,
      dragPhaseSV,
      hoverPositionSV,
      grabOffsetSV,
      startPositionSV,
      setHoverContent,
      hoverReadySV,
      hoverClearDeferredRef,
    });

  // ── Root view ref ──────────────────────────────────────────────────
  const rootViewRef = useRef<HostInstance>(null);
  const setRootViewRef = (ref: HostInstance | null) => {
    rootViewRef.current = ref;
  };

  // Measure root view's screen position on layout
  const handleRootLayout = useCallback(() => {
    const view = rootViewRef.current;
    if (view) {
      (view as unknown as { measure: (cb: (...args: number[]) => void) => void })
        .measure((_x, _y, _w, _h, pageX, pageY) => {
          rootOffsetSV.value = { x: pageX, y: pageY };
        });
    }
  }, [rootOffsetSV]);

  // ── Stable context value ───────────────────────────────────────────
  const contextValue = useMemo<DraxContextValue>(
    () => ({
      // SharedValues
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
      hoverReadySV,
      hoverClearDeferredRef,
      hoverDimsSV,

      // Registry methods
      registerView,
      unregisterView,
      updateMeasurements,
      updateScrollOffset,
      updateViewProps,
      getViewEntry,

      // Callback dispatch
      handleDragStart,
      handleReceiverChange,
      handleDragEnd,

      // Hover content
      setHoverContent,

      // Refs
      rootViewRef,
    }),
    [
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
      hoverReadySV,
      hoverClearDeferredRef,
      hoverDimsSV,
      registerView,
      unregisterView,
      updateMeasurements,
      updateScrollOffset,
      updateViewProps,
      getViewEntry,
      handleDragStart,
      handleReceiverChange,
      handleDragEnd,
      setHoverContent,
    ]
  );

  return (
    <DraxContext value={contextValue}>
      <View style={style} ref={setRootViewRef} onLayout={handleRootLayout} collapsable={false}>
        {children}
        <HoverLayer
          hoverContentRef={hoverContentRef}
          hoverVersion={hoverVersion}
          hoverPositionSV={hoverPositionSV}
          dragPhaseSV={dragPhaseSV}
          hoverReadySV={hoverReadySV}
          hoverDimsSV={hoverDimsSV}
        />
      </View>
    </DraxContext>
  );
};

const styles = StyleSheet.create({
  provider: {
    flex: 1,
  },
});
