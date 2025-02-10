import { useState, useCallback, useMemo } from "react";
import {
	runOnJS,
	SharedValue,
	useAnimatedReaction,
} from "react-native-reanimated";

import { useDraxContext } from "./useDraxContext";
import {
	DraxViewProps,
	DraxViewDragStatus,
	DraxViewReceiveStatus,
	Position,
} from "../types";

export const useStatus = ({
	id,
	otherDraggingStyle,
	otherDraggingWithReceiverStyle,
	otherDraggingWithoutReceiverStyle,
	hoverPosition,
}: DraxViewProps & { id: string; hoverPosition: SharedValue<Position> }) => {
	const [dragStatus, setDragSatatus] = useState(DraxViewDragStatus.Inactive);
	const [receiveStatus, setReceiveStatus] = useState(
		DraxViewReceiveStatus.Inactive,
	);
	const [anyReceiving, setAnyReceiving] = useState(false);
	const [anyDragging, setAnyDragging] = useState(false);

	// Connect with Drax.
	const { getTrackingDragged, parentPosition, getReleaseViews } =
		useDraxContext();

	const updateState = useCallback(
		(position: Position) => {
			const dragged = getTrackingDragged();
			const releaseViews = getReleaseViews();
			if (position.x === 0 && position.y === 0) {
				setDragSatatus(DraxViewDragStatus.Inactive);
				setAnyReceiving(false);
			} else if (releaseViews?.includes(id)) {
				setDragSatatus(DraxViewDragStatus.Released);
			} else if (dragged) {
				if (dragged?.id === id) {
					setDragSatatus(DraxViewDragStatus.Dragging);
				} else {
					setDragSatatus(DraxViewDragStatus.Inactive);
				}

				if (
					otherDraggingStyle ||
					otherDraggingWithReceiverStyle ||
					otherDraggingWithoutReceiverStyle
				) {
					setAnyDragging(true);
				}
			} else {
				setAnyDragging(false);
				setDragSatatus(DraxViewDragStatus.Inactive);
			}
		},
		[
			getReleaseViews,
			getTrackingDragged,
			id,
			otherDraggingStyle,
			otherDraggingWithReceiverStyle,
			otherDraggingWithoutReceiverStyle,
		],
	);

	useAnimatedReaction(
		() => hoverPosition.value,
		(position) => {
			runOnJS(updateState)(position);
		},
	);

	const updateReceivingState = useCallback(
		(position: Position) => {
			const dragged = getTrackingDragged();
			if (position.x === 0 && position.y === 0) {
				const releaseViews = getReleaseViews();
				if (
					releaseViews?.includes(id) ||
					dragged?.tracking.draggedId === id
				) {
					setDragSatatus(DraxViewDragStatus.Released);
				} else {
					setReceiveStatus(DraxViewReceiveStatus.Inactive);
				}
				setAnyReceiving(false);
			} else if (dragged) {
				if (dragged?.tracking.receiver) {
					if (dragged?.tracking.receiver?.receiverId === id) {
						setReceiveStatus(DraxViewReceiveStatus.Receiving);
					} else {
						setReceiveStatus(DraxViewReceiveStatus.Inactive);
					}

					if (otherDraggingWithReceiverStyle) {
						setAnyReceiving(true);
					}
				} else {
					setAnyReceiving(false);
					setReceiveStatus(DraxViewReceiveStatus.Inactive);
				}
			} else {
				setReceiveStatus(DraxViewReceiveStatus.Inactive);
				setAnyReceiving(false);
			}
		},
		[getTrackingDragged, id, otherDraggingWithReceiverStyle],
	);

	useAnimatedReaction(
		() => parentPosition.value,
		(position) => {
			runOnJS(updateReceivingState)(position);
		},
	);

	const status = useMemo(
		() => ({
			dragStatus,
			receiveStatus,
			anyReceiving,
			anyDragging,
		}),
		[anyDragging, anyReceiving, dragStatus, receiveStatus],
	);

	return status;
};
