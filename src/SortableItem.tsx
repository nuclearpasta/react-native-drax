import type { ReactNode } from 'react';
import { memo, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { DraxView } from './DraxView';
import { useDraxContext } from './hooks/useDraxContext';
import { ITEM_SHIFT_ANIMATION_DURATION } from './params';
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
) {
  return useAnimatedStyle(() => {
    const isDragged = hoverReadySV.value && draggedIdSV.value === viewIdSV.value;
    const valid = shiftsValidSV.value;
    const shifts = shiftsRef.value;
    const shift = valid && itemKey ? shifts[itemKey] : undefined;
    const instant = instantClearSV.value;
    // When shifts are invalidated (data committing), snap to 0 instantly — no animation.
    // Without this, items animate from stale shifts to 0 over 200ms, causing a visible jump.
    const duration = (instant || !valid) ? 0 : ITEM_SHIFT_ANIMATION_DURATION;

    return {
      opacity: isDragged ? 0 : 1,
      transform: [
        {
          translateX: withTiming(shift?.x ?? 0, { duration, easing: Easing.linear }),
        },
        {
          translateY: withTiming(shift?.y ?? 0, { duration, easing: Easing.linear }),
        },
      ] as const,
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

  // Delegated to isolated hook so worklet closure has no refs from this scope.
  const itemStyle = useSortableItemStyle(
    hoverReadySV, draggedIdSV, viewIdSV,
    shiftsValidSV, shiftsRef, instantClearSV, itemKey,
  );

  return (
    <Reanimated.View style={itemStyle}>
      <DraxView
        longPressDelay={longPressDelay}
        lockDragXPosition={lockToMainAxis && !horizontal}
        lockDragYPosition={lockToMainAxis && horizontal}
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
            const entry: SortableItemMeasurement = {
              ...measurements,
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
