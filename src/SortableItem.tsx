import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import { computeResetStyle } from './hooks/useViewStyles';
import type { SortableItemContextValue } from './SortableItemContext';
import { SortableItemContext } from './SortableItemContext';
import type { ResolvedAnimationConfig } from './params';
import { resolveAnimationConfig } from './params';
import type {
  DraxViewMeasurementHandler,
  DraxViewProps,
  Position,
  SortableItemMeasurement,
  SortableListHandle,
} from './types';

const DEFAULT_DRAGGED_ITEM_STYLE: ViewStyle = { opacity: 0 };

/**
 * Isolated hook for SortableItem animated style.
 * Kept separate so the worklet closure only contains SharedValues —
 * never React refs from the component scope.
 */
function useSortableItemStyle(
  hoverReadySV: SharedValue<boolean>,
  draggedIdSV: SharedValue<string>,
  viewIdSV: SharedValue<string>,
  shiftsValidSV: SharedValue<boolean>,
  shiftsRef: SharedValue<Record<string, Position>>,
  instantClearSV: SharedValue<boolean>,
  itemKey: string | undefined,
  animConfig: ResolvedAnimationConfig,
  reducedMotion: boolean,
  inactiveItemStyle?: ViewStyle,
  draggedItemStyle: ViewStyle = DEFAULT_DRAGGED_ITEM_STYLE,
) {
  // Reanimated never unsets a key that leaves the animated style, so every
  // key of the item styles gets an explicit neutral value when not applied.
  const resetStyle = useMemo(
    () => computeResetStyle(null, inactiveItemStyle ?? null, draggedItemStyle),
    [inactiveItemStyle, draggedItemStyle],
  );
  return useAnimatedStyle(() => {
    // Guard: viewIdSV starts as '' before DraxView registers. Without the
    // non-empty check, a newly mounted item would match a cleared draggedIdSV ('')
    // and be hidden (opacity 0) until hoverReadySV clears — visible in cross-container transfers.
    const isDragged = hoverReadySV.value && viewIdSV.value !== '' && draggedIdSV.value === viewIdSV.value;
    const dragActive = draggedIdSV.value !== '';
    const valid = shiftsValidSV.value;
    const shifts = shiftsRef.value;
    const shift = valid && itemKey ? shifts[itemKey] : undefined;
    const instant = instantClearSV.value;
    // When shifts are invalidated (data committing), snap to 0 instantly — no animation.
    // When reduced motion is on, skip all animations.
    const skipAnimation = instant || !valid || reducedMotion;

    const toX = shift?.x ?? 0;
    const toY = shift?.y ?? 0;

    let translateX: number;
    let translateY: number;

    if (skipAnimation) {
      translateX = toX;
      translateY = toY;
    } else if (animConfig.useSpring) {
      const springConfig = {
        damping: animConfig.springDamping,
        stiffness: animConfig.springStiffness,
        mass: animConfig.springMass,
      };
      translateX = withSpring(toX, springConfig);
      translateY = withSpring(toY, springConfig);
    } else {
      const timingConfig = { duration: animConfig.shiftDuration, easing: Easing.linear };
      translateX = withTiming(toX, timingConfig);
      translateY = withTiming(toY, timingConfig);
    }

    // Apply inactive style to non-dragged items while a drag is active
    const isInactive = dragActive && !isDragged;
    const activeStyle = isDragged ? draggedItemStyle : isInactive ? inactiveItemStyle : undefined;
    // User transforms apply after the shift translate.
    const userTransform = Array.isArray(activeStyle?.transform) ? activeStyle.transform : [];

    return {
      opacity: 1,
      ...resetStyle,
      ...activeStyle,
      transform: [{ translateX }, { translateY }, ...userTransform],
    };
  });
}

export interface SortableItemProps extends DraxViewProps {
  sortable: SortableListHandle<any>;
  index: number;
  /** When true, this item cannot be dragged and stays in its position.
   *  Other items will skip over it during reorder. */
  fixed?: boolean;
  children: ReactNode;
}

