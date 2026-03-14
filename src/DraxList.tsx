import type {
  PropsWithChildren,
  ReactNode,
  Ref,
  RefObject,
} from 'react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  ListRenderItem,
  ListRenderItemInfo,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { FlatList, StyleSheet } from 'react-native';

import Reanimated, { useSharedValue } from 'react-native-reanimated';

import { DraxSubprovider } from './DraxSubprovider';
import { DraxView } from './DraxView';
import { useDraxScrollHandler } from './hooks/useDraxScrollHandler';
import {
  defaultAutoScrollBackThreshold,
  defaultAutoScrollForwardThreshold,
  defaultAutoScrollJumpRatio,
  defaultListItemLongPressDelay,
  EXTERNAL_DRAG_THROTTLE_MS,
} from './params';
import type {
  DraxEventDraggedViewData,
  DraxListItemMeasurement,
  DraxListProps,
  DraxMonitorDragDropEventData,
  DraxMonitorEndEventData,
  DraxMonitorEventData,
  DraxProtocolDragEndResponse,
  DraxViewMeasurements,
  DraxViewRegistration,
  Position,
} from './types';
import {
  AutoScrollDirection,
  DraxSnapbackTargetPreset,
  isWithCancelledFlag,
} from './types';

interface ListItemPayload {
  index: number;
  originalIndex: number;
}

function isListItemPayload(value: unknown): value is ListItemPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'index' in value &&
    'originalIndex' in value &&
    typeof value.index === 'number' &&
    typeof value.originalIndex === 'number'
  );
}

/**
 * Build a fromPayload for internal drag operations.
 * For internal drags, uses the dragged item's index/originalIndex.
 * For external drags, uses itemCount as a sentinel value.
 */
function buildFromPayload(
  draggedPayload: ListItemPayload | undefined,
  externalDrag: boolean,
  itemCount: number
): ListItemPayload {
  return {
    index:
      draggedPayload && !externalDrag ? draggedPayload.index : itemCount,
    originalIndex:
      draggedPayload && !externalDrag
        ? draggedPayload.originalIndex
        : itemCount,
  };
}

