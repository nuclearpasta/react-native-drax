import { memo, useLayoutEffect } from 'react';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DraxView } from './DraxView';
import { ITEM_SHIFT_ANIMATION_DURATION } from './params';
import type { DraxListItemProps, DraxViewProps } from './types';

const RenderItemComponent = <T extends unknown>({
  itemProps: {
    index,
    item,
    originalIndex,
    horizontal,
    lockItemDragsToMainAxis,
    draggedItem,
    shiftsRef,
    itemMeasurementsRef,
    prevItemMeasurementsRef,
    resetDraggedItem,
    keyExtractor,
    previousShiftsRef,
    registrationsRef,
    data,
  },
  ...draxViewProps
}: {
  itemProps: DraxListItemProps<T>;
} & DraxViewProps) => {
  const animatedValueX = useSharedValue<number>(0);
  const animatedValueY = useSharedValue<number>(0);

  const itemKey = (item && keyExtractor?.(item, index)) ?? extractItemKey(item);
  const shiftTransformStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: animatedValueX.value },
        { translateY: animatedValueY.value },
      ] as const,
    };
  });

  useAnimatedReaction(
    () => ({
      shift: shiftsRef.value[originalIndex],
      isDragged: typeof draggedItem.value === 'number',
    }),
    (current, previous) => {
      /** Apply reordering animations by shifting items between them */
      if (current.isDragged && current.shift) {
        animatedValueX.value = withTiming(current.shift.x, {
          duration: ITEM_SHIFT_ANIMATION_DURATION,
        });
        animatedValueY.value = withTiming(current.shift.y, {
          duration: ITEM_SHIFT_ANIMATION_DURATION,
        });
      } else if (previous?.isDragged && !current.isDragged) {
        /** Drag ended — immediately zero shift transforms before FlatList re-renders */
        animatedValueX.value = 0;
        animatedValueY.value = 0;
      }
    }
  );

  useLayoutEffect(() => {
    /** Reset the shift when the item moves to a new index. */
    animatedValueX.value = 0;
    animatedValueY.value = 0;
  }, [index, animatedValueX, animatedValueY]);

  useLayoutEffect(() => {
    const measurements = itemMeasurementsRef.current[originalIndex];
    const previousMeasurementsIndex = prevItemMeasurementsRef.current.findIndex(
      (m) => m?.key === itemKey
    );
    const previousMeasurements =
      prevItemMeasurementsRef.current[previousMeasurementsIndex];
    const isLayoutShifted = previousShiftsRef.value.some(
      (shift) => shift.x || shift.y
    );

    /**
     * Animate as items are added/removed from the list.
     * For newly added items, if layout is shifted, it's most probably an external drag that was dropped in the list
     * and it skips list layout animation.
     *
     * @todo implement animations even for this described scenario
     * by applying the shift offset.
     */
    if (previousMeasurements && measurements && !isLayoutShifted) {
      const offsetX = previousMeasurements.x - measurements.x;
      const offsetY = previousMeasurements.y - measurements.y;

      /** Start from previous values before the items data (order) changed */
      animatedValueX.value = offsetX;
      animatedValueY.value = offsetY;

      animatedValueX.value = withTiming(0, {
        duration: ITEM_SHIFT_ANIMATION_DURATION,
      });
      animatedValueY.value = withTiming(0, {
        duration: ITEM_SHIFT_ANIMATION_DURATION,
      });
    }
  }, [
    itemKey,
    originalIndex,
    horizontal,
    itemMeasurementsRef,
    prevItemMeasurementsRef,
    previousShiftsRef,
    animatedValueX,
    animatedValueY,
  ]);

  return (
    <Reanimated.View style={shiftTransformStyle}>
      <DraxView
        lockDragXPosition={lockItemDragsToMainAxis && !horizontal}
        lockDragYPosition={lockItemDragsToMainAxis && horizontal}
        {...draxViewProps}
        payload={{
          ...(typeof draxViewProps.payload === 'object' &&
          draxViewProps.payload !== null
            ? draxViewProps.payload
            : {}),
          index,
          originalIndex,
          item: data?.[index],
        }}
        onDragEnd={(event) => {
          draxViewProps.onDragEnd?.(event);
          resetDraggedItem();
        }}
        onDragDrop={(event) => {
          draxViewProps.onDragDrop?.(event);
          resetDraggedItem();
        }}
        onMeasure={(measurements) => {
          draxViewProps.onMeasure?.(measurements);
          if (originalIndex !== undefined && measurements) {
            /**
             * @todo 🪲 BUG
             * @platform web
             * @summary Somehow the measurements for the same item are getting duplicated.
             */
            // Clear any duplicate measurements
            const duplicateIndex = itemMeasurementsRef.current.findIndex(
              (m, idx) => idx !== originalIndex && m?.key === itemKey
            );
            if (duplicateIndex !== -1) {
              itemMeasurementsRef.current[duplicateIndex] = undefined;
            }

            // Store the new measurement
            itemMeasurementsRef.current[originalIndex] = {
              ...measurements,
              key: itemKey,
            };
          }
        }}
        registration={(registration) => {
          draxViewProps.registration?.(registration);
          if (registration && originalIndex !== undefined) {
            registrationsRef.current[originalIndex] = registration;
            registration.measure();
          }
        }}
      />
    </Reanimated.View>
  );
};

export const DraxListItem = memo(
  RenderItemComponent
) as typeof RenderItemComponent;

function extractItemKey(item: unknown): string | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  if ('key' in item) {
    const val = item.key;
    if (typeof val === 'string') return val;
  }
  if ('id' in item) {
    const val = item.id;
    if (typeof val === 'string') return val;
  }
  return undefined;
}
