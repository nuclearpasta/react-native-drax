import React, {
	PropsWithChildren,
	ReactElement,
	useState,
	useRef,
	useEffect,
	useCallback,
	useMemo,
	useLayoutEffect,
} from 'react';
import {
	ListRenderItemInfo,
	NativeScrollEvent,
	NativeSyntheticEvent,
	FlatList,
	Animated,
	findNodeHandle,
	StyleSheet,
} from 'react-native';

import { DraxView } from './DraxView';
import { DraxSubprovider } from './DraxSubprovider';
import { useDraxId } from './hooks';
import {
	DraxListProps,
	DraxMonitorEventData,
	AutoScrollDirection,
	Position,
	DraxViewMeasurements,
	DraxMonitorDragDropEventData,
	DraxMonitorEndEventData,
	DraxViewRegistration,
	DraxEventViewData,
	DraxProtocolDragEndResponse,
	DraxSnapbackTargetPreset,
} from './types';
import { defaultListItemLongPressDelay } from './params';

interface Shift {
	targetValue: number;
	animatedValue: Animated.Value;
}

interface ListItemPayload {
	index: number;
	originalIndex: number;
}

const defaultStyles = StyleSheet.create({
	draggingStyle: { opacity: 0 },
	dragReleasedStyle: { opacity: 0.5 },
});

