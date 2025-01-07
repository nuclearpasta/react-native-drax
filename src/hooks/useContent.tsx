import React, {
	useMemo,
	useCallback,
	ReactNode,
	MutableRefObject,
} from "react";
import { StyleSheet } from "react-native";
import Reanimated, { AnimatedRef, SharedValue } from "react-native-reanimated";

import { extractDimensions } from "../math";
import { useDraxContext } from "./useDraxContext";
import { useStatus } from "./useStatus";
import { DraxSubprovider } from "../DraxSubprovider";
import {
	DraxRenderContentProps,
	DraxViewDragStatus,
	DraxViewMeasurements,
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
		isParent,
		...props
	},
	viewRef,
	measurementsRef,
}: {
	draxViewProps: DraxViewProps & {
		id: string;
		hoverPosition: SharedValue<Position>;
	};
	viewRef: AnimatedRef<Reanimated.View>;
	measurementsRef: MutableRefObject<DraxViewMeasurements | undefined>;
}) => {
	const { getViewState, getTrackingStatus } = useDraxContext();
	// Get the render-related state for rendering.
	const viewState = useMemo(() => getViewState(id), [getViewState, id]);
	const trackingStatus = useMemo(
		() => getTrackingStatus(),
		[getTrackingStatus],
	);

	const { dragStatus, receiveStatus, anyDragging, anyReceiving } = useStatus({
		id,
		otherDraggingStyle,
		otherDraggingWithReceiverStyle,
		otherDraggingWithoutReceiverStyle,
		...props,
	});

	// Get full render props for non-hovering view content.
	const getRenderContentProps = useCallback((): DraxRenderContentProps => {
		const measurements = measurementsRef.current;
		const dimensions = measurements && extractDimensions(measurements);
		return {
			viewState,
			trackingStatus,
			children,
			dimensions,
			hover: false,
		};
	}, [measurementsRef, viewState, trackingStatus, children]);

	// Combined style for current render-related state.
	const combinedStyle = useMemo(() => {
		// Start with base style.
		const styles = [style];

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
	]);

	// The rendered React children of this view.
	const renderedChildren = useMemo(() => {
		let content: ReactNode;
		if (renderContent) {
			const renderContentProps = getRenderContentProps();
			content = renderContent(renderContentProps);
		} else {
			content = children;
		}
		if (isParent) {
			// This is a Drax parent, so wrap children in subprovider.
			content = (
				<DraxSubprovider parent={{ id, viewRef }}>
					{content}
				</DraxSubprovider>
			);
		}
		return content;
	}, [renderContent, getRenderContentProps, children, isParent, id, viewRef]);

	return { renderedChildren, combinedStyle };
};
