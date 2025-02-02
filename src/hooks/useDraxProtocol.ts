import { useCallback, useEffect } from "react";
import {
	runOnJS,
	SharedValue,
	useAnimatedReaction,
	useSharedValue,
} from "react-native-reanimated";

import { DraxViewProps, Position } from "../types";
import { useDraxContext } from "./useDraxContext";

export const useDraxProtocol = (
	props: DraxViewProps & { id: string },
	hoverPosition: SharedValue<Position>,
) => {
	const _scrollPosition = useSharedValue<Position>({ x: 0, y: 0 });

	const scrollPosition = props.scrollPosition || _scrollPosition;

	// Connect with Drax.
	const { updateViewProtocol, registerView, unregisterView } =
		useDraxContext();

	const updateViewProtocolCallback = useCallback(
		(scrollPositionValue?: Position) => {
			const dragPayload = props.dragPayload ?? props.payload;
			const receiverPayload = props.receiverPayload ?? props.payload;

			// Pass the event up to the Drax context.
			updateViewProtocol({
				id: props.id,
				protocol: {
					...props,
					hoverPosition,
					dragPayload,
					receiverPayload,
					scrollPositionValue,
				},
			});
		},
		[updateViewProtocol, props],
	);

	useAnimatedReaction(
		() => scrollPosition?.value,
		(scrollPositionValue) => {
			runOnJS(updateViewProtocolCallback)(scrollPositionValue);
		},
	);

	// Report updates to our protocol callbacks when we have an id and whenever the props change.
	useEffect(() => {
		updateViewProtocolCallback();

		/** 🪲BUG:
		 * Ugly hack to update hover view in case props change.
		 */
		registerView({ id: "bsbsbs" });
		unregisterView({ id: "bsbsbs" });
	}, [updateViewProtocolCallback, registerView, unregisterView]);
};
