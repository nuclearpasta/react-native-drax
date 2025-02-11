import React, { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import Reanimated, {
	SharedValue,
	useAnimatedRef,
} from "react-native-reanimated";

import { useDraxContext } from "./hooks";
import { useContent } from "./hooks/useContent";
import {
	TReanimatedHoverViewProps,
	DraxViewDragStatus,
	Position,
} from "./types";

export const HoverView = ({
	children,
	hoverPosition,
	renderHoverContent,
	renderContent,
	scrollPosition,
	...props
}: Omit<PropsWithChildren<TReanimatedHoverViewProps>, "internalProps"> & {
	id: string;
	hoverPosition: SharedValue<Position>;
	scrollPositionOffset?: Position;
}) => {
	const { updateHoverViewMeasurements } = useDraxContext();
	const { combinedStyle, animatedHoverStyle, renderedChildren, dragStatus } =
		useContent({
			draxViewProps: {
				children,
				hoverPosition,
				renderHoverContent,
				renderContent,
				scrollPosition,
				...props,
			},
		});

	const viewRef = useAnimatedRef<Reanimated.View>();

	if (!(props.draggable && !props.noHover)) {
		return null;
	}

	if (
		dragStatus === DraxViewDragStatus.Inactive ||
		typeof dragStatus === "undefined"
	) {
		return null;
	}

	return (
		<Reanimated.View
			{...props}
			ref={viewRef}
			onLayout={(measurements) => {
				!props?.disableHoverViewMeasurementsOnLayout &&
					updateHoverViewMeasurements({
						id: props.id,
						measurements: { ...measurements.nativeEvent.layout },
					});
			}}
			style={[StyleSheet.absoluteFill, combinedStyle, animatedHoverStyle]}
			pointerEvents="none"
		>
			{renderedChildren}
		</Reanimated.View>
	);
};
