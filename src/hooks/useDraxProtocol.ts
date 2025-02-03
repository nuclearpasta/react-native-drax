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
	// Connect with Drax.
	const { updateViewProtocol } = useDraxContext();

	const _scrollPosition = useSharedValue<Position>({ x: 0, y: 0 });

	const scrollPosition = props.scrollPosition || _scrollPosition;

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
		[updateViewProtocol, props, hoverPosition],
	);

	useAnimatedReaction(
		() => scrollPosition?.value,
		(scrollPositionValue) => {
			runOnJS(updateViewProtocolCallback)(scrollPositionValue);
		},
	);

	return updateViewProtocolCallback;
};
