import React, { useEffect, memo, ReactNode } from "react";
import Reanimated, { useSharedValue } from "react-native-reanimated";

import { PanGestureDetector } from "./PanGestureDetector";
import { useDraxId, useDraxContext } from "./hooks";
import { useContent } from "./hooks/useContent";
import { useMeasurements } from "./hooks/useMeasurements";
import { defaultLongPressDelay } from "./params";
import { DraxViewProps, Position } from "./types";

export const DraxView = memo((props: DraxViewProps): ReactNode => {
	// Coalesce protocol props into capabilities.
	const draggable =
		props.draggable ??
		(props.dragPayload !== undefined ||
			props.payload !== undefined ||
			!!props.onDrag ||
			!!props.onDragEnd ||
			!!props.onDragEnter ||
			!!props.onDragExit ||
			!!props.onDragOver ||
			!!props.onDragStart ||
			!!props.onDragDrop);

	const receptive =
		props.receptive ??
		(props.receiverPayload !== undefined ||
			props.payload !== undefined ||
			!!props.onReceiveDragEnter ||
			!!props.onReceiveDragExit ||
			!!props.onReceiveDragOver ||
			!!props.onReceiveDragDrop);

	const monitoring =
		props.monitoring ??
		(!!props.onMonitorDragStart ||
			!!props.onMonitorDragEnter ||
			!!props.onMonitorDragOver ||
			!!props.onMonitorDragExit ||
			!!props.onMonitorDragEnd ||
			!!props.onMonitorDragDrop);

	// The unique identifier for this view.
	const id = useDraxId(props.id);

	return (
		<PanGestureDetector
			id={id}
			draggable={draggable}
			longPressDelay={props.longPressDelay ?? defaultLongPressDelay}
		>
			<ReanimatedView
				id={id}
				{...props}
				draggable={draggable}
				receptive={receptive}
				monitoring={monitoring}
			/>
		</PanGestureDetector>
	);
});

interface IReanimatedView extends DraxViewProps {
	id: string;
}

export const ReanimatedView = memo((props: IReanimatedView): JSX.Element => {
	const hoverPosition = useSharedValue<Position>({ x: 0, y: 0 });

	// Connect with Drax.
	const { updateViewProtocol, registerView, unregisterView } =
		useDraxContext();

	const { onLayout, viewRef, measureWithHandler } = useMeasurements(props);

	const { combinedStyle, renderedChildren } = useContent({
		draxViewProps: { ...props, hoverPosition },
		viewRef,
	});

	useEffect(() => {
		/** 🪲BUG:
		 * For some reason, the Staging zone from the ColorDragDrop example loses its measurements,
		 * and we need to force refresh on them */
		measureWithHandler?.();
	}, [combinedStyle]);

	// Report updates to our protocol callbacks when we have an id and whenever the props change.
	useEffect(() => {
		updateViewProtocol({
			id: props.id,
			protocol: {
				...props,
				hoverPosition,
				dragPayload: props.dragPayload ?? props.payload,
				receiverPayload: props.receiverPayload ?? props.payload,
			},
		});

		/** 🪲BUG:
		 * Ugly hack to update hover view in case props change.
		 */
		registerView({ id: "bsbsbs" });
		unregisterView({ id: "bsbsbs" });
	}, [
		updateViewProtocol,
		hoverPosition,
		props,
		registerView,
		unregisterView,
		props.style,
	]);

	return (
		<Reanimated.View
			{...props}
			style={combinedStyle}
			ref={viewRef}
			onLayout={onLayout}
			collapsable={false}
		>
			{renderedChildren}
		</Reanimated.View>
	);
});
