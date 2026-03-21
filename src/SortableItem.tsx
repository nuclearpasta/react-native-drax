import type { ReactNode } from 'react';
import { memo, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import type { ResolvedAnimationConfig } from './params';
import { resolveAnimationConfig } from './params';
import type {
  DraxViewMeasurementHandler,
  DraxViewProps,
  Position,
  SortableItemMeasurement,
  SortableListHandle,
} from './types';

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
) {
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

    return {
      opacity: isDragged ? 0 : 1,
      transform: [
        { translateX },
        { translateY },
      ] as const,
      ...(isInactive && inactiveItemStyle ? inactiveItemStyle : {}),
    };
  });
}

export interface SortableItemProps extends DraxViewProps {
  sortable: SortableListHandle<any>;
  index: number;
  children: ReactNode;
}

const SortableItemInner = ({
  sortable,
  index,
  children,
  ...draxViewProps
}: SortableItemProps) => {
  const {
    horizontal,
    lockToMainAxis,
    longPressDelay,
    animationConfig,
    inactiveItemStyle,
    shiftsRef,
    instantClearSV,
    shiftsValidSV,
    itemMeasurements,
    keyExtractor,
    rawData,
    originalIndexes,
    scrollPosition,
    onItemSnapEnd,
  } = sortable._internal;

  // Get hoverReadySV and draggedIdSV from DraxContext (provider-level SharedValues)
  const { hoverReadySV, draggedIdSV } = useDraxContext();

  const originalIndex = originalIndexes[index] ?? index;
  const item = rawData[originalIndex];
  const itemKey = item !== undefined ? keyExtractor(item, index) : undefined;


  // Store this DraxView's registered ID in a SharedValue so useAnimatedStyle
  // can compare it with draggedIdSV on the UI thread.
  const viewIdSV = useSharedValue('');

  const measureFnRef = useRef<
    ((handler?: DraxViewMeasurementHandler) => void) | null
  >(null);

  // Resolve animation config and check reduced motion preference
  const resolvedAnimConfig = resolveAnimationConfig(animationConfig);
  const reducedMotion = useReducedMotion();

  // Delegated to isolated hook so worklet closure has no refs from this scope.
  const itemStyle = useSortableItemStyle(
    hoverReadySV, draggedIdSV, viewIdSV,
    shiftsValidSV, shiftsRef, instantClearSV, itemKey,
    resolvedAnimConfig, reducedMotion, inactiveItemStyle,
  );

  // Auto-generate accessibility props (can be overridden via draxViewProps)
  const totalItems = rawData.length;
  const defaultA11yLabel = `Item ${index + 1} of ${totalItems}`;
  const defaultA11yHint = 'Long press to drag and reorder';

  return (
    <Reanimated.View style={itemStyle}>
      <DraxView
        longPressDelay={longPressDelay}
        lockDragXPosition={lockToMainAxis && !horizontal}
        lockDragYPosition={lockToMainAxis && horizontal}
        accessibilityLabel={defaultA11yLabel}
        accessibilityHint={defaultA11yHint}
        accessibilityRole="adjustable"
        {...draxViewProps}
        payload={{
          ...(typeof draxViewProps.payload === 'object' &&
          draxViewProps.payload !== null
            ? draxViewProps.payload
            : {}),
          index,
          originalIndex,
          item,
        }}
        registration={(reg) => {
          measureFnRef.current = reg?.measure ?? null;
          // Capture the DraxView's registered ID so useAnimatedStyle can match
          // it against draggedIdSV for visibility control.
          viewIdSV.value = reg?.id ?? '';
        }}
        onDragEnd={(event) => {
          draxViewProps.onDragEnd?.(event);
        }}
        onDragDrop={(event) => {
          draxViewProps.onDragDrop?.(event);
        }}
        onSnapEnd={(snapData) => {
          onItemSnapEnd?.();
          draxViewProps.onSnapEnd?.(snapData);
        }}
        onMeasure={(measurements) => {
          draxViewProps.onMeasure?.(measurements);
          if (itemKey && measurements) {
            // On web, measureLayout returns visual positions (includes CSS
            // transforms). Subtract the current shift to recover the original
            // FlatList layout position — otherwise subsequent reorders compute
            // wrong deltas from already-shifted positions.
            let adjX = measurements.x;
            let adjY = measurements.y;
            if (Platform.OS === 'web') {
              const currentShift = shiftsRef.value[itemKey];
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
              scrollAtMeasure: { x: scrollPosition.value.x, y: scrollPosition.value.y },
            };
            itemMeasurements.current.set(itemKey, entry);
          }
        }}
      >
        {children}
      </DraxView>
    </Reanimated.View>
  );
};

export const SortableItem = memo(SortableItemInner) as typeof SortableItemInner;
