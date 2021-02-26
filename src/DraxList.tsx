import React, {
	PropsWithChildren,
	ReactElement,
	useState,
	useRef,
	useEffect,
	useCallback,
	useMemo,
	useLayoutEffect,
} from "react";
import {
	ListRenderItemInfo,
	NativeScrollEvent,
	NativeSyntheticEvent,
	FlatList,
	Animated,
	findNodeHandle,
	StyleSheet,
	LayoutAnimation,
	View,
} from "react-native";

import { DraxView } from "./DraxView";
import { DraxSubprovider } from "./DraxSubprovider";
import { useDraxContext, useDraxId } from "./hooks";
import {
	DraxListProps,
	DraxMonitorEventData,
	AutoScrollDirection,
	Position,
	DraxViewMeasurements,
	DraxMonitorDragDropEventData,
	DraxMonitorEndEventData,
	DraxViewRegistration,
	DraxProtocolDragEndResponse,
	DraxSnapbackTargetPreset,
	isWithCancelledFlag,
} from "./types";
import { defaultListItemLongPressDelay } from "./params";

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
	dragReleasedStyle: { opacity: 0 },
});

export const DraxList = <T extends unknown>({
	data,
	style,
	itemStyles,
	renderItemContent,
	renderItemHoverContent,
	onItemDragStart,
	onItemDragPositionChange,
	onItemDragEnd,
	onItemReorder,
	id: idProp,
	reorderable: reorderableProp,
	onChangeList,
	dummyItem,
	...props
}: PropsWithChildren<DraxListProps<T>>): ReactElement | null => {
	/************ Props, State, Refs & Data /*************/
	// Copy the value of the horizontal property for internal use.
	const { horizontal = false } = props;
	// grab context for snapback in a nested list
	const { parent: contextParent, getTrackingDragged } = useDraxContext();
	// Whether or not to visibly show the dummy item (only want to show on hover from alien tile)
	const [showDummy, setShowDummy] = useState(false);
	// Set a sensible default for reorderable prop.
	const reorderable = reorderableProp ?? onItemReorder !== undefined;
	// The unique identifer for this list's Drax view.
	const id = useDraxId(idProp);
	// FlatList, used for scrolling.
	const flatListRef = useRef<FlatList<T> | null>(null);
	// FlatList node handle, used for measuring children.
	const nodeHandleRef = useRef<number | null>(null);
	// Container view measurements, for scrolling by percentage.
	const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
		undefined
	);
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
	const itemMeasurementsRef = useRef<(DraxViewMeasurements | undefined)[]>(
		[]
	);
	// Drax view registrations, for remeasuring after reorder.
	const registrationsRef = useRef<(DraxViewRegistration | undefined)[]>([]);
	// Shift offsets.
	const shiftsRef = useRef<Shift[]>([]);
	// Maintain cache of reordered list indexes until data updates.
	const [originalIndexes, setOriginalIndexes] = useState<number[]>([]);
	// Maintain the index the item is currently dragged to.
	const draggedToIndex = useRef<number | undefined>(undefined);
	// Maintain the dimensions of the last dragged item from another DraxList.
	// initial dimensions must be supplied for useMemo to initially work - we set w/ help of initialRender
	const dummyItemDimensions = useRef();
	const initialRender = useRef(true);

	// if dummyItem prop is true, then append an object to our data array
	const dataUpdated = useMemo(() => {
		dummyItem ? [...data, { id: 100000 }] : data;
	}, [data, dummyItem]);

	// Get the item count for internal use.
	const itemCount = dataUpdated?.length ?? 0;

	/************ EFFECTS /*************/
	// Adjust measurements, registrations, and shift value arrays as item count changes.
	useEffect(() => {
		// if # of items have changed, setShowDummy false (covers reset on success cases)
		setShowDummy(false);
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
	}, [itemCount]);

	// update the dummyItemDimensions ref upon receiving a drag of a DraxView belonging to another DraxList
	useEffect(() => {
		// grab the currently dragged item in the entire system from context
		const draggedItem = getTrackingDragged();
		const draggedItemMeasurements = draggedItem?.data.absoluteMeasurements;
		// this way, our value won't become undefined the moment a DraxView is released from drag. gets us dimensions of last dragged DraxView.
		if (draggedItemMeasurements) {
			// console.log('dummy item dimensions updated', draggedItemMeasurements)
			dummyItemDimensions.current = draggedItemMeasurements;
			// if initial render, then set it to false, which triggers renderDummyItem immediately
			if (initialRender.current) {
				initialRender.current = false;
			}
		}
	}, [showDummy, data]);

	// reset shifts on change to data
	useEffect(() => {
		resetShifts();
	}, [data]);

	// Clear reorders when data changes.
	useLayoutEffect(() => {
		// console.log('clear reorders');
		setOriginalIndexes(
			dataUpdated ? [...Array(dataUpdated.length).keys()] : []
		);
	}, [data]);

	// Apply the reorder cache to the data.
	const reorderedData = useMemo(() => {
		// console.log('refresh sorted data');
		if (!id || !dataUpdated) {
			return null;
		}
		if (dataUpdated.length !== originalIndexes.length) {
			return dataUpdated;
		}
		return originalIndexes.map((index) => dataUpdated[index]);
	}, [id, data, originalIndexes]);

	// Get shift transform for list item at index.
	const getShiftTransform = useCallback(
		(index: number) => {
			const shift = shiftsRef.current[index]?.animatedValue ?? 0;
			return horizontal
				? [{ translateX: shift }]
				: [{ translateY: shift }];
		},
		[horizontal]
	);

	// Set the currently dragged list item.
	const setDraggedItem = useCallback((originalIndex: number) => {
		draggedItemRef.current = originalIndex;
	}, []);

	// Clear the currently dragged list item.
	const resetDraggedItem = useCallback(() => {
		draggedItemRef.current = undefined;
	}, []);

	const shiftBeforeListShrinks = useCallback(
		(childIndex) => {
			if (childIndex >= 0) {
				const scrollPosition = horizontal
					? scrollPositionRef.current.x
					: scrollPositionRef.current.y;

				const contentLength = horizontal
					? contentSizeRef.current.x
					: contentSizeRef.current.y;
				const containerLength = horizontal
					? containerMeasurementsRef.current.width
					: containerMeasurementsRef.current.height;
				const itemSizes = itemMeasurementsRef.current;

				originalIndexes.forEach((originalIndex, index) => {
					const shift = shiftsRef.current[originalIndex];

					const itemLength = horizontal
						? itemSizes[originalIndex].width
						: itemSizes[originalIndex].height;
					// console.log('itemLength:', itemLength)
					let newTargetValue = 0;

					// where scrollPosition is 0
					if (scrollPosition === 0) {
						// console.log('case 1')
						if (index > childIndex) {
							newTargetValue = -itemLength;
						}
					}
					// else: scrollPosition > 0
					else {
						// console.log('scrollPosition:', scrollPosition)
						// console.log('case 2')

						// if the sum of lengths of all items is > one screen, maintain scrollPosition, shifting items after selected left/up
						// if sum of lengths of all items is < one screen, shift both before & after

						// where 0 < scrollPosition < itemLength
						if (scrollPosition < itemLength) {
							// console.log('case 2a')

							if (
								contentLength - itemLength - scrollPosition >
								containerLength
							) {
								// this case always applies when we have 5 items left, sometimes when 4 items left
								// console.log('case 2a-i')
								// maintain scrollPosition
								if (index > childIndex) {
									newTargetValue = -itemLength;
								}
							} else if (
								contentLength - itemLength <=
								containerLength
							) {
								// console.log('case 2a-ii')
								// this case always applies when we have 3 visible items left
								// if right of chosen tile, move left
								if (index > childIndex) {
									newTargetValue =
										-itemLength + scrollPosition;
								}
								// if left of chosen tile, move right
								if (index < childIndex) {
									newTargetValue = scrollPosition;
								}
							} else {
								// console.log('case 2a-iii')
								// this case sometimes applies when we have 4 items left, depending on scrollPosition >= 65
								// contentLength - itemLength - scrollPosition < containerLength, while contentLength - itemLength > containerLength
								if (index > childIndex) {
									newTargetValue =
										-itemLength +
										(scrollPosition -
											(contentLength -
												itemLength -
												containerLength));
								}
								if (index < childIndex) {
									newTargetValue =
										scrollPosition -
										(contentLength -
											itemLength -
											containerLength);
								}
							}
						}

						// where scrollPosition > itemLength
						// this is only possible if contentLength - containerLength > itemLength
						else {
							// console.log('case 3')
							const childLength = horizontal
								? itemSizes[childIndex].width
								: itemSizes[childIndex].height;
							const lastItemPosition =
								itemSizes[itemCount - 1 - dummyItem].x;

							// if we can see the last item (scrollPosition + containerLength > lastItemPosition), dual shift
							if (
								scrollPosition + containerLength >
								lastItemPosition
							) {
								// must offset childLength
								// nextScroll will be at 700 - 140 - 355 (205)
								// console.log('case 3a')
								const nextScrollPosition =
									contentLength -
									childLength -
									containerLength;
								const scrollDiff =
									scrollPosition - nextScrollPosition;
								const rightListShift = -(
									childLength - scrollDiff
								);
								const leftListShift = scrollDiff;
								if (index > childIndex) {
									newTargetValue = rightListShift;
								}
								if (index < childIndex) {
									newTargetValue = leftListShift;
								}
							} else {
								// move right list left
								// console.log('case 3b')
								if (index > childIndex) {
									newTargetValue = -childLength;
								}
							}
						}
					}

					if (shift.targetValue !== newTargetValue) {
						shift.targetValue = newTargetValue;
						Animated.timing(shift.animatedValue, {
							duration: 300,
							toValue: newTargetValue,
							useNativeDriver: true,
						}).start();
					}
				});
			}
		},
		[
			originalIndexes,
			scrollPositionRef,
			contentSizeRef,
			containerMeasurementsRef,
			itemMeasurementsRef,
			shiftsRef,
		]
	);

	// animation to hideDummy smoothly. triggered when item enters this list and then exits.
	const hideDummy = useCallback(() => {
		const animation = LayoutAnimation.create(
			250,
			LayoutAnimation.Types.easeInEaseOut,
			LayoutAnimation.Properties.opacity
		);
		LayoutAnimation.configureNext(animation);
		setShowDummy(false);
	}, []);

	const handleDragEnd = useCallback(() => {
		// console.log('resetting interval id', contextParent.containerAutoScrollId)
		// if user's finger left vertical scrollview, we must clearInterval here onDragEnd
		if (contextParent.containerAutoScrollId) {
			clearInterval(contextParent.containerAutoScrollId);
		}
		resetDraggedItem();
	}, [contextParent.containerAutoScrollId]);

	const handleDragDrop = useCallback(
		(eventData, index) => {
			// onMonitorDrop: same list => calls resetShifts immediately, diff list => calls resetShifts only once toList's animation finishes
			// thus, shiftBeforeListShrinks only has effect on btw list move, executing while toList is animating
			// first, check if user's finger is within vertical ScrollView
			if (contextParent.dragExitedContainer) {
				return; // if not, then not a valid drop
			}
			// if this item is dropped into same parent, no work necessary
			if (eventData.dragged.parentId === eventData.receiver.parentId) {
				return;
			}

			shiftBeforeListShrinks(index);
			resetDraggedItem();
		},
		[contextParent.dragExitedContainer, shiftBeforeListShrinks]
	);

	// depends on whether list is horizontal or vertical
	const renderDummyItem = useMemo(() => {
		const containerLength = horizontal
			? containerMeasurementsRef.current?.width
			: containerMeasurementsRef.current?.height;
		const contentLength = horizontal
			? contentSizeRef.current?.x
			: contentSizeRef.current?.y;
		const secondaryDimension = horizontal
			? contentSizeRef.current?.y
			: contentSizeRef.current?.x;

		const itemLength = horizontal
			? dummyItemDimensions.current?.width
			: dummyItemDimensions.current?.height;

		//#region
		// dummyItem's length should be a minimum of dragged item's length, & maximum of containerLength
		// if no other items, then dummyItem should fill entire device length, so dragging an item from elsewhere
		// into this day is guaranteed to work. ditto for one item, should fill up rest of length.
		////#endregion
		let length;
		if (itemCount - 1 > 0) {
			length = Math.max(containerLength - contentLength, itemLength ?? 0);
		} else {
			length = containerLength;
		}

		const primaryDimension = showDummy ? length : 0;
		const style = horizontal
			? { height: secondaryDimension, width: primaryDimension }
			: { height: primaryDimension, width: secondaryDimension };
		// console.log('id', id, 'dummyLength:', length)
		return <View style={style}></View>;
	}, [
		itemCount,
		showDummy,
		containerMeasurementsRef,
		contentSizeRef,
		dummyItemDimensions,
		initialRender.current, // usually don't want to use a ref.current, but necessary for first init of dragged item length
	]);

	const renderItem = useCallback(
		(info: ListRenderItemInfo<T>) => {
			const { index } = info;
			const originalIndex = originalIndexes[index];
			const dummy = dummyItem && index === itemCount - 1;
			const {
				style: itemStyle,
				draggingStyle = defaultStyles.draggingStyle,
				dragReleasedStyle = defaultStyles.dragReleasedStyle,
				...otherStyleProps
			} = itemStyles ?? {};
			return (
				<DraxView
					style={[
						itemStyle,
						{ transform: getShiftTransform(originalIndex) },
					]}
					draggable={!dummy}
					draggingStyle={draggingStyle}
					dragReleasedStyle={dragReleasedStyle}
					{...otherStyleProps}
					payload={{ index, originalIndex }}
					onDragEnd={handleDragEnd}
					onDragDrop={(eventData) =>
						handleDragDrop(eventData, originalIndex)
					}
					onMeasure={(measurements) => {
						// console.log(`measuring [${index}, ${originalIndex}]: (${measurements?.x}, ${measurements?.y})`);
						itemMeasurementsRef.current[
							originalIndex
						] = measurements;
					}}
					registration={(registration) => {
						if (registration) {
							// console.log(`registering [${index}, ${originalIndex}], ${registration.id}`);
							registrationsRef.current[
								originalIndex
							] = registration;
							registration.measure();
						}
					}}
					renderContent={(contentProps) =>
						dummy
							? renderDummyItem
							: renderItemContent(info, contentProps)
					}
					renderHoverContent={
						renderItemHoverContent &&
						((hoverContentProps) =>
							renderItemHoverContent(info, hoverContentProps))
					}
					longPressDelay={defaultListItemLongPressDelay}
				/>
			);
		},
		[
			originalIndexes,
			getShiftTransform,
			resetDraggedItem,
			itemStyles,
			renderItemContent,
			renderItemHoverContent,
			dummyItem,
			itemCount,
			handleDragEnd,
			handleDragDrop,
			renderDummyItem,
		]
	);

	// Track the size of the container view.
	const onMeasureContainer = useCallback(
		(measurements: DraxViewMeasurements | undefined) => {
			containerMeasurementsRef.current = measurements;
		},
		[]
	);

	// Track the size of the content.
	const onContentSizeChange = useCallback((width: number, height: number) => {
		contentSizeRef.current = { x: width, y: height };
	}, []);

	// Set FlatList and node handle refs.
	const setFlatListRefs = useCallback((ref) => {
		flatListRef.current = ref;
		nodeHandleRef.current = ref && findNodeHandle(ref);
	}, []);

	// Update tracked scroll position when list is scrolled.
	const onScroll = useCallback(
		({
			nativeEvent: { contentOffset },
		}: NativeSyntheticEvent<NativeScrollEvent>) => {
			scrollPositionRef.current = { ...contentOffset };
		},
		[]
	);

	// Handle auto-scrolling on interval.
	const doScroll = useCallback(() => {
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
	}, [horizontal]);

	// Start the auto-scrolling interval.
	const startScroll = useCallback(() => {
		if (scrollIntervalRef.current) {
			return;
		}
		doScroll();
		scrollIntervalRef.current = setInterval(doScroll, 250);
	}, [doScroll]);

	// Stop the auto-scrolling interval.
	const stopScroll = useCallback(() => {
		if (scrollIntervalRef.current) {
			clearInterval(scrollIntervalRef.current);
			scrollIntervalRef.current = undefined;
		}
	}, []);

	// If startScroll changes, refresh our interval.
	useEffect(() => {
		if (scrollIntervalRef.current) {
			stopScroll();
			startScroll();
		}
	}, [stopScroll, startScroll]);

	// Reset all shift values.
	const resetShifts = useCallback((delay: number) => {
		shiftsRef.current.forEach((shift) => {
			// eslint-disable-next-line no-param-reassign
			shift.targetValue = 0;
			if (!delay) {
				shift.animatedValue.setValue(shift.targetValue);
			} else {
				Animated.timing(shift.animatedValue, {
					duration: delay,
					toValue: shift.targetValue,
					useNativeDriver: true,
				}).start();
			}
		});
	}, []);

	// Update shift values in response to a drag.
	const updateShifts = useCallback(
		(draggedInfo, receiverPayload) => {
			const {
				draggedPayload,
				draggedParentId,
				width = 140,
				height = 90,
			} = draggedInfo;
			const fromIndex = draggedPayload?.index;
			const toIndex = receiverPayload?.index;

			const offset = horizontal ? width : height;

			originalIndexes.forEach((originalIndex, index) => {
				const shift = shiftsRef.current[originalIndex];
				let newTargetValue = 0;
				// dragged item from other list
				if (draggedParentId !== id) {
					// if receiverPayload defined, move ToList's items right of receiving index rightwards
					if (receiverPayload && index >= toIndex) {
						newTargetValue = offset;
					}
				}
				// dragged item belongs to this list
				else {
					// items between dragged and received index should shift leftwards
					if (index > fromIndex && index <= toIndex) {
						newTargetValue = -offset;
					}
					// items between received index and dragged should shift rightwards
					else if (index < fromIndex && index >= toIndex) {
						newTargetValue = offset;
					}
				}
				if (shift.targetValue !== newTargetValue) {
					shift.targetValue = newTargetValue;
					Animated.timing(shift.animatedValue, {
						duration: 200,
						toValue: newTargetValue,
						useNativeDriver: true,
					}).start();
				}
			});
		},
		[originalIndexes, horizontal]
	);

	// Calculate absolute position of list item for snapback. TODO
	const calculateSnapbackTarget = useCallback(
		(draggedInfo, receiverPayload) => {
			const { draggedPayload, draggedParentId } = draggedInfo;

			const {
				index: fromIndex,
				originalIndex: fromOriginalIndex,
			} = draggedPayload;
			const toIndex = receiverPayload?.index;
			const toOriginalIndex = receiverPayload.originalIndex;

			const containerMeasurements = containerMeasurementsRef.current;
			const itemMeasurements = itemMeasurementsRef.current;

			if (containerMeasurements) {
				let targetPos: Position | undefined;

				if (draggedParentId === id && fromIndex < toIndex) {
					// Target pos(toIndex + 1) - pos(fromIndex)
					const nextIndex = toIndex + 1;
					let nextPos: Position | undefined;
					if (nextIndex < itemCount) {
						// toIndex + 1 is in the list. We can measure the position of the next item.
						const nextMeasurements =
							itemMeasurements[originalIndexes[nextIndex]];
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
					const fromMeasurements =
						itemMeasurements[fromOriginalIndex];
					if (nextPos && fromMeasurements) {
						targetPos = horizontal
							? {
									x: nextPos.x - fromMeasurements.width,
									y: nextPos.y,
							  }
							: {
									x: nextPos.x,
									y: nextPos.y - fromMeasurements.height,
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
					const scrollPosition = scrollPositionRef.current;
					// console.log('scroll position x: ', scrollPosition.x)
					// console.log('scroll position y: ', scrollPosition.y)
					// if this DraxList is within another scroll, then we need that scroll's position too.
					const {
						containerScrollPosition: { x, y },
					} = contextParent;
					// console.log('parent scroll position y:', y)
					return {
						x:
							containerMeasurements.x -
							scrollPosition.x -
							x +
							targetPos.x,
						y:
							containerMeasurements.y -
							scrollPosition.y -
							y +
							targetPos.y,
					};
				}
			}
			return DraxSnapbackTargetPreset.None;
		},
		[horizontal, itemCount, originalIndexes]
	);

	// Stop auto-scrolling, and potentially update shifts and reorder data. TODO
	const handleInternalDragEnd = useCallback(
		(
			eventData:
				| DraxMonitorEventData
				| DraxMonitorEndEventData
				| DraxMonitorDragDropEventData,
			totalDragEnd: boolean
		): DraxProtocolDragEndResponse => {
			// Always stop auto-scroll on drag end.
			scrollStateRef.current = AutoScrollDirection.None;
			stopScroll();

			const { dragged, receiver, draggedDimensions } = eventData;

			// first, check if user's finger exited vertical ScrollView. If it has, then this is not a valid drop.
			if (contextParent.exitedVerticalScroll) {
				setShowDummy(false);
				resetShifts(200);
				return undefined;
			}

			// if dragged item comes from other parent
			if (reorderable && dragged.parentId !== id) {
				draggedToIndex.current = undefined;
				if (receiver && totalDragEnd) {
					// prepare argument object
					const draggedInfo = {
						draggedPayload: dragged.payload,
						draggedParentId: dragged.parentId,
						...draggedDimensions,
					};
					// if user swipes an item into the list without hovering over, ensure shift occurs:
					if (
						shiftsRef.current[receiver.payload.index]
							.targetValue === 0
					) {
						updateShifts(draggedInfo, receiver?.payload);
					}
					// compute target to snap back to
					const snapbackTarget = calculateSnapbackTarget(
						draggedInfo,
						receiver.payload
					);

					if (dataUpdated) {
						const newOriginalIndexes = originalIndexes.slice();
						newOriginalIndexes.splice(receiver.payload.index, 0);
						setOriginalIndexes(newOriginalIndexes);
					}

					// return value is supplied to context method resetDrag, which animates tile to target
					// & calls callback once animation completes (which updates state)
					return {
						target: snapbackTarget,
						callback: () => {
							resetShifts(); // don't want to reset shifts until after snapback animation completes
							onChangeList(
								dragged.payload.originalIndex,
								receiver.payload.originalIndex,
								dragged.parentId,
								id
							);
						},
					};
				} else {
					// either receiver is undefined or totalDragEnd is false
					// if drag belongs to another parent & leaves this DraxList, simply resetShifts(200)
					hideDummy(); // hides our dummy item, since we only want to show when its being hovered over
					resetShifts(200);
				}
			}

			// if dragged item comes from this list's parent
			if (reorderable && dragged.parentId === id) {
				// Determine list indexes of dragged/received items, if any.
				const fromPayload = dragged.payload as ListItemPayload;
				const toPayload =
					receiver?.parentId === id
						? (receiver.payload as ListItemPayload)
						: undefined;

				const {
					index: fromIndex,
					originalIndex: fromOriginalIndex,
				} = fromPayload;
				const { index: toIndex, originalIndex: toOriginalIndex } =
					toPayload ?? {};
				const toItem =
					toOriginalIndex !== undefined
						? dataUpdated?.[toOriginalIndex]
						: undefined;

				// if toIndex is the lastItem in list, which is dummyItem, then return tile to 2nd to last position
				// allows user to drag to end of list and not overshoot container
				if (dummyItem && toOriginalIndex === itemCount - 1) {
					resetShifts();
					// prepare argument object
					const draggedInfo = {
						draggedPayload: dragged.payload,
						draggedParentId: dragged.parentId,
						...draggedDimensions,
					};
					const snapbackTarget = calculateSnapbackTarget(
						draggedInfo,
						{
							index: toIndex - 1,
							originalIndex: toOriginalIndex - 1,
						}
					);
					if (dataUpdated) {
						const newOriginalIndexes = originalIndexes.slice();
						newOriginalIndexes.splice(
							toIndex - 1,
							0,
							newOriginalIndexes.splice(fromIndex, 1)[0]
						);
						setOriginalIndexes(newOriginalIndexes);
						onItemReorder?.({
							fromIndex,
							fromItem: dataUpdated[fromOriginalIndex],
							toIndex: toIndex - 1,
							toItem: dataUpdated[toOriginalIndex - 1],
						});
					}
					return { target: snapbackTarget };
				}

				if (totalDragEnd) {
					onItemDragEnd?.({
						...eventData,
						toIndex,
						toItem,
						cancelled: isWithCancelledFlag(eventData)
							? eventData.cancelled
							: false,
						index: fromIndex,
						item: dataUpdated?.[fromOriginalIndex],
					});
				}

				// Reset currently dragged over position index to undefined.
				if (draggedToIndex.current !== undefined) {
					if (!totalDragEnd) {
						onItemDragPositionChange?.({
							...eventData,
							index: fromIndex,
							item: dataUpdated?.[fromOriginalIndex],
							toIndex: undefined,
							previousIndex: draggedToIndex.current,
						});
					}
					draggedToIndex.current = undefined;
				}

				// if drag is existing member of this list, and it's receiver is defined, then:
				if (toPayload !== undefined) {
					// prepare argument object
					const draggedInfo = {
						draggedPayload: dragged.payload,
						draggedParentId: dragged.parentId,
						...draggedDimensions,
					};
					const snapbackTarget = calculateSnapbackTarget(
						draggedInfo,
						toPayload
					);
					if (dataUpdated) {
						const newOriginalIndexes = originalIndexes.slice();
						newOriginalIndexes.splice(
							toIndex!,
							0,
							newOriginalIndexes.splice(fromIndex, 1)[0]
						);
						// console.log('SET ORIGINAL INDEXES!')
						setOriginalIndexes(newOriginalIndexes);
						onItemReorder?.({
							fromIndex,
							fromItem: dataUpdated[fromOriginalIndex],
							toIndex: toIndex!,
							toItem: dataUpdated[toOriginalIndex!],
						});
					}
					return { target: snapbackTarget };
				} else {
					// dragged.parentId === id && toPayload is undefined
					// either tile is being dragged out of parent (TDE=false) or dropped back into parent (TDE=true)
					if (!totalDragEnd) {
						// console.log('DraxView left this monitor, id:', id)
						resetShifts(200);
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
			onItemDragEnd,
			onItemDragPositionChange,
			onItemReorder,
			onChangeList,
			contextParent.dragExitedContainer,
		]
	);

	// Monitor drag starts to handle callbacks.
	const onMonitorDragStart = useCallback(
		(eventData: DraxMonitorEventData) => {
			// console.log('\n', 'onMonitorDragStart id:', id, '\n')
			const { dragged } = eventData;
			// First, check if we need to do anything.
			if (reorderable && dragged.parentId === id) {
				// One of our list items is starting to be dragged.
				const {
					index,
					originalIndex,
				}: ListItemPayload = dragged.payload;
				setDraggedItem(originalIndex);
				onItemDragStart?.({
					...eventData,
					index,
					item: dataUpdated?.[originalIndex],
				});
			}
		},
		[id, reorderable, data, setDraggedItem, onItemDragStart]
	);

	// Monitor drags to react with item shifts and auto-scrolling.
	const onMonitorDragOver = useCallback(
		(eventData: DraxMonitorEventData) => {
			const {
				dragged,
				receiver,
				monitorOffsetRatio,
				draggedDimensions,
			} = eventData;
			//#region
			/*
			console.log(
				"dragged parent id: ",
				dragged.parentId,
				"index: ",
				dragged.payload.index
			);
			console.log(
				"receiver parent id: ",
				id,
				"index: ",
				receiver ? receiver.payload.index : "UNDEFINED"
			);
			*/
			//#endregion

			// if dragged item comes from other parent
			if (reorderable && dragged.parentId !== id) {
				const draggedInfo = {
					draggedPayload: dragged.payload,
					draggedParentId: dragged.parentId,
					...draggedDimensions,
				};
				updateShifts(draggedInfo, receiver?.payload);
			}

			// if dragged item comes from this list's parent
			if (reorderable && dragged.parentId === id) {
				// One of our list items is being dragged.
				const fromPayload: ListItemPayload = dragged.payload;

				// Find its current position index in the list, if any.
				const toPayload: ListItemPayload | undefined =
					receiver?.parentId === id ? receiver.payload : undefined;

				// Check and update currently dragged over position index.
				const toIndex = toPayload?.index;
				if (toIndex !== draggedToIndex.current) {
					onItemDragPositionChange?.({
						...eventData,
						toIndex,
						index: fromPayload.index,
						item: dataUpdated?.[fromPayload.originalIndex],
						previousIndex: draggedToIndex.current,
					});
					draggedToIndex.current = toIndex;
				}
				const draggedInfo = {
					draggedPayload: fromPayload,
					draggedParentId: dragged.parentId,
					...draggedDimensions,
				};
				// Update shift transforms for items in the list.
				updateShifts(draggedInfo, toPayload ?? fromPayload);
			}

			// Next, see if we need to auto-scroll.
			const ratio = horizontal
				? monitorOffsetRatio.x
				: monitorOffsetRatio.y;
			if (
				(ratio > 0.1 && ratio < 0.9) ||
				(ratio > 0.06 &&
					ratio < 0.94 &&
					dummyItem &&
					receiver?.payload?.index === itemCount - 1)
			) {
				scrollStateRef.current = AutoScrollDirection.None;
				stopScroll();
			} else {
				if (
					ratio >= 0.94 ||
					(ratio >= 0.9 &&
						(!dummyItem ||
							(dummyItem &&
								receiver?.payload?.index !== itemCount - 1)))
				) {
					scrollStateRef.current = AutoScrollDirection.Forward;
				} else if (
					ratio <= 0.06 ||
					(ratio <= 0.1 &&
						(!dummyItem ||
							(dummyItem &&
								receiver?.payload?.index !== itemCount - 1)))
				) {
					scrollStateRef.current = AutoScrollDirection.Back;
				}
				startScroll();
			}
		},
		[
			id,
			reorderable,
			data,
			updateShifts,
			horizontal,
			stopScroll,
			startScroll,
			onItemDragPositionChange,
			dummyItem,
		]
	);

	// Monitor drag exits to stop scrolling, update shifts, and update draggedToIndex.
	const onMonitorDragExit = useCallback(
		(eventData: DraxMonitorEventData) => {
			// console.log('\n', 'onMonitorDragExit: id', id, '\n')
			return handleInternalDragEnd(eventData, false);
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
			// console.log('\n', 'onMonitorDragEnd id:', id, '\n')
			return handleInternalDragEnd(eventData, true);
		},
		[handleInternalDragEnd]
	);

	// Monitor drag drops to stop scrolling, update shifts, and possibly reorder.
	const onMonitorDragDrop = useCallback(
		(eventData: DraxMonitorDragDropEventData) => {
			// console.log('\n', 'onMonitorDragDrop id:', id, '\n')
			return handleInternalDragEnd(eventData, true);
		},
		[handleInternalDragEnd]
	);

	const onMonitorDragEnter = useCallback((eventData) => {
		// console.log('onMonitorDragEnter', id)
		if (eventData.dragged.parentId !== id) {
			// console.log('setShowDummy true')
			setShowDummy(true);
		}
	}, []);

	return (
		<DraxView
			id={id}
			style={style}
			scrollPositionRef={scrollPositionRef}
			onMeasure={onMeasureContainer}
			onMonitorDragStart={onMonitorDragStart}
			onMonitorDragOver={onMonitorDragOver}
			onMonitorDragExit={onMonitorDragExit}
			onMonitorDragEnd={onMonitorDragEnd}
			onMonitorDragDrop={onMonitorDragDrop}
			onMonitorDragEnter={onMonitorDragEnter}
		>
			<DraxSubprovider parent={{ id, nodeHandleRef }}>
				<FlatList
					{...props}
					ref={setFlatListRefs}
					renderItem={renderItem}
					onScroll={onScroll}
					onContentSizeChange={onContentSizeChange}
					data={reorderedData}
				/>
			</DraxSubprovider>
		</DraxView>
	);
};
