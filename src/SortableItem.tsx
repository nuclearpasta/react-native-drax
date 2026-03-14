import type { ReactNode } from 'react';
import { memo, useRef } from 'react';
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
  SortableItemMeasurement,
  SortableListHandle,
} from './types';

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

  // Hide the dragged item when hover is ready. Show it when hover disappears.
  // hoverReadySV is set to true AFTER hover content commits to DOM (HoverLayer useLayoutEffect).
  // hoverReadySV is set to false in the SAME UI-thread frame as dragPhaseSV='idle' (snap completion).
  // This eliminates both grab blink and drop blink.
  const itemStyle = useAnimatedStyle(() => {
    const isDragged = hoverReadySV.value && draggedIdSV.value === viewIdSV.value;
    // When shiftsValidSV is false, ignore all shifts. This is set
    // synchronously in useLayoutEffect when rawData changes, ensuring
    // stale shifts are never applied with new cell content (no blink).
    const valid = shiftsValidSV.value;
    const shifts = shiftsRef.value;
    const shift = valid && itemKey ? shifts[itemKey] : undefined;
    const instant = instantClearSV.value;
    const duration = instant ? 0 : ITEM_SHIFT_ANIMATION_DURATION;

    // Linear easing for smooth shift animations during drag.
    // On reorder commit, instantClearSV=true → duration 0 → instant snap.
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
          console.log('[SortableItem] onSnapEnd fired, key:', itemKey);
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
