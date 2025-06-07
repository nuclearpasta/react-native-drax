import React, { memo, useLayoutEffect } from 'react';
import { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DraxView } from './DraxView';
import { DraxListItemProps, DraxViewProps } from './types';

// const defaultStyles = StyleSheet.create({
//     draggingStyle: { opacity: 0 },
//     dragReleasedStyle: { opacity: 0.5 },
// });

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

    const itemKey = (item && keyExtractor?.(item, index)) ?? (item as any)?.key ?? (item as any)?.id;
    const shiftTransformStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: animatedValueX.value }, { translateY: animatedValueY.value }],
        };
    });

    useAnimatedReaction(
        () => shiftsRef.value[originalIndex],
        shift => {
            const isDragged = typeof draggedItem.value === 'number';
            /** Apply reordering animations by shifting items between them */
            if (isDragged) {
                animatedValueX.value = withTiming(shift.x, {
                    duration: 200,
                });
                animatedValueY.value = withTiming(shift.y, {
                    duration: 200,
                });
            }
        }
    );

    useLayoutEffect(() => {
        /** Reset the shift when the item moves to a new index. */
        animatedValueX.value = 0;
        animatedValueY.value = 0;
    }, [index]);

    useLayoutEffect(() => {
        const measurements = itemMeasurementsRef.current[originalIndex];
        const previousMeasurementsIndex = prevItemMeasurementsRef.current.findIndex(item => item?.key === itemKey);
        const previousMeasurements = prevItemMeasurementsRef.current[previousMeasurementsIndex];
        const isLayoutShifted = previousShiftsRef.value.some(item => item.x || item.y);

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
                duration: 200,
            });
            animatedValueY.value = withTiming(0, {
                duration: 200,
            });
        }
    }, [itemKey, originalIndex, horizontal, itemMeasurementsRef, prevItemMeasurementsRef, previousShiftsRef]);

    return (
        <DraxView
            lockDragXPosition={lockItemDragsToMainAxis && !horizontal}
            lockDragYPosition={lockItemDragsToMainAxis && horizontal}
            {...draxViewProps}
            style={[shiftTransformStyle, draxViewProps.style]}
            payload={{ ...draxViewProps.payload, index, originalIndex, item: data?.[index] }}
            onDragEnd={event => {
                draxViewProps.onDragEnd?.(event);
                resetDraggedItem();
            }}
            onDragDrop={event => {
                draxViewProps.onDragDrop?.(event);
                resetDraggedItem();
            }}
            onMeasure={measurements => {
                draxViewProps.onMeasure?.(measurements);
                if (originalIndex !== undefined && measurements) {
                    /**
                     * @todo 🪲 BUG
                     * @platform web
                     * @summary Somehow the measurements for the same item are getting duplicated.
                     */
                    // Clear any duplicate measurements
                    const duplicateIndex = itemMeasurementsRef.current.findIndex(
                        (item, idx) => idx !== originalIndex && item?.key === itemKey
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
            registration={registration => {
                draxViewProps.registration?.(registration);
                if (registration && originalIndex !== undefined) {
                    // console.log(`registering [${index}, ${originalIndex}], ${registration.id}`);
                    registrationsRef.current[originalIndex] = registration;
                    registration.measure();
                }
            }}
        />
    );
};

export const DraxListItem = memo(RenderItemComponent) as typeof RenderItemComponent;
