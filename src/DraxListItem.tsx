import React, {
	memo,
	MutableRefObject,
	useEffect,
	useLayoutEffect,
} from "react";
import { ListRenderItemInfo, StyleSheet } from "react-native";
import {
	SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { DraxView } from "./DraxView";
import {
	DraxListProps,
	DraxListRenderItemContent,
	DraxListRenderItemHoverContent,
	DraxViewMeasurements,
	DraxViewProps,
	DraxViewRegistration,
	DraxViewStyleProps,
} from "./types";

const defaultStyles = StyleSheet.create({
	draggingStyle: { opacity: 0 },
	dragReleasedStyle: { opacity: 0.5 },
});

interface RenderItemProps<T extends unknown> {
	index: number;
	item: T;
	originalIndex: number;
	itemStyles?: DraxViewStyleProps;
	horizontal: boolean;
	longPressDelay: number;
	lockItemDragsToMainAxis: boolean;
	itemsDraggable: boolean;
	draggedItem: SharedValue<number | undefined>;
	shiftsRef: SharedValue<number[]>;
	itemMeasurementsRef: MutableRefObject<
		((DraxViewMeasurements & { key?: string }) | undefined)[]
	>;
	prevItemMeasurementsRef: MutableRefObject<
		((DraxViewMeasurements & { key?: string }) | undefined)[]
	>;
	resetDraggedItem: () => void;
	keyExtractor?: (item: T, index: number) => string;
	previousShiftsRef: SharedValue<number[]>;
	registrationsRef: MutableRefObject<(DraxViewRegistration | undefined)[]>;
	viewPropsExtractor?: (item: T) => Partial<DraxViewProps>;
	renderItemContent: DraxListRenderItemContent<T>;
	renderItemHoverContent?: DraxListRenderItemHoverContent<T>;
	info: ListRenderItemInfo<T>;
	data: DraxListProps<T>["data"];
}

const RenderItemComponent = <T extends unknown>({
	index,
	item,
	originalIndex,
	itemStyles,
	horizontal,
	longPressDelay,
	lockItemDragsToMainAxis,
	itemsDraggable,
	draggedItem,
	shiftsRef,
	itemMeasurementsRef,
	prevItemMeasurementsRef,
	resetDraggedItem,
	keyExtractor,
	previousShiftsRef,
	registrationsRef,
	viewPropsExtractor,
	renderItemContent,
	renderItemHoverContent,
	info,
	data,
}: RenderItemProps<T>) => {
	const {
		style: itemStyle,
		draggingStyle = defaultStyles.draggingStyle,
		dragReleasedStyle = defaultStyles.dragReleasedStyle,
		...otherStyleProps
	} = itemStyles ?? {};

	const animatedValue = useSharedValue(0);

	const itemKey =
		(item && keyExtractor?.(item, index)) ??
		(item as any)?.key ??
		(item as any)?.id;

	useAnimatedReaction(
		() => [shiftsRef.value] as const,
		([shiftsRef]) => {
			const toValue = shiftsRef[index];

			const isDragging = typeof draggedItem.value === "number";

			if (isDragging) {
				animatedValue.value = withTiming(toValue, {
					duration: 200,
				});
			}
		},
	);

	useEffect(() => {
		/** Reset the shift when the item moves to a new index. */
		animatedValue.value = 0;
	}, [index]);

	const shiftTransformStyle = useAnimatedStyle(() => {
		const shift = animatedValue.value ?? 0;

		return {
			transform: horizontal
				? [{ translateX: shift }]
				: [{ translateY: shift }],
		};
	});

	useLayoutEffect(() => {
		const measurements = itemMeasurementsRef.current[originalIndex];
		const previousMeasurementsIndex =
			prevItemMeasurementsRef.current.findIndex(
				(item) => item?.key === itemKey,
			);

		const previousMeasurements =
			prevItemMeasurementsRef.current[previousMeasurementsIndex];

		const isLayoutShifted = previousShiftsRef.value.some(Boolean);

		if (previousMeasurements && measurements && !isLayoutShifted) {
			const offset = horizontal
				? previousMeasurements.x - measurements.x
				: previousMeasurements.y - measurements.y;

			animatedValue.value = offset;

			animatedValue.value = withSpring(0, {
				damping: 20,
				stiffness: 90,
			});
		}
	}, [
		itemKey,
		originalIndex,
		horizontal,
		itemMeasurementsRef,
		prevItemMeasurementsRef,
		previousShiftsRef,
	]);

	return (
		<DraxView
			style={[itemStyle, shiftTransformStyle]}
			draggingStyle={draggingStyle}
			dragReleasedStyle={dragReleasedStyle}
			{...otherStyleProps}
			longPressDelay={longPressDelay}
			lockDragXPosition={lockItemDragsToMainAxis && !horizontal}
			lockDragYPosition={lockItemDragsToMainAxis && horizontal}
			draggable={itemsDraggable}
			payload={{ index, originalIndex, item: data?.[index] }}
			{...(viewPropsExtractor?.(item) ?? {})}
			onDragEnd={resetDraggedItem}
			onDragDrop={resetDraggedItem}
			onMeasure={(measurements) => {
				if (originalIndex !== undefined && measurements) {
					// console.log(
					// 	`measuring [${index}, ${originalIndex}]: (${measurements?.x}, ${measurements?.y})`,
					// );
					itemMeasurementsRef.current[originalIndex] = {
						...measurements,
						key: itemKey,
					};
				}
			}}
			registration={(registration) => {
				if (registration && originalIndex !== undefined) {
					// console.log(`registering [${index}, ${originalIndex}], ${registration.id}`);
					registrationsRef.current[originalIndex] = registration;
					registration.measure();
				}
			}}
			renderContent={(props) => renderItemContent(info, props)}
			renderHoverContent={
				renderItemHoverContent &&
				((props) => renderItemHoverContent(info, props))
			}
		/>
	);
};

export const RenderItem = memo(
	RenderItemComponent,
) as typeof RenderItemComponent;
