import React, { PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import Reanimated, {
	SharedValue,
	useAnimatedReaction,
} from "react-native-reanimated";

import { useDraxContext } from "./hooks";
import { useContent } from "./hooks/useContent";
import { updateHoverPosition } from "./math";
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
}) => {
	const {
		parentPosition,
		getAbsoluteViewData,
		startPosition,
		getTrackingDragged,
	} = useDraxContext();

	const viewData = getAbsoluteViewData(props.id);

	const draggedId = getTrackingDragged()?.id;
	const id = props.id;
	const absoluteMeasurements = viewData?.absoluteMeasurements;

	useAnimatedReaction(
		() => parentPosition.value,
		(position) => {
			id &&
				draggedId === id &&
				updateHoverPosition(
					position,
					hoverPosition,
					startPosition,
					props,
					scrollPosition,
					absoluteMeasurements,
				);
		},
	);

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
