import throttle from 'lodash.throttle';
import React, {
    ForwardedRef,
    forwardRef,
    PropsWithChildren,
    ReactNode,
    Ref,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { FlatList, ListRenderItem, ListRenderItemInfo, StyleSheet } from 'react-native';
import Reanimated, { useSharedValue } from 'react-native-reanimated';

import { DraxSubprovider } from './DraxSubprovider';
import { DraxView } from './DraxView';
import { useDraxScrollHandler } from './hooks/useDraxScrollHandler';
import { defaultListItemLongPressDelay } from './params';
import {
    AutoScrollDirection,
    DraxEventDraggedViewData,
    DraxListProps,
    DraxMonitorDragDropEventData,
    DraxMonitorEndEventData,
    DraxMonitorEventData,
    DraxProtocolDragEndResponse,
    DraxSnapbackTargetPreset,
    DraxViewMeasurements,
    DraxViewRegistration,
    isWithCancelledFlag,
    Position,
} from './types';

interface ListItemPayload {
    index: number;
    originalIndex: number;
}

const DraxListUnforwarded = <T extends unknown>(
    props: PropsWithChildren<DraxListProps<T>>,
    forwardedRef: ForwardedRef<Reanimated.FlatList<T>>
): ReactNode => {
    const {
        data,
        style,
        onItemDragStart,
        onItemDragPositionChange,
        onItemDragEnd,
        onItemReorder,
        reorderable: reorderableProp,
        onScroll: onScrollProp,
        lockItemDragsToMainAxis = false,
        longPressDelay = defaultListItemLongPressDelay,
        parentDraxViewProps,
        monitoringExternalDragStyle,
        ...flatListProps
    } = props;

    // Copy the value of the horizontal property for internal use.
    const horizontal = flatListProps.horizontal ?? false;

    // Get the item count for internal use.
    const itemCount = data?.length ?? 0;

    // Set a sensible default for reorderable prop.
    const reorderable = reorderableProp ?? onItemReorder !== undefined;

    // Original index of the currently dragged list item, if any.
    const draggedItem = useSharedValue<number | undefined>(undefined);

    // Auto-scrolling state.
    const scrollStateRef = useRef(AutoScrollDirection.None);

    // List item measurements, for determining shift.
    const itemMeasurementsRef = useRef<((DraxViewMeasurements & { key?: string }) | undefined)[]>([]);

    const prevItemMeasurementsRef = useRef<((DraxViewMeasurements & { key?: string }) | undefined)[]>([]);

    // Drax view registrations, for remeasuring after reorder.
    const registrationsRef = useRef<(DraxViewRegistration | undefined)[]>([]);

    // Shift offsets.
    const shiftsRef = useSharedValue<Position[]>([]);
    const previousShiftsRef = useSharedValue<Position[]>([]);

    // Maintain cache of reordered list indexes until data updates.
    const [originalIndexes, setOriginalIndexes] = useState<number[]>([]);

    // Maintain the index the item is currently dragged to.
    const draggedToIndex = useRef<number | undefined>(undefined);

    // Adjust measurements, registrations, and shift value arrays as item count changes.
    useEffect(() => {
        const itemMeasurements = itemMeasurementsRef.current;

        const registrations = registrationsRef.current;
        const shifts = shiftsRef.value;
        if (itemMeasurements.length > itemCount) {
            itemMeasurements.splice(itemCount - itemMeasurements.length);
        } else {
            while (itemMeasurements.length < itemCount) {
                itemMeasurements.push(undefined);
            }
        }

        if (registrations.length > itemCount) {
            registrations.splice(itemCount - registrations.length);
        } else {
            while (registrations.length < itemCount) {
                registrations.push(undefined);
            }
        }
        if (shifts.length > itemCount) {
            shifts.splice(itemCount - shifts.length);
        } else {
            while (shifts.length < itemCount) {
                shifts.push({ x: 0, y: 0 });
            }
        }

        shiftsRef.value = shifts;
    }, [itemCount]);

    // Clear reorders when data changes.
    useLayoutEffect(() => {
        // console.log('clear reorders');
        setOriginalIndexes(data ? [...Array(data.length).keys()] : []);
    }, [data]);

    // Handle auto-scrolling on interval.
    const doScroll = useCallback(() => {
        const containerMeasurements = containerMeasurementsRef.current;
        const contentSize = contentSizeRef.current;
        if (!flatListRef.current || !containerMeasurements || !contentSize) {
            return;
        }
        let containerLength: number;
        let contentLength: number;
        let prevOffset: number;
        if (horizontal) {
            containerLength = containerMeasurements.width;
            contentLength = contentSize.x;
            prevOffset = scrollPosition.value.x;
        } else {
            containerLength = containerMeasurements.height;
            contentLength = contentSize.y;
            prevOffset = scrollPosition.value.y;
        }
        const jumpLength = containerLength * 0.2;
        let offset: number | undefined;
        if (scrollStateRef.current === AutoScrollDirection.Forward) {
            const maxOffset = contentLength - containerLength;
            if (prevOffset < maxOffset) {
                offset = Math.min(prevOffset + jumpLength, maxOffset);
            }
        } else if (scrollStateRef.current === AutoScrollDirection.Back) {
            if (prevOffset > 0) {
                offset = Math.max(prevOffset - jumpLength, 0);
            }
        }
        if (offset !== undefined) {
            flatListRef.current.scrollToOffset({ offset });
            flatListRef.current.flashScrollIndicators();
        }
    }, [horizontal]);

    const {
        id,
        containerMeasurementsRef,
        contentSizeRef,
        onContentSizeChange,
        onMeasureContainer,
        onScroll,
        scrollRef: flatListRef,
        scrollPosition,
        setScrollRefs,
        startScroll,
        stopScroll,
    } = useDraxScrollHandler<FlatList<T>>({
        idProp: parentDraxViewProps?.id,
        onContentSizeChangeProp: props.onContentSizeChange,
        onScrollProp,
        forwardedRef,
        doScroll,
    });

    // Apply the reorder cache to the data.
    const reorderedData = useMemo(() => {
        // console.log('refresh sorted data');
        if (!id || !data) {
            return null;
        }
        if (data.length !== originalIndexes.length) {
            return data;
        }
        return originalIndexes.map(index => data[index]).filter(Boolean);
    }, [id, data, originalIndexes]);

    // Set the currently dragged list item.
    const setDraggedItem = useCallback((originalIndex: number) => {
        draggedItem.value = originalIndex;
    }, []);

    // Clear the currently dragged list item.
    const resetDraggedItem = useCallback(() => {
        draggedItem.value = undefined;
    }, []);

    // Drax view renderItem wrapper.
    const renderItem: ListRenderItem<T> = useCallback(
        (info: ListRenderItemInfo<T>) => {
            const { index, item } = info;

            const originalIndex = originalIndexes[index];
            const itemProps = {
                index,
                item,
                originalIndex,
                horizontal,
                longPressDelay,
                lockItemDragsToMainAxis,
                draggedItem,
                shiftsRef,
                itemMeasurementsRef,
                prevItemMeasurementsRef,
                resetDraggedItem,
                keyExtractor: props?.keyExtractor,
                previousShiftsRef,
                registrationsRef,
                info,
                data,
            };

            return props?.renderItem?.(info, itemProps);
        },
        [
            originalIndexes,

            resetDraggedItem,
            longPressDelay,
            lockItemDragsToMainAxis,
            horizontal,
            draggedItem,
            shiftsRef,
            itemMeasurementsRef,
            prevItemMeasurementsRef,
            previousShiftsRef,
            registrationsRef,
            props?.keyExtractor,
            data,
        ]
    );

    // Reset all shift values.
    const resetShifts = useCallback(() => {
        previousShiftsRef.value = shiftsRef.value;
        prevItemMeasurementsRef.current = [...itemMeasurementsRef.current];

        shiftsRef.value = shiftsRef.value.map(() => ({ x: 0, y: 0 }));
    }, []);

    // Update shift values in response to a drag.
    const updateShifts = useCallback(
        (
            { index: fromIndex, originalIndex: fromOriginalIndex }: ListItemPayload,
            { index: toIndex }: ListItemPayload,
            dragged: DraxEventDraggedViewData
        ) => {
            const isForward = fromIndex < toIndex;

            shiftsRef.value = originalIndexes.map(index => {
                // Don't shift the dragged item
                if (index === fromIndex) return { x: 0, y: 0 };

                // Reset shift if item is no longer in the affected range
                const shouldShift = isForward
                    ? index > fromIndex && index <= toIndex
                    : index >= toIndex && index < fromIndex;

                if (!shouldShift) return { x: 0, y: 0 };

                // Get measurements for current item and the item we're shifting to
                const currentMeasurements = itemMeasurementsRef.current[index];

                const draggedMeasurements =
                    itemMeasurementsRef.current[fromOriginalIndex] ||
                    /**  If no measurements, it must be an external dragged item */
                    dragged.data.hoverMeasurements;

                const targetIndex = isForward ? index - 1 : index + 1;
                const targetMeasurements =
                    itemMeasurementsRef.current[targetIndex] ||
                    /** If no measurements, it must be last item. Fallback to list contentSize */
                    contentSizeRef.current;

                if (!currentMeasurements || !draggedMeasurements || !targetMeasurements) {
                    return { x: 0, y: 0 };
                }

                // Calculate gaps between items in both directions
                const xGap = isForward
                    ? currentMeasurements.x - (targetMeasurements.x + targetMeasurements.width)
                    : targetMeasurements.x - (currentMeasurements.x + currentMeasurements.width);
                const yGap = isForward
                    ? currentMeasurements.y - (targetMeasurements.y + targetMeasurements.height)
                    : targetMeasurements.y - (currentMeasurements.y + currentMeasurements.height);

                // Calculated new shifts
                const x = isForward ? -(draggedMeasurements.width + xGap) : draggedMeasurements.width + xGap;
                const y = isForward ? -(draggedMeasurements.height + yGap) : draggedMeasurements.height + yGap;

                if ((props?.numColumns || 1) > 1) {
                    return { x, y };
                }

                if (horizontal) {
                    return { x, y: 0 };
                } else {
                    return { x: 0, y };
                }
            });
        },
        [originalIndexes]
    );

    // Calculate absolute position of list item for snapback.
    const calculateSnapbackTarget = useCallback(
        (
            { index: fromIndex, originalIndex: fromOriginalIndex }: ListItemPayload,
            { index: toIndex, originalIndex: toOriginalIndex }: ListItemPayload
        ) => {
            const containerMeasurements = containerMeasurementsRef.current;
            const itemMeasurements = itemMeasurementsRef.current;
            if (containerMeasurements) {
                let targetPos: Position | undefined;
                if (fromIndex < toIndex) {
                    // Target pos(toIndex + 1) - pos(fromIndex)
                    const nextIndex = toIndex + 1;
                    let nextPos: Position | undefined;
                    if (nextIndex < itemCount) {
                        // toIndex + 1 is in the list. We can measure the position of the next item.
                        const nextMeasurements = itemMeasurements[originalIndexes[nextIndex]];
                        if (nextMeasurements) {
                            nextPos = {
                                x: nextMeasurements.x,
                                y: nextMeasurements.y,
                            };
                        }
                    } else {
                        // toIndex is the last item of the list. We can use the list content size.
                        const contentSize = contentSizeRef.current;
                        if (contentSize) {
                            nextPos = horizontal ? { x: contentSize.x, y: 0 } : { x: 0, y: contentSize.y };
                        }
                    }
                    const fromMeasurements = itemMeasurements[fromOriginalIndex];
                    if (nextPos && fromMeasurements) {
                        const flattenedStyles = StyleSheet.flatten(flatListProps.contentContainerStyle) || {};

                        //@ts-ignore
                        const rowGap = flattenedStyles.rowGap ?? flattenedStyles.gap ?? 0;

                        //@ts-ignore
                        const columnGap = flattenedStyles.columnGap ?? flattenedStyles.gap ?? 0;

                        targetPos = horizontal
                            ? {
                                  x: nextPos.x - fromMeasurements.width - rowGap,
                                  y: nextPos.y,
                              }
                            : {
                                  x: nextPos.x,
                                  y: nextPos.y - fromMeasurements.height - columnGap,
                              };
                    }
                } else {
                    // Target pos(toIndex)
                    const toMeasurements = itemMeasurements[toOriginalIndex];
                    if (toMeasurements) {
                        targetPos = {
                            x: toMeasurements.x,
                            y: toMeasurements.y,
                        };
                    }
                }

                if (targetPos) {
                    return {
                        x: containerMeasurements.x - scrollPosition.value.x + targetPos.x,
                        y: containerMeasurements.y - scrollPosition.value.y + targetPos.y,
                    };
                }
            }
            return DraxSnapbackTargetPreset.None;
        },
        [horizontal, itemCount, originalIndexes]
    );

    // Stop auto-scrolling, and potentially update shifts and reorder data.
    const handleInternalDragEnd = useCallback(
        (
            eventData: DraxMonitorEventData | DraxMonitorEndEventData | DraxMonitorDragDropEventData,
            totalDragEnd: boolean
        ): DraxProtocolDragEndResponse => {
            // Always stop auto-scroll on drag end.
            scrollStateRef.current = AutoScrollDirection.None;
            stopScroll();

            const { dragged, receiver } = eventData;

            const isExternalDrag = dragged.parentId !== id || typeof dragged.payload.originalIndex !== 'number';

            // First, check if we need to shift items.
            if (reorderable) {
                const fromPayload: ListItemPayload = {
                    /**
                     * Indexing should start from zero and stop at `itemCount - 1`, but
                     * we're also handling for external drag by adding a fake item index,
                     * resulting to `itemCount`.
                     */
                    index: !isExternalDrag ? dragged.payload.index : itemCount,
                    originalIndex: !isExternalDrag ? dragged.payload.originalIndex : itemCount,
                };

                const toPayload = receiver?.parentId === id ? (receiver.payload as ListItemPayload) : undefined;

                const { index: fromIndex, originalIndex: fromOriginalIndex } = fromPayload;

                const { index: toIndex, originalIndex: toOriginalIndex } = toPayload ?? {};

                const toItem = toOriginalIndex !== undefined ? data?.[toOriginalIndex] : undefined;

                const fromItem = data?.[fromOriginalIndex] || dragged.payload;
                throttledSetIsExternalDrag(false);

                // Reset all shifts and call callback, regardless of whether toPayload exists.
                resetShifts();
                if (totalDragEnd) {
                    onItemDragEnd?.({
                        ...eventData,
                        toIndex,
                        toItem,
                        cancelled: isWithCancelledFlag(eventData) ? eventData.cancelled : false,
                        index: fromIndex,
                        item: fromItem,
                        isExternalDrag,
                    });
                }

                // Reset currently dragged over position index to undefined.
                if (draggedToIndex.current !== undefined) {
                    if (!totalDragEnd) {
                        onItemDragPositionChange?.({
                            ...eventData,
                            index: fromIndex,
                            item: fromItem,
                            toIndex: undefined,
                            previousIndex: draggedToIndex.current,
                            isExternalDrag,
                        });
                    }
                    draggedToIndex.current = undefined;
                }

                if (toPayload !== undefined) {
                    // If dragged item and received item were ours, reorder data.
                    // console.log(`moving ${fromPayload.index} -> ${toPayload.index}`);
                    const snapbackTarget = calculateSnapbackTarget(fromPayload, toPayload);
                    if (data) {
                        const newOriginalIndexes = originalIndexes.slice();
                        newOriginalIndexes.splice(toIndex!, 0, newOriginalIndexes.splice(fromIndex, 1)[0]);
                        setOriginalIndexes(newOriginalIndexes);
                        onItemReorder?.({
                            fromIndex,
                            fromItem,
                            toIndex: toIndex!,
                            toItem,
                            isExternalDrag,
                        });
                    }
                    return snapbackTarget;
                }
            }

            return undefined;
        },
        [
            id,
            data,
            stopScroll,
            reorderable,
            resetShifts,
            calculateSnapbackTarget,
            originalIndexes,
            onItemDragEnd,
            onItemDragPositionChange,
            onItemReorder,
        ]
    );

    // Monitor drag starts to handle callbacks.
    const onMonitorDragStart = useCallback(
        (eventData: DraxMonitorEventData) => {
            parentDraxViewProps?.onMonitorDragStart?.(eventData);

            const { dragged } = eventData;
            // First, check if we need to do anything.
            if (reorderable && dragged.parentId === id) {
                // One of our list items is starting to be dragged.
                const { index, originalIndex }: ListItemPayload = dragged.payload;
                setDraggedItem(originalIndex);
                onItemDragStart?.({
                    ...eventData,
                    index,
                    item: data?.[originalIndex],
                    isExternalDrag: false,
                });
            }
        },
        [id, reorderable, data, setDraggedItem, onItemDragStart]
    );

    // Monitor drags to react with item shifts and auto-scrolling.
    const onMonitorDragOver = useCallback(
        (eventData: DraxMonitorEventData) => {
            parentDraxViewProps?.onMonitorDragOver?.(eventData);

            const { dragged, receiver, monitorOffsetRatio } = eventData;

            const isExternalDrag = dragged.parentId !== id || typeof dragged.payload.originalIndex !== 'number';

            // First, check if we need to shift items.
            if (reorderable) {
                const fromPayload: ListItemPayload = {
                    /**
                     * Indexing should start from zero and stop at `itemCount - 1`, but
                     * we're also handling for external drag by adding a fake item index,
                     * resulting to `itemCount`.
                     */
                    index: !isExternalDrag ? dragged.payload.index : itemCount,
                    originalIndex: !isExternalDrag ? dragged.payload.originalIndex : itemCount,
                };

                if (typeof draggedItem.value !== 'number') {
                    /** DraxList is receiving external drag  */
                    setDraggedItem(itemCount);
                }
                monitoringExternalDragStyle && draggedItem.value === itemCount && throttledSetIsExternalDrag(true);

                const fromItem = data?.[fromPayload.originalIndex] || dragged.payload;

                // Find its current position index in the list, if any.
                const toPayload: ListItemPayload | undefined = receiver?.parentId === id ? receiver.payload : undefined;

                // Check and update currently dragged over position index.
                const toIndex = toPayload?.index;
                if (toIndex !== draggedToIndex.current) {
                    onItemDragPositionChange?.({
                        ...eventData,
                        toIndex,
                        index: fromPayload.index,
                        item: fromItem,
                        previousIndex: draggedToIndex.current,
                        isExternalDrag,
                    });
                    draggedToIndex.current = toIndex;
                }

                // Update shift transforms for items in the list.
                updateShifts(fromPayload, toPayload ?? fromPayload, dragged);
            }

            // Next, see if we need to auto-scroll.
            const ratio = horizontal ? monitorOffsetRatio.x : monitorOffsetRatio.y;
            if (ratio > 0.1 && ratio < 0.9) {
                scrollStateRef.current = AutoScrollDirection.None;
                stopScroll();
            } else {
                if (ratio >= 0.9) {
                    scrollStateRef.current = AutoScrollDirection.Forward;
                } else if (ratio <= 0.1) {
                    scrollStateRef.current = AutoScrollDirection.Back;
                }
                startScroll();
            }
        },
        [id, reorderable, data, updateShifts, horizontal, stopScroll, startScroll, onItemDragPositionChange]
    );

    // Monitor drag exits to stop scrolling, update shifts, and update draggedToIndex.
    const onMonitorDragExit = useCallback(
        (eventData: DraxMonitorEventData) => {
            handleInternalDragEnd(eventData, false);
            parentDraxViewProps?.onMonitorDragExit?.(eventData);
        },
        [handleInternalDragEnd]
    );

    /*
     * Monitor drag ends to stop scrolling, update shifts, and possibly reorder.
     * This addresses the Android case where if we drag a list item and auto-scroll
     * too far, the drag gets cancelled.
     */
    const onMonitorDragEnd = useCallback(
        (eventData: DraxMonitorEndEventData) => {
            const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
            const providedSnapTarget = parentDraxViewProps?.onMonitorDragEnd?.(eventData);
            resetDraggedItem();

            return providedSnapTarget ?? defaultSnapbackTarget;
        },
        [handleInternalDragEnd]
    );

    // Monitor drag drops to stop scrolling, update shifts, and possibly reorder.
    const onMonitorDragDrop = useCallback(
        (eventData: DraxMonitorDragDropEventData) => {
            const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
            const providedSnapTarget = parentDraxViewProps?.onMonitorDragDrop?.(eventData);
            draggedItem.value === itemCount && resetDraggedItem();

            return providedSnapTarget ?? defaultSnapbackTarget;
        },
        [handleInternalDragEnd]
    );

    const [isExternalDrag, setIsExternalDrag] = useState(false);

    const throttledSetIsExternalDrag = useMemo(
        () =>
            throttle((position: boolean) => {
                setIsExternalDrag(position);
            }, 300),
        []
    );

    return (
        <DraxView
            {...parentDraxViewProps}
            style={[parentDraxViewProps?.style, isExternalDrag && monitoringExternalDragStyle]}
            id={id}
            scrollPosition={scrollPosition}
            onMeasure={event => {
                parentDraxViewProps?.onMeasure?.(event);
                return onMeasureContainer(event);
            }}
            onMonitorDragStart={onMonitorDragStart}
            onMonitorDragOver={onMonitorDragOver}
            onMonitorDragExit={onMonitorDragExit}
            onMonitorDragEnd={onMonitorDragEnd}
            onMonitorDragDrop={onMonitorDragDrop}
        >
            <DraxSubprovider
                parent={{
                    id,
                    viewRef: {
                        current: flatListRef?.current?.getNativeScrollRef?.(),
                    },
                }}
            >
                <Reanimated.FlatList
                    {...flatListProps}
                    style={style}
                    ref={setScrollRefs}
                    renderItem={renderItem}
                    onScroll={onScroll}
                    onContentSizeChange={onContentSizeChange}
                    data={reorderedData}
                />
            </DraxSubprovider>
        </DraxView>
    );
};

/*
 * We are using a type assertion to work around the loss of our generic
 * typing when forwarding the ref. See option 1 in this article:
 * https://fettblog.eu/typescript-react-generic-forward-refs/
 */
type DraxListType = <T extends unknown>(
    props: PropsWithChildren<DraxListProps<T>> & { ref?: Ref<FlatList> }
) => ReactNode;

export const DraxList = forwardRef(DraxListUnforwarded) as DraxListType;
