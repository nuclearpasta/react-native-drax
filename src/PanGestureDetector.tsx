import React, { memo, PropsWithChildren, useMemo } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnUI } from "react-native-reanimated";

import { useDraxContext } from "./hooks";
import { TPanGestureDetectorProps } from "./types";

export const PanGestureDetector = memo(
	({
		id,
		children,
		longPressDelay,
		draggable,
	}: PropsWithChildren<TPanGestureDetectorProps>) => {
		// Connect with Drax.
		const { handleGestureEvent, handleGestureStateChange } =
			useDraxContext();

		const gesture = useMemo(
			() =>
				draggable &&
				Gesture.Pan()
					.onBegin(handleGestureStateChange(id))
					.onStart(handleGestureStateChange(id))
					.onUpdate((event) => runOnUI(handleGestureEvent)(id, event))
					.onEnd(handleGestureStateChange(id))
					.shouldCancelWhenOutside(false)
					.activateAfterLongPress(longPressDelay)
					.enabled(draggable)
					.maxPointers(1)
					.runOnJS(true),
			[
				handleGestureStateChange,
				id,
				longPressDelay,
				draggable,
				handleGestureEvent,
			],
		);

		if (!draggable || !gesture) {
			return <>{children}</>;
		}

		return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
	},
);