export const DraxList = <T,>(
  props: PropsWithChildren<DraxListProps<T>> & { ref?: Ref<FlatList<T>> }
): ReactNode => {
  const {
    ref,
    data,
    style,
    onItemDragStart,
    onItemDragPositionChange,
    onItemDragEnd,
    onItemReorder,
    reorderable: reorderableProp,
    onScroll: onScrollProp,
    lockItemDragsToMainAxis = false,
    longPressDelay: _longPressDelay = defaultListItemLongPressDelay, // eslint-disable-line @typescript-eslint/no-unused-vars
    parentDraxViewProps,
    monitoringExternalDragStyle,
    renderItem: renderItemProp,
    keyExtractor,
    numColumns,
    onContentSizeChange: onContentSizeChangeProp,
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
  const itemMeasurementsRef = useRef<(DraxListItemMeasurement | undefined)[]>(
    []
  );

  const prevItemMeasurementsRef = useRef<
    (DraxListItemMeasurement | undefined)[]
  >([]);

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
  }, [itemCount, shiftsRef]);

  // Clear reorders when data changes.
  useLayoutEffect(() => {
    setOriginalIndexes(data ? [...Array(data.length).keys()] : []);
  }, [data]);

  // Handle auto-scrolling on interval (ref-based to avoid circular deps with useDraxScrollHandler).
  const doScrollRef: RefObject<() => void> = useRef(() => {});

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
    onContentSizeChangeProp,
    onScrollProp,
    externalRef: ref,
    doScroll: doScrollRef,
  });

  // Assign doScroll implementation now that we have flatListRef, measurements, etc.
  doScrollRef.current = () => {
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
    const jumpLength = containerLength * defaultAutoScrollJumpRatio;
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
  };

  // Apply the reorder cache to the data.
  const reorderedData = !id || !data
    ? null
    : data.length !== originalIndexes.length
      ? data
      : originalIndexes.map((index) => data[index]).filter(Boolean);

  // Set the currently dragged list item.
  const setDraggedItem = (originalIndex: number) => {
    draggedItem.value = originalIndex;
  };

  // Clear the currently dragged list item.
  const resetDraggedItem = () => {
    draggedItem.value = undefined;
  };

  // Ref-based originalIndexes to avoid destabilizing renderItem on every reorder.
  const originalIndexesRef = useRef(originalIndexes);
  originalIndexesRef.current = originalIndexes;

  // Drax view renderItem wrapper.
  const renderItem: ListRenderItem<T> = (info: ListRenderItemInfo<T>) => {
    const { index, item } = info;

    const originalIndex = originalIndexesRef.current[index] ?? index;
    const itemProps = {
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
      info,
      data,
    };

    return renderItemProp?.(info, itemProps);
  };

  // Reset all shift values.
  const resetShifts = () => {
    previousShiftsRef.value = shiftsRef.value;
    prevItemMeasurementsRef.current = [...itemMeasurementsRef.current];

    shiftsRef.value = shiftsRef.value.map(() => ({ x: 0, y: 0 }));
  };

  // Update shift values in response to a drag.
  const updateShifts = (
    { index: fromIndex, originalIndex: fromOriginalIndex }: ListItemPayload,
    { index: toIndex }: ListItemPayload,
    dragged: DraxEventDraggedViewData
  ) => {
    const isForward = fromIndex < toIndex;

    shiftsRef.value = originalIndexes.map((index) => {
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
        dragged.measurements;

      const targetIndex = isForward ? index - 1 : index + 1;
      const targetMeasurementsRaw = itemMeasurementsRef.current[targetIndex];
      /** If no measurements, it must be last item. Fallback to list contentSize */
      const targetMeasurements:
        | Pick<DraxViewMeasurements, 'x' | 'y' | 'width' | 'height'>
        | undefined =
        targetMeasurementsRaw ??
        (contentSizeRef.current
          ? {
              x: contentSizeRef.current.x,
              y: contentSizeRef.current.y,
              width: 0,
              height: 0,
            }
          : undefined);

      if (
        !currentMeasurements ||
        !draggedMeasurements ||
        !targetMeasurements
      ) {
        return { x: 0, y: 0 };
      }

      // Calculate gaps between items in both directions
      const xGap = isForward
        ? currentMeasurements.x -
          (targetMeasurements.x + targetMeasurements.width)
        : targetMeasurements.x -
          (currentMeasurements.x + currentMeasurements.width);
      const yGap = isForward
        ? currentMeasurements.y -
          (targetMeasurements.y + targetMeasurements.height)
        : targetMeasurements.y -
          (currentMeasurements.y + currentMeasurements.height);

      // Calculated new shifts
      const x = isForward
        ? -(draggedMeasurements.width + xGap)
        : draggedMeasurements.width + xGap;
      const y = isForward
        ? -(draggedMeasurements.height + yGap)
        : draggedMeasurements.height + yGap;

      if ((numColumns || 1) > 1) {
        return { x, y };
      }

      if (horizontal) {
        return { x, y: 0 };
      } else {
        return { x: 0, y };
      }
    });
  };

  // Calculate absolute position of list item for snapback.
  const calculateSnapbackTarget = (
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
          const nextOriginalIndex = originalIndexes[nextIndex];
          const nextMeasurements =
            nextOriginalIndex !== undefined
              ? itemMeasurements[nextOriginalIndex]
              : undefined;
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
            nextPos = horizontal
              ? { x: contentSize.x, y: 0 }
              : { x: 0, y: contentSize.y };
          }
        }
        const fromMeasurements = itemMeasurements[fromOriginalIndex];
        if (nextPos && fromMeasurements) {
          // Assertion needed: Reanimated's AnimatedStyleProps wraps style props
          // with AnimatedStyle<…>, and RemoveSharedValues only unwraps SharedValues
          // at the top level — at runtime the value is always StyleProp<ViewStyle>.
          const flattenedStyles = StyleSheet.flatten(
            flatListProps.contentContainerStyle as StyleProp<ViewStyle>
          );

          const rowGap = Number(
            flattenedStyles?.rowGap ?? flattenedStyles?.gap ?? 0
          );
          const columnGap = Number(
            flattenedStyles?.columnGap ?? flattenedStyles?.gap ?? 0
          );

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
  };

  const [isExternalDrag, setIsExternalDrag] = useState(false);
  const externalDragTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const throttledSetIsExternalDrag = (value: boolean) => {
    if (externalDragTimerRef.current) return;
    setIsExternalDrag(value);
    externalDragTimerRef.current = setTimeout(() => {
      externalDragTimerRef.current = undefined;
    }, EXTERNAL_DRAG_THROTTLE_MS);
  };

  // Stop auto-scrolling, and potentially update shifts and reorder data.
  const handleInternalDragEnd = (
    eventData:
      | DraxMonitorEventData
      | DraxMonitorEndEventData
      | DraxMonitorDragDropEventData,
    totalDragEnd: boolean
  ): DraxProtocolDragEndResponse => {
    // Always stop auto-scroll on drag end.
    scrollStateRef.current = AutoScrollDirection.None;
    stopScroll();

    const { dragged, receiver } = eventData;

    const draggedPayload = isListItemPayload(dragged.payload)
      ? dragged.payload
      : undefined;
    const externalDrag = dragged.parentId !== id || !draggedPayload;

    // First, check if we need to shift items.
    if (reorderable) {
      const fromPayload = buildFromPayload(draggedPayload, externalDrag, itemCount);

      const receiverPayload = isListItemPayload(receiver?.payload)
        ? receiver?.payload
        : undefined;
      const toPayload =
        receiver?.parentId === id ? receiverPayload : undefined;

      const { index: fromIndex, originalIndex: fromOriginalIndex } =
        fromPayload;

      const { index: toIndex, originalIndex: toOriginalIndex } =
        toPayload ?? {};

      const toItem =
        toOriginalIndex !== undefined ? data?.[toOriginalIndex] : undefined;

      const fromItem = externalDrag ? undefined : data?.[fromOriginalIndex];
      throttledSetIsExternalDrag(false);

      // Reset all shifts and call callback, regardless of whether toPayload exists.
      resetShifts();
      if (totalDragEnd) {
        onItemDragEnd?.({
          ...eventData,
          toIndex,
          toItem,
          cancelled: isWithCancelledFlag(eventData)
            ? eventData.cancelled
            : false,
          index: fromIndex,
          item: fromItem,
          isExternalDrag: externalDrag,
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
            isExternalDrag: externalDrag,
          });
        }
        draggedToIndex.current = undefined;
      }

      if (toPayload !== undefined) {
        // If dragged item and received item were ours, reorder data.
        const snapbackTarget = calculateSnapbackTarget(
          fromPayload,
          toPayload
        );
        if (data) {
          const newOriginalIndexes = originalIndexes.slice();
          const [removed] = newOriginalIndexes.splice(fromIndex, 1);
          if (removed !== undefined) {
            newOriginalIndexes.splice(toPayload.index, 0, removed);
          }
          setOriginalIndexes(newOriginalIndexes);
          onItemReorder?.({
            fromIndex,
            fromItem,
            toIndex: toPayload.index,
            toItem,
            isExternalDrag: externalDrag,
          });
        }
        return snapbackTarget;
      }
    }

    return undefined;
  };

  // Monitor drag starts to handle callbacks.
  const onMonitorDragStart = (eventData: DraxMonitorEventData) => {
    parentDraxViewProps?.onMonitorDragStart?.(eventData);

    const { dragged } = eventData;
    // First, check if we need to do anything.
    if (
      reorderable &&
      dragged.parentId === id &&
      isListItemPayload(dragged.payload)
    ) {
      // One of our list items is starting to be dragged.
      const { index, originalIndex } = dragged.payload;
      setDraggedItem(originalIndex);
      onItemDragStart?.({
        ...eventData,
        index,
        item: data?.[originalIndex],
        isExternalDrag: false,
      });
    }
  };

  // Monitor drags to react with item shifts and auto-scrolling.
  const onMonitorDragOver = (eventData: DraxMonitorEventData) => {
    parentDraxViewProps?.onMonitorDragOver?.(eventData);

    const { dragged, receiver, monitorOffsetRatio } = eventData;

    const draggedPayload = isListItemPayload(dragged.payload)
      ? dragged.payload
      : undefined;
    const externalDrag = dragged.parentId !== id || !draggedPayload;

    // First, check if we need to shift items.
    if (reorderable) {
      const fromPayload = buildFromPayload(draggedPayload, externalDrag, itemCount);

      if (typeof draggedItem.value !== 'number') {
        /** DraxList is receiving external drag  */
        setDraggedItem(itemCount);
      }
      monitoringExternalDragStyle &&
        draggedItem.value === itemCount &&
        throttledSetIsExternalDrag(true);

      const fromItem = externalDrag
        ? undefined
        : data?.[fromPayload.originalIndex];

      // Find its current position index in the list, if any.
      const receiverPayload = isListItemPayload(receiver?.payload)
        ? receiver?.payload
        : undefined;
      const toPayload: ListItemPayload | undefined =
        receiver?.parentId === id ? receiverPayload : undefined;

      // Check and update currently dragged over position index.
      const toIndex = toPayload?.index;
      if (toIndex !== draggedToIndex.current) {
        onItemDragPositionChange?.({
          ...eventData,
          toIndex,
          index: fromPayload.index,
          item: fromItem,
          previousIndex: draggedToIndex.current,
          isExternalDrag: externalDrag,
        });
        draggedToIndex.current = toIndex;
      }

      // Update shift transforms for items in the list.
      updateShifts(fromPayload, toPayload ?? fromPayload, dragged);
    }

    // Next, see if we need to auto-scroll.
    const ratio = horizontal ? monitorOffsetRatio.x : monitorOffsetRatio.y;
    if (ratio > defaultAutoScrollBackThreshold && ratio < defaultAutoScrollForwardThreshold) {
      scrollStateRef.current = AutoScrollDirection.None;
      stopScroll();
    } else {
      if (ratio >= defaultAutoScrollForwardThreshold) {
        scrollStateRef.current = AutoScrollDirection.Forward;
      } else if (ratio <= defaultAutoScrollBackThreshold) {
        scrollStateRef.current = AutoScrollDirection.Back;
      }
      startScroll();
    }
  };

  // Monitor drag exits to stop scrolling, update shifts, and update draggedToIndex.
  const onMonitorDragExit = (eventData: DraxMonitorEventData) => {
    handleInternalDragEnd(eventData, false);
    parentDraxViewProps?.onMonitorDragExit?.(eventData);
  };

  /*
   * Monitor drag ends to stop scrolling, update shifts, and possibly reorder.
   * This addresses the Android case where if we drag a list item and auto-scroll
   * too far, the drag gets cancelled.
   */
  const onMonitorDragEnd = (eventData: DraxMonitorEndEventData) => {
    const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
    const providedSnapTarget =
      parentDraxViewProps?.onMonitorDragEnd?.(eventData);
    resetDraggedItem();

    return providedSnapTarget ?? defaultSnapbackTarget;
  };

  // Monitor drag drops to stop scrolling, update shifts, and possibly reorder.
  const onMonitorDragDrop = (eventData: DraxMonitorDragDropEventData) => {
    const defaultSnapbackTarget = handleInternalDragEnd(eventData, true);
    const providedSnapTarget =
      parentDraxViewProps?.onMonitorDragDrop?.(eventData);
    draggedItem.value === itemCount && resetDraggedItem();

    return providedSnapTarget ?? defaultSnapbackTarget;
  };

  const handleMeasure = (event: DraxViewMeasurements | undefined) => {
    parentDraxViewProps?.onMeasure?.(event);
    return onMeasureContainer(event);
  };

  const listViewRef = { current: flatListRef?.current?.getNativeScrollRef?.() ?? null };
  const subproviderParent = { id, viewRef: listViewRef };

  return (
    <DraxView
      {...parentDraxViewProps}
      style={[
        parentDraxViewProps?.style,
        isExternalDrag && monitoringExternalDragStyle,
      ]}
      id={id}
      scrollPosition={scrollPosition}
      onMeasure={handleMeasure}
      onMonitorDragStart={onMonitorDragStart}
      onMonitorDragOver={onMonitorDragOver}
      onMonitorDragExit={onMonitorDragExit}
      onMonitorDragEnd={onMonitorDragEnd}
      onMonitorDragDrop={onMonitorDragDrop}
    >
      <DraxSubprovider
        parent={subproviderParent}
      >
        <Reanimated.FlatList
          {...flatListProps}
          style={style}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          ref={setScrollRefs}
          renderItem={renderItem}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          // Assertion needed: DraxListProps.data uses WithoutIndexAndOriginalIndex<T>
          // which doesn't resolve to T at the generic level, but renderItem expects T.
          data={(reorderedData ?? undefined) as ReadonlyArray<T> | undefined}
        />
      </DraxSubprovider>
    </DraxView>
  );
};
