import React, { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import Reanimated, { SharedValue } from "react-native-reanimated";

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
			style={[StyleSheet.absoluteFill, combinedStyle, animatedHoverStyle]}
			pointerEvents="none"
		>
			{renderedChildren}
		</Reanimated.View>
	);
};
