import React, {
	ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { StyleSheet } from "react-native";
import Reanimated, {
	AnimatedRef,
	SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";

import { extractDimensions } from "../math";
import { useDraxContext } from "./useDraxContext";
import { useStatus } from "./useStatus";
import { DraxSubprovider } from "../DraxSubprovider";
import {
	flattenStylesWithoutLayout,
	getCombinedHoverStyle,
} from "../transform";
import {
	DraxAbsoluteViewData,
	DraxRenderContentProps,
	DraxTrackingDrag,
	DraxViewDragStatus,
	DraxViewProps,
	DraxViewReceiveStatus,
	Position,
} from "../types";

export const useContent = ({
	draxViewProps: {
		id,
		style,
		dragInactiveStyle,
		draggingStyle,
		draggingWithReceiverStyle,
		draggingWithoutReceiverStyle,
		dragReleasedStyle,
		otherDraggingStyle,
		otherDraggingWithReceiverStyle,
		otherDraggingWithoutReceiverStyle,
		receiverInactiveStyle,
		receivingStyle,
		children,
		renderContent,
		renderHoverContent,
		isParent,
		scrollPositionOffset,
		...props
	},
	viewRef,
}: {
	draxViewProps: DraxViewProps & {
		id: string;
		hoverPosition: SharedValue<Position>;
		scrollPositionOffset?: Position;
	};
	viewRef?: AnimatedRef<Reanimated.View>;
}) => {
	const { getTrackingDragged, getTrackingReceiver, getAbsoluteViewData } =
		useDraxContext();

	const { dragStatus, receiveStatus, anyDragging, anyReceiving } = useStatus({
		id,
		otherDraggingStyle,
		otherDraggingWithReceiverStyle,
		otherDraggingWithoutReceiverStyle,
		...props,
	});

	const dragged = getTrackingDragged();

	const trackingReleasedDraggedRef = useRef<{
		tracking?: DraxTrackingDrag;
		id?: string;
		data?: DraxAbsoluteViewData;
	}>({});

	useEffect(() => {
		if (dragged && dragged.id === id)
			trackingReleasedDraggedRef.current = dragged;
	}, [dragged, id]);

	const receiver = getTrackingReceiver();
	const draggedData = getAbsoluteViewData(dragged?.id);

	// Get full render props for non-hovering view content.
	const getRenderContentProps = useCallback((): DraxRenderContentProps => {
		const viewData = getAbsoluteViewData(id);

		const measurements = viewData?.measurements;
		const dimensions = measurements && extractDimensions(measurements);

		return {
			viewState: {
				data: viewData,
				dragStatus,
				receiveStatus,
				...dragged?.tracking,
				releasedDragTracking: trackingReleasedDraggedRef.current
					?.tracking && {
					...trackingReleasedDraggedRef.current.tracking,
				},
				receivingDrag:
					receiveStatus !== DraxViewReceiveStatus.Receiving ||
					!receiver?.id ||
					!draggedData
						? undefined
						: {
								id: receiver?.id,
								payload: draggedData?.protocol.dragPayload,
								data: draggedData,
							},
			},
			trackingStatus: { dragging: anyDragging, receiving: anyReceiving },
			children,
			dimensions,
			hover: !viewRef,
		};
	}, [
		children,
		dragStatus,
		receiveStatus,
		anyDragging,
		anyReceiving,
		getTrackingDragged,
	]);

	// Combined style for current render-related state.
	const combinedStyle = useMemo(() => {
		// Start with base style.
		const styles = [style];

		if (!viewRef) {
			const viewData = getAbsoluteViewData(id);

			const measurements = viewData?.measurements;
			const dimensions = measurements && extractDimensions(measurements);
			const combinedHoverStyle =
				dimensions &&
				getCombinedHoverStyle(
					{ dragStatus, anyReceiving, dimensions },
					{
						id,
						style,
						dragInactiveStyle,
						draggingStyle,
						draggingWithReceiverStyle,
						draggingWithoutReceiverStyle,
						dragReleasedStyle,
						otherDraggingStyle,
						otherDraggingWithReceiverStyle,
						otherDraggingWithoutReceiverStyle,
						receiverInactiveStyle,
						receivingStyle,
						children,
						renderContent,
						renderHoverContent,
						isParent,
						...props,
					},
				);

			styles.push(combinedHoverStyle);
		}

		// Apply style overrides for drag state.
		if (dragStatus === DraxViewDragStatus.Dragging) {
			styles.push(draggingStyle);
			if (anyReceiving) {
				styles.push(draggingWithReceiverStyle);
			} else {
				styles.push(draggingWithoutReceiverStyle);
			}
		} else if (dragStatus === DraxViewDragStatus.Released) {
			styles.push(dragReleasedStyle);
		} else {
			styles.push(dragInactiveStyle);
			if (anyDragging) {
				styles.push(otherDraggingStyle);
				if (anyReceiving) {
					styles.push(otherDraggingWithReceiverStyle);
				} else {
					styles.push(otherDraggingWithoutReceiverStyle);
				}
			}
		}

		// Apply style overrides for receiving state.
		if (receiveStatus === DraxViewReceiveStatus.Receiving) {
			styles.push(receivingStyle);
		} else {
			styles.push(receiverInactiveStyle);
		}

		if (!viewRef) {
			return flattenStylesWithoutLayout(styles);
		}

		return StyleSheet.flatten(styles);
	}, [
		style,
		dragStatus,
		receiveStatus,
		draggingStyle,
		anyReceiving,
		draggingWithReceiverStyle,
		draggingWithoutReceiverStyle,
		dragReleasedStyle,
		dragInactiveStyle,
		anyDragging,
		otherDraggingStyle,
		otherDraggingWithReceiverStyle,
		otherDraggingWithoutReceiverStyle,
		receivingStyle,
		receiverInactiveStyle,
		viewRef,
	]);

	const animatedHoverStyle = useAnimatedStyle(() => {
		if (viewRef) {
			return {};
		}

		return {
			opacity:
				props.hoverPosition.value.x === 0 &&
				props.hoverPosition.value.y === 0
					? 0
					: 1, //prevent flash when release animation finishes.
			transform: [
				{
					translateX:
						props.hoverPosition?.value?.x -
						((props.scrollPosition?.value?.x || 0) -
							(scrollPositionOffset?.x || 0)),
				},
				{
					translateY:
						props.hoverPosition?.value?.y -
						((props.scrollPosition?.value?.y || 0) -
							(scrollPositionOffset?.y || 0)),
				},
				...(combinedStyle?.transform || []),
			],
		};
	});

	// The rendered React children of this view.
	const renderedChildren = useMemo(() => {
		let content: ReactNode;

		const renderDraxContent = !viewRef
			? renderHoverContent || renderContent
			: renderContent;

		if (renderDraxContent) {
			const renderContentProps = getRenderContentProps();
			content = renderDraxContent(renderContentProps);
		} else {
			content = children;
		}

		if (isParent && viewRef) {
			// This is a Drax parent, so wrap children in subprovider.
			content = (
				<DraxSubprovider parent={{ id, viewRef }}>
					{content}
				</DraxSubprovider>
			);
		}

		return content;
	}, [
		renderContent,
		getRenderContentProps,
		children,
		isParent,
		id,
		viewRef,
		renderHoverContent,
	]);

	return {
		renderedChildren,
		combinedStyle,
		animatedHoverStyle,
		dragStatus,
	};
};
