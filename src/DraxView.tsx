import React, { useEffect, memo, ReactNode } from "react";
import Reanimated, { useSharedValue } from "react-native-reanimated";

import { PanGestureDetector } from "./PanGestureDetector";
import { useDraxContext, useDraxId } from "./hooks";
import { useContent } from "./hooks/useContent";
import { useDraxProtocol } from "./hooks/useDraxProtocol";
import { useMeasurements } from "./hooks/useMeasurements";
import { generateRandomId } from "./math";
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
			<DraxReanimatedView
				id={id}
				{...props}
				draggable={draggable}
				receptive={receptive}
				monitoring={monitoring}
			/>
		</PanGestureDetector>
	);
});

type IReanimatedView = DraxViewProps & { id: string };

export const DraxReanimatedView = memo((props: IReanimatedView): ReactNode => {
	const hoverPosition = useSharedValue<Position>({ x: 0, y: 0 });
	const updateViewProtocol = useDraxProtocol(props, hoverPosition);

	const { registerView, unregisterView } = useDraxContext();
	const { onLayout, viewRef } = useMeasurements(props);

	const { combinedStyle, renderedChildren } = useContent({
		draxViewProps: { ...props, hoverPosition },
		viewRef,
	});

	// useEffect(() => {
	// 	/** @todo 🪲BUG:
	// 	 * For some reason, the Staging zone from the ColorDragDrop example loses its measurements,
	// 	 * and we need to force refresh on them */
	// 	measureWithHandler?.();
	// }, [combinedStyle]);

	useEffect(() => {
		/** @todo 🪲BUG:
		 * Ugly hack to update hover views.
		 * Mostly useful when their props change and we need a forced refresh
		 */
		updateViewProtocol();
		const fakeId = generateRandomId();
		registerView({ id: fakeId });
		unregisterView({ id: fakeId });
	}, [updateViewProtocol, registerView, unregisterView]);

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
