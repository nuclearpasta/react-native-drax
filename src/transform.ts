import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { StyleProps } from "react-native-reanimated";

import {
	AnimatedViewStyleWithoutLayout,
	DraxInternalRenderHoverViewProps,
	DraxViewDragStatus,
	TReanimatedHoverViewProps,
	ViewDimensions,
} from "./types";

export const flattenStylesWithoutLayout = (
	styles: (StyleProps | null | StyleProp<ViewStyle>)[],
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
	const hoverStyles: (StyleProps | null | StyleProp<ViewStyle>)[] = [
		props?.style,
		dimensions,
		props?.hoverStyle,
	];

	// Apply style style overrides based on state.
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