export const DraxList = <T extends unknown>(
	{
		data,
		style,
		wrapperStyles,
		itemStyles,
		renderItemContent,
		renderItemHoverContent,
		onItemReorder,
		id: idProp,
		reorderable: reorderableProp,
		...props
	}: PropsWithChildren<DraxListProps<T>>,
): ReactElement | null => {
	// Copy the value of the horizontal property for internal use.
	const { horizontal = false } = props;

	// Get the item count for internal use.
	const itemCount = data?.length ?? 0;

	// Set a sensible default for reorderable prop.
	const reorderable = reorderableProp ?? (onItemReorder !== undefined);

	// The unique identifer for this list's Drax view, initialized below.
	const id = useDraxId(idProp);

	// FlatList, used for scrolling.
	const flatListRef = useRef<FlatList<T> | null>(null);

	// FlatList node handle, used for measuring children.
	const nodeHandleRef = useRef<number | null>(null);

	// Container view measurements, for scrolling by percentage.
	const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(undefined);

	// Content size, for scrolling by percentage.
	const contentSizeRef = useRef<Position | undefined>(undefined);

	// Scroll position, for Drax bounds checking and auto-scrolling.
	const scrollPositionRef = useRef<Position>({ x: 0, y: 0 });

	// Original index of the currently dragged list item, if any.
	const draggedItemRef = useRef<number | undefined>(undefined);

	// Auto-scrolling state.
	const scrollStateRef = useRef(AutoScrollDirection.None);

	// Auto-scrolling interval.
	const scrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// List item measurements, for determining shift.
	const itemMeasurementsRef = useRef<(DraxViewMeasurements | undefined)[]>([]);

	// Drax view registrations, for remeasuring after reorder.
	const registrationsRef = useRef<(DraxViewRegistration | undefined)[]>([]);

	// Shift offsets.
	const shiftsRef = useRef<Shift[]>([]);

	// Maintain cache of reordered list indexes until data updates.
	const [originalIndexes, setOriginalIndexes] = useState<number[]>([]);

	// Adjust measurements and shift value arrays as item count changes.
	useEffect(
		() => {
			const itemMeasurements = itemMeasurementsRef.current;
			const registrations = registrationsRef.current;
			const shifts = shiftsRef.current;
			if (itemMeasurements.length > itemCount) {
				itemMeasurements.splice(itemCount - itemMeasurements.length);
				registrations.splice(itemCount - registrations.length);
				shifts.splice(itemCount - shifts.length);
			} else {
				while (itemMeasurements.length < itemCount) {
					itemMeasurements.push(undefined);
					registrations.push(undefined);
					shifts.push({
						targetValue: 0,
						animatedValue: new Animated.Value(0),
					});
				}
			}
		},
		[itemCount],
	);

	// Clear reorders when data changes.
	useLayoutEffect(
		() => {
			// console.log('clear reorders');
			setOriginalIndexes(data ? [...Array(data.length).keys()] : []);
		},
		[data],
	);

	// Apply the reorder cache to the data.
	const reorderedData = useMemo(
		() => {
			// console.log('refresh sorted data');
			if (!id || data === null) {
				return null;
			}
			if (data.length !== originalIndexes.length) {
				return data;
			}
			return originalIndexes.map((index) => data[index]);
		},
		[id, data, originalIndexes],
	);

	// Get shift transform for list item at index.
	const getShiftTransform = useCallback(
		(index: number) => {
			const shift = shiftsRef.current[index]?.animatedValue ?? 0;
			return horizontal
				? [{ translateX: shift }]
				: [{ translateY: shift }];
		},
		[horizontal],
	);

	// Set the currently dragged list item.
	const setDraggedItem = useCallback(
		(originalIndex: number) => {
			draggedItemRef.current = originalIndex;
		},
		[],
	);

	// Clear the currently dragged list item.
	const resetDraggedItem = useCallback(
		() => {
			draggedItemRef.current = undefined;
		},
		[],
	);

	// Drax view renderItem wrapper.
	const renderItem = useCallback(
		(info: ListRenderItemInfo<T>) => {
			const { index } = info;
			const originalIndex = originalIndexes[index];
			const {
				style,
				draggingStyle = defaultStyles.draggingStyle,
				dragReleasedStyle = defaultStyles.dragReleasedStyle,
				...otherStyleProps
			} = itemStyles ?? {};
			return (
				<DraxView
					style={[style, { transform: getShiftTransform(originalIndex) }]}
					draggingStyle={draggingStyle}
					dragReleasedStyle={dragReleasedStyle}
					{...otherStyleProps}
					payload={{ index, originalIndex }}
					onDragStart={() => setDraggedItem(originalIndex)}
					onDragEnd={resetDraggedItem}
					onDragDrop={resetDraggedItem}
					onMeasure={(measurements) => {
						// console.log(`measuring [${index}, ${originalIndex}]: (${measurements?.x}, ${measurements?.y})`);
						itemMeasurementsRef.current[originalIndex] = measurements;
					}}
					registration={(registration) => {
						if (registration) {
							// console.log(`registering [${index}, ${originalIndex}], ${registration.id}`);
							registrationsRef.current[originalIndex] = registration;
							registration.measure();
						}
					}}
					renderContent={(props) => renderItemContent(info, props)}
					renderHoverContent={renderItemHoverContent && ((props) => renderItemHoverContent(info, props))}
					longPressDelay={defaultListItemLongPressDelay}
				/>
			);
		},
		[
			originalIndexes,
			getShiftTransform,
			setDraggedItem,
			resetDraggedItem,
			itemStyles,
			renderItemContent,
			renderItemHoverContent,
		],
	);

	// Track the size of the container view.
	const onMeasureContainer = useCallback(
		(measurements: DraxViewMeasurements | undefined) => {
			containerMeasurementsRef.current = measurements;
		},
		[],
	);

	// Track the size of the content.
	const onContentSizeChange = useCallback(
		(width: number, height: number) => {
			contentSizeRef.current = { x: width, y: height };
		},
		[],
	);

	// Set FlatList and node handle refs.
	const setFlatListRefs = useCallback(
		(ref) => {
			flatListRef.current = ref;
			nodeHandleRef.current = ref && findNodeHandle(ref);
		},
		[],
	);

	// Update tracked scroll position when list is scrolled.
	const onScroll = useCallback(
		({ nativeEvent: { contentOffset } }: NativeSyntheticEvent<NativeScrollEvent>) => {
			scrollPositionRef.current = { ...contentOffset };
		},
		[],
	);

	// Handle auto-scrolling on interval.
	const doScroll = useCallback(
		() => {
			const flatList = flatListRef.current;
			const containerMeasurements = containerMeasurementsRef.current;
			const contentSize = contentSizeRef.current;
			if (!flatList || !containerMeasurements || !contentSize) {
				return;
			}
			let containerLength: number;
			let contentLength: number;
			let prevOffset: number;
			if (horizontal) {
				containerLength = containerMeasurements.width;
				contentLength = contentSize.x;
				prevOffset = scrollPositionRef.current.x;
			} else {
				containerLength = containerMeasurements.height;
				contentLength = contentSize.y;
				prevOffset = scrollPositionRef.current.y;
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
				flatList.scrollToOffset({ offset });
				flatList.flashScrollIndicators();
			}
		},
		[horizontal],
	);

	// Start the auto-scrolling interval.
	const startScroll = useCallback(
		() => {
			if (scrollIntervalRef.current) {
				return;
			}
			doScroll();
			scrollIntervalRef.current = setInterval(doScroll, 250);
		},
		[doScroll],
	);

	// Stop the auto-scrolling interval.
	const stopScroll = useCallback(
		() => {
			if (scrollIntervalRef.current) {
				clearInterval(scrollIntervalRef.current);
				scrollIntervalRef.current = undefined;
			}
		},
		[],
	);

	// If startScroll changes, refresh our interval.
	useEffect(
		() => {
			if (scrollIntervalRef.current) {
				stopScroll();
				startScroll();
			}
		},
		[stopScroll, startScroll],
	);

	// Reset all shift values.
	const resetShifts = useCallback(
		() => {
			shiftsRef.current.forEach((shift) => {
				shift.animatedValue.setValue(0);
			});
		},
		[],
	);

	// Update shift values in response to a drag.
	const updateShifts = useCallback(
		(
			{ index: fromIndex, originalIndex: fromOriginalIndex }: ListItemPayload,
			{ index: toIndex }: ListItemPayload,
		) => {
			const { width = 50, height = 50 } = itemMeasurementsRef.current[fromOriginalIndex] ?? {};
			const offset = horizontal ? width : height;
			originalIndexes.forEach((originalIndex, index) => {
				const shift = shiftsRef.current[originalIndex];
				let newTargetValue = 0;
				if (index > fromIndex && index <= toIndex) {
					newTargetValue = -offset;
				} else if (index < fromIndex && index >= toIndex) {
					newTargetValue = offset;
				}
				if (shift.targetValue !== newTargetValue) {
					shift.targetValue = newTargetValue;
					Animated.timing(shift.animatedValue, {
						duration: 200,
						toValue: newTargetValue,
					}).start();
				}
			});
		},
		[originalIndexes, horizontal],
	);

	// Calculate absolute position of list item for snapback.
	const calculateSnapbackTarget = useCallback(
		(
			{ index: fromIndex, originalIndex: fromOriginalIndex }: ListItemPayload,
			{ index: toIndex, originalIndex: toOriginalIndex }: ListItemPayload,
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
							nextPos = { x: nextMeasurements.x, y: nextMeasurements.y };
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
						targetPos = horizontal
							? { x: nextPos.x - fromMeasurements.width, y: nextPos.y }
							: { x: nextPos.x, y: nextPos.y - fromMeasurements.height };
					}
				} else {
					// Target pos(toIndex)
					const toMeasurements = itemMeasurements[toOriginalIndex];
					if (toMeasurements) {
						targetPos = { x: toMeasurements.x, y: toMeasurements.y };
					}
				}
				if (targetPos) {
					const scrollPosition = scrollPositionRef.current;
					return {
						x: containerMeasurements.x - scrollPosition.x + targetPos.x,
						y: containerMeasurements.y - scrollPosition.y + targetPos.y,
					};
				}
			}
			return DraxSnapbackTargetPreset.None;
		},
		[horizontal, itemCount, originalIndexes],
	);

	// Stop scrolling, and potentially update shifts and reorder data.
	const handleInternalDragEnd = useCallback(
		(
			dragged?: DraxEventViewData,
			receiver?: DraxEventViewData,
		): DraxProtocolDragEndResponse => {
			// Always stop auto-scroll on drag end.
			scrollStateRef.current = AutoScrollDirection.None;
			stopScroll();

			// If the list is reorderable, handle shifts and reordering.
			if (reorderable) {
				// Determine list indexes of dragged/received items, if any.
				const fromPayload = dragged && (dragged.parentId === id)
					? (dragged.payload as ListItemPayload)
					: undefined;
				const toPayload = (fromPayload !== undefined && receiver && receiver.parentId === id)
					? (receiver.payload as ListItemPayload)
					: undefined;

				if (fromPayload !== undefined) {
					// If dragged item was ours, reset shifts.
					resetShifts();
					if (toPayload !== undefined) {
						// If dragged item and received item were ours, reorder data.
						// console.log(`moving ${fromPayload.index} -> ${toPayload.index}`);
						const snapbackTarget = calculateSnapbackTarget(fromPayload, toPayload);
						const { index: fromIndex, originalIndex: fromOriginalIndex } = fromPayload;
						const { index: toIndex, originalIndex: toOriginalIndex } = toPayload;
						if (data) {
							const newOriginalIndexes = originalIndexes.slice();
							newOriginalIndexes.splice(toIndex, 0, newOriginalIndexes.splice(fromIndex, 1)[0]);
							setOriginalIndexes(newOriginalIndexes);
							onItemReorder?.({
								fromIndex,
								toIndex,
								fromItem: data[fromOriginalIndex],
								toItem: data[toOriginalIndex],
							});
						}
						return snapbackTarget;
					}
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
			onItemReorder,
		],
	);

	// Monitor drags to react with item shifts and auto-scrolling.
	const onMonitorDragOver = useCallback(
		({ dragged, receiver, monitorOffsetRatio }: DraxMonitorEventData) => {
			// First, check if we need to shift items.
			if (reorderable && dragged.parentId === id) {
				// One of our list items is being dragged.
				const fromPayload: ListItemPayload = dragged.payload;
				// Find its current index in the list for the purpose of shifting.
				const toPayload: ListItemPayload = receiver?.parentId === id
					? receiver.payload
					: fromPayload;
				updateShifts(fromPayload, toPayload);
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
		[
			id,
			reorderable,
			updateShifts,
			horizontal,
			stopScroll,
			startScroll,
		],
	);

	// Monitor drag exits to stop scrolling and update shifts.
	const onMonitorDragExit = useCallback(
		({ dragged }: DraxMonitorEventData) => handleInternalDragEnd(dragged),
		[handleInternalDragEnd],
	);

	/*
	 * Monitor drag ends to stop scrolling, update shifts, and possibly reorder.
	 * This addresses the Android case where if we drag a list item and auto-scroll
	 * too far, the drag gets cancelled.
	 */
	const onMonitorDragEnd = useCallback(
		({ dragged, receiver }: DraxMonitorEndEventData) => handleInternalDragEnd(dragged, receiver),
		[handleInternalDragEnd],
	);

	// Monitor drag drops to stop scrolling, update shifts, and possibly reorder.
	const onMonitorDragDrop = useCallback(
		({ dragged, receiver }: DraxMonitorDragDropEventData) => handleInternalDragEnd(dragged, receiver),
		[handleInternalDragEnd],
	);

	return id ? (
		<DraxView
			id={id}
			style={wrapperStyles}
			scrollPositionRef={scrollPositionRef}
			onMeasure={onMeasureContainer}
			onMonitorDragOver={onMonitorDragOver}
			onMonitorDragExit={onMonitorDragExit}
			onMonitorDragEnd={onMonitorDragEnd}
			onMonitorDragDrop={onMonitorDragDrop}
		>
			<DraxSubprovider parent={{ id, nodeHandleRef }}>
				<FlatList
					{...props}
					style={style}
					ref={setFlatListRefs}
					renderItem={renderItem}
					onScroll={onScroll}
					onContentSizeChange={onContentSizeChange}
					data={reorderedData}
				/>
			</DraxSubprovider>
		</DraxView>
	) : null;
};
