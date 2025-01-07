import React, { PropsWithChildren, ReactNode } from "react";
import { StyleSheet } from "react-native";
import Reanimated, {
	SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
} from "react-native-reanimated";

import { useDraxContext } from "./hooks";
import { useStatus } from "./hooks/useStatus";
import { extractDimensions, updateHoverPosition } from "./math";
import { getCombinedHoverStyle } from "./transform";
import {
	TReanimatedHoverViewProps,
	DraxViewDragStatus,
	Position,
} from "./types";

export const ReanimatedHoverView = ({
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
	let content: ReactNode;
	const { dragStatus, anyReceiving } = useStatus({ ...props, hoverPosition });

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
	const dimensions =
		viewData?.measurements && extractDimensions(viewData?.measurements);

	const combinedHoverStyle =
		dimensions &&
		getCombinedHoverStyle({ dragStatus, anyReceiving, dimensions }, props);

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

	const animatedHoverStyle = useAnimatedStyle(() => {
		return {
			opacity:
				hoverPosition.value.x === 0 && hoverPosition.value.y === 0
					? 0
					: 1, //prevent flash when release animation finishes.
			transform: [
				{
					translateX:
						hoverPosition?.value?.x -
						(scrollPosition?.value?.x || 0),
				},
				{
					translateY:
						hoverPosition?.value?.y -
						(scrollPosition?.value?.y || 0),
				},
				...(combinedHoverStyle?.transform || []),
			],
		};
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

	const render = renderHoverContent ?? renderContent;

	if (render) {
		const renderProps = {
			children,
			hover: true,
			// viewState: internalProps.viewState,
			// trackingStatus: {},
			dimensions,
		};
		content = render(renderProps);
	} else {
		content = children;
	}

	return (
		<Reanimated.View
			{...props}
			style={[
				StyleSheet.absoluteFill,
				combinedHoverStyle,
				animatedHoverStyle,
			]}
			pointerEvents="none"
		>
			{content}
		</Reanimated.View>
	);
};