const SortableItemInner = ({
  sortable,
  index,
  fixed = false,
  children,
  ...draxViewProps
}: SortableItemProps) => {
  const {
    horizontal,
    lockToMainAxis,
    longPressDelay,
    animationConfig,
    inactiveItemStyle,
    draggedItemStyle,
    itemEntering,
    itemExiting,
    shiftsRef,
    shiftsJSRef,
    instantClearSV,
    shiftsValidSV,
    itemMeasurements,
    keyExtractor,
    rawData,
    originalIndexes,
    scrollPositionJSRef,
    onItemSnapEndRef,
    dragActiveRef,
    fixedKeys,
  } = sortable._internal;

  // Get hoverReadySV and draggedIdSV from DraxContext (provider-level SharedValues)
  const { hoverReadySV, draggedIdSV } = useDraxContext();

  const originalIndex = originalIndexes[index] ?? index;
  const item = rawData[originalIndex];
  const itemKey = item !== undefined ? keyExtractor(item, index) : undefined;

  // Register/unregister fixed items so reorder logic can skip them.
  useEffect(() => {
    if (!itemKey) return;
    if (fixed) {
      fixedKeys.current.add(itemKey);
    } else {
      fixedKeys.current.delete(itemKey);
    }
    return () => { fixedKeys.current.delete(itemKey); };
  }, [fixed, itemKey, fixedKeys]);

  // Store this DraxView's registered ID in a SharedValue so useAnimatedStyle
  // can compare it with draggedIdSV on the UI thread.
  const viewIdSV = useSharedValue('');

  const measureFnRef = useRef<
    ((handler?: DraxViewMeasurementHandler) => void) | null
  >(null);

  // Resolve animation config and check reduced motion preference
  const resolvedAnimConfig = useMemo(() => resolveAnimationConfig(animationConfig), [animationConfig]);
  const reducedMotion = useReducedMotion();

  // Delegated to isolated hook so worklet closure has no refs from this scope.
  const itemStyle = useSortableItemStyle(
    hoverReadySV, draggedIdSV, viewIdSV,
    shiftsValidSV, shiftsRef, instantClearSV, itemKey,
    resolvedAnimConfig, reducedMotion, inactiveItemStyle, draggedItemStyle,
  );

  // Derive isActive SharedValue for useItemContext consumers
  const isActive = useDerivedValue(() => {
    return viewIdSV.value !== '' && draggedIdSV.value === viewIdSV.value;
  });

  // Build context value for useItemContext
  const itemContextValue = useMemo<SortableItemContextValue | null>(() => {
    if (!itemKey) return null;
    return {
      itemKey,
      index,
      isActive,
      activeItemId: draggedIdSV,
    };
  }, [itemKey, index, isActive, draggedIdSV]);

  // Auto-generate accessibility props (can be overridden via draxViewProps)
  const totalItems = rawData.length;
  const defaultA11yLabel = `Item ${index + 1} of ${totalItems}`;
  const defaultA11yHint = 'Long press to drag and reorder';

  const mergedPayload = useMemo(() => ({
    ...(typeof draxViewProps.payload === 'object' && draxViewProps.payload !== null
      ? draxViewProps.payload : {}),
    index, originalIndex, item,
  }), [draxViewProps.payload, index, originalIndex, item]);

  return (
    <SortableItemContext value={itemContextValue}>
    <Reanimated.View style={itemStyle} entering={itemEntering} exiting={itemExiting}>
      <DraxView
        longPressDelay={longPressDelay}
        lockDragXPosition={lockToMainAxis && !horizontal}
        lockDragYPosition={lockToMainAxis && horizontal}
        scrollHorizontal={horizontal || undefined}
        draggable={!fixed}
        accessibilityLabel={defaultA11yLabel}
        accessibilityHint={defaultA11yHint}
        accessibilityRole="adjustable"
        {...draxViewProps}
        payload={mergedPayload}
        registration={(reg) => {
          measureFnRef.current = reg?.measure ?? null;
          // Capture the DraxView's registered ID so useAnimatedStyle can match
          // it against draggedIdSV for visibility control.
          viewIdSV.value = reg?.id ?? '';
        }}
        onDragStart={(event) => {
          // Sync in handleDragStart, after the previous drag's finalize:
          // the list is busy before this drag's first monitor update.
          dragActiveRef.current = true;
          draxViewProps.onDragStart?.(event);
        }}
        onDragEnd={(event) => {
          draxViewProps.onDragEnd?.(event);
        }}
        onDragDrop={(event) => {
          draxViewProps.onDragDrop?.(event);
        }}
        onSnapEnd={(snapData) => {
          onItemSnapEndRef.current?.();
          draxViewProps.onSnapEnd?.(snapData);
        }}
        onMeasure={(measurements) => {
          draxViewProps.onMeasure?.(measurements);
          if (itemKey && measurements) {
            // Subtract Drax shift transforms when they're included in the
            // measurement. On web: measureLayout always includes transforms.
            // On native: measureLayout ignores transforms, UNLESS DraxView
            // auto-detected transform-based positioning (LegendList) and
            // switched to measure() — flagged via _transformDetected.
            let adjX = measurements.x;
            let adjY = measurements.y;
            if (Platform.OS === 'web' || measurements._transformDetected) {
              const currentShift = shiftsJSRef.current[itemKey];
              if (currentShift) {
                adjX -= currentShift.x;
                adjY -= currentShift.y;
              }
            }
            const entry: SortableItemMeasurement = {
              x: adjX,
              y: adjY,
              width: measurements.width,
              height: measurements.height,
              key: itemKey,
              index,
              scrollAtMeasure: { ...scrollPositionJSRef.current },
            };
            itemMeasurements.current.set(itemKey, entry);
          }
        }}
      >
        {children}
      </DraxView>
    </Reanimated.View>
    </SortableItemContext>
  );
};

export const SortableItem = memo(SortableItemInner) as typeof SortableItemInner;
