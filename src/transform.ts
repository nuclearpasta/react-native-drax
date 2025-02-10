import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import {
	AnimatedStyle,
	ILayoutAnimationBuilder,
	SharedValue,
	StyleProps,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import {
	AnimatedViewStyleWithoutLayout,
	DraxViewDragStatus,
	TReanimatedHoverViewProps,
	ViewDimensions,
} from "./types";

export const flattenStylesWithoutLayout = (
	styles: (
		| StyleProps
		| StyleProp<ViewStyle>
		| StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>
		| null
	)[],
): AnimatedViewStyleWithoutLayout => {
	const {
		margin,
		marginHorizontal,
		marginVertical,
		marginLeft,
		marginRight,
		marginTop,
		marginBottom,
		marginStart,
		marginEnd,
		left,
		right,
		top,
		bottom,
		flex,
		flexBasis,
		flexDirection,
		flexGrow,
		flexShrink,
		...flattened
	} = StyleSheet.flatten(styles);
	return flattened;
};

// Combine hover styles for given internal render props.
export const getCombinedHoverStyle = (
	{
		dragStatus,
		anyReceiving,
		dimensions,
	}: {
		dimensions: ViewDimensions;
		dragStatus: DraxViewDragStatus;
		anyReceiving: boolean;
	},
	props: Partial<PropsWithChildren<TReanimatedHoverViewProps>>,
) => {
	// Start with base style, calculated dimensions, and hover base style.
	const hoverStyles: (
		| StyleProps
		| StyleProp<ViewStyle>
		| StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>
		| null
	)[] = [props?.style, dimensions, props?.hoverStyle];

	// Apply style overrides based on state.
	if (dragStatus === DraxViewDragStatus.Dragging) {
		hoverStyles.push(props?.hoverDraggingStyle);
		if (anyReceiving) {
			hoverStyles.push(props?.hoverDraggingWithReceiverStyle);
		} else {
			hoverStyles.push(props?.hoverDraggingWithoutReceiverStyle);
		}
	} else if (dragStatus === DraxViewDragStatus.Released) {
		hoverStyles.push(props?.hoverDragReleasedStyle);
	}

	// Remove any layout styles.
	const flattenedHoverStyle = flattenStylesWithoutLayout(hoverStyles);

	return flattenedHoverStyle;
};

export const customLayoutTransition = (
	shiftsRef: SharedValue<number[]>,
	data?: ArrayLike<any> | null,
): ILayoutAnimationBuilder => ({
	build: () => (values) => {
		"worklet";

		const isInternalReordering =
			shiftsRef.value.length <= (data?.length || 0);

		const duration = isInternalReordering ? 1 : 200;

		return {
			animations: {
				originX: withTiming(values.targetOriginX, { duration }),
				originY: withTiming(values.targetOriginY, { duration }),
				width: withSpring(values.targetWidth),
				height: withSpring(values.targetHeight),
			},

			initialValues: {
				originX: values.currentOriginX,
				originY: values.currentOriginY,
				width: values.currentWidth,
				height: values.currentHeight,
			},
		};
	},
});
