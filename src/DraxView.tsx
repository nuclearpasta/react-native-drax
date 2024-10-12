import React, {
	PropsWithChildren,
	useRef,
	useEffect,
	useCallback,
	useMemo,
	ReactNode,
} from 'react';
import {
	Animated,
	View,
	StyleSheet,
	Dimensions,
	ViewStyle,
	StyleProp,
} from 'react-native';
import {
	LongPressGestureHandler,
	LongPressGestureHandlerGestureEvent,
	LongPressGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import throttle from 'lodash.throttle';

import { useDraxId, useDraxContext } from './hooks';
import {
	DraxViewProps,
	DraxViewDragStatus,
	DraxViewReceiveStatus,
	DraxGestureEvent,
	DraxViewMeasurements,
	DraxViewMeasurementHandler,
	DraxRenderContentProps,
	DraxInternalRenderHoverViewProps,
} from './types';
import { defaultLongPressDelay } from './params';
import { extractDimensions } from './math';
import { DraxSubprovider } from './DraxSubprovider';
import { flattenStylesWithoutLayout, mergeStyleTransform } from './transform';

export const DraxView = (
	{
		onDragStart,
		onDrag,
		onDragEnter,
		onDragOver,
		onDragExit,
		onDragEnd,
		onDragDrop,
		onSnapbackEnd,
		onReceiveDragEnter,
		onReceiveDragOver,
		onReceiveDragExit,
		onReceiveDragDrop,
		onMonitorDragStart,
		onMonitorDragEnter,
		onMonitorDragOver,
		onMonitorDragExit,
		onMonitorDragEnd,
		onMonitorDragDrop,
		animateSnapback,
		snapbackDelay,
		snapbackDuration,
		snapbackAnimator,
		payload,
		dragPayload,
		receiverPayload,
		style,
		dragInactiveStyle,
		draggingStyle,
		draggingWithReceiverStyle,
		draggingWithoutReceiverStyle,
		dragReleasedStyle,
		hoverStyle,
		hoverDraggingStyle,
		hoverDraggingWithReceiverStyle,
		hoverDraggingWithoutReceiverStyle,
		hoverDragReleasedStyle,
		receiverInactiveStyle,
		receivingStyle,
		otherDraggingStyle,
		otherDraggingWithReceiverStyle,
		otherDraggingWithoutReceiverStyle,
		renderContent,
		renderHoverContent,
		registration,
		onMeasure,
		scrollPositionRef,
		lockDragXPosition,
		lockDragYPosition,
		children,
		noHover = false,
		isParent = false,
		longPressDelay = defaultLongPressDelay,
		id: idProp,
		parent: parentProp,
		draggable: draggableProp,
		receptive: receptiveProp,
		monitoring: monitoringProp,
		...props
	}: PropsWithChildren<DraxViewProps>,
): JSX.Element => {
	// Coalesce protocol props into capabilities.
	const draggable = draggableProp ?? (
		dragPayload !== undefined
		|| payload !== undefined
		|| !!onDrag
		|| !!onDragEnd
		|| !!onDragEnter
		|| !!onDragExit
		|| !!onDragOver
		|| !!onDragStart
		|| !!onDragDrop
	);
	const receptive = receptiveProp ?? (
		receiverPayload !== undefined
		|| payload !== undefined
		|| !!onReceiveDragEnter
		|| !!onReceiveDragExit
		|| !!onReceiveDragOver
		|| !!onReceiveDragDrop
	);
	const monitoring = monitoringProp ?? (
		!!onMonitorDragStart
		|| !!onMonitorDragEnter
		|| !!onMonitorDragOver
		|| !!onMonitorDragExit
		|| !!onMonitorDragEnd
		|| !!onMonitorDragDrop
	);

	// The unique identifier for this view.
	const id = useDraxId(idProp);

	// The underlying View, for measuring and for subprovider nesting if this is a Drax parent view.
	const viewRef = useRef<View | null>(null);

	// This view's measurements, for reference.
	const measurementsRef = useRef<DraxViewMeasurements | undefined>(undefined);

	// Connect with Drax.
	const {
		getViewState,
		getTrackingStatus,
		registerView,
		unregisterView,
		updateViewProtocol,
		updateViewMeasurements,
		handleGestureEvent,
		handleGestureStateChange,
		rootViewRef,
		parent: contextParent,
	} = useDraxContext();

	// Identify Drax parent view (if any) from context or prop override.
	const parent = parentProp ?? contextParent;
	const parentId = parent?.id;

	// Identify parent node handle ref.
	const parentViewRef = parent ? parent.nodeViewRef : rootViewRef;

	// Register and unregister with Drax context when necessary.
	useEffect(
		() => {
			// Register with Drax context after we have an id.
			registerView({ id, parentId, scrollPositionRef });

			// Unregister when we unmount or id changes.
			return () => unregisterView({ id });
		},
		[
			id,
			parentId,
			scrollPositionRef,
			registerView,
			unregisterView,
		],
	);

	// Combine hover styles for given internal render props.
	const getCombinedHoverStyle = useCallback(
		({
			viewState: { dragStatus },
			trackingStatus: { receiving: anyReceiving },
			hoverPosition,
			dimensions,
		}: DraxInternalRenderHoverViewProps) => {
			// Start with base style, calculated dimensions, and hover base style.
			const hoverStyles: StyleProp<Animated.WithAnimatedValue<ViewStyle>>[] = [
				style,
				dimensions,
				hoverStyle,
			];

			// Apply style style overrides based on state.
			if (dragStatus === DraxViewDragStatus.Dragging) {
				hoverStyles.push(hoverDraggingStyle);
				if (anyReceiving) {
					hoverStyles.push(hoverDraggingWithReceiverStyle);
				} else {
					hoverStyles.push(hoverDraggingWithoutReceiverStyle);
				}
			} else if (dragStatus === DraxViewDragStatus.Released) {
				hoverStyles.push(hoverDragReleasedStyle);
			}

			// Remove any layout styles.
			const flattenedHoverStyle = flattenStylesWithoutLayout(hoverStyles);

			// Apply hover transform.
			const transform = hoverPosition.getTranslateTransform();

			return mergeStyleTransform(flattenedHoverStyle, transform);
		},
		[
			style,
			hoverStyle,
			hoverDraggingStyle,
			hoverDraggingWithReceiverStyle,
			hoverDraggingWithoutReceiverStyle,
			hoverDragReleasedStyle,
		],
	);

	// Internal render function for hover views, used in protocol by provider.
	const internalRenderHoverView = useMemo(
		() => ((draggable && !noHover)
			? (internalProps: DraxInternalRenderHoverViewProps): ReactNode => {
				let content: ReactNode;
				const render = renderHoverContent ?? renderContent;

				if (render) {
					const renderProps = {
						children,
						hover: true,
						viewState: internalProps.viewState,
						trackingStatus: internalProps.trackingStatus,
						dimensions: internalProps.dimensions,
					};
					content = render(renderProps);
				} else {
					content = children;
				}

				return (
					<Animated.View
						{...props}
						key={internalProps.key}
						style={getCombinedHoverStyle(internalProps)}
					>
						{content}
					</Animated.View>
				);
			}
			: undefined
		),
		[
			draggable,
			noHover,
			renderHoverContent,
			renderContent,
			getCombinedHoverStyle,
			props,
			children,
		],
	);

	// Report updates to our protocol callbacks when we have an id and whenever the props change.
	useEffect(
		() => {
			updateViewProtocol({
				id,
				protocol: {
					onDragStart,
					onDrag,
					onDragEnter,
					onDragOver,
					onDragExit,
					onDragEnd,
					onDragDrop,
					onSnapbackEnd,
					onReceiveDragEnter,
					onReceiveDragOver,
					onReceiveDragExit,
					onReceiveDragDrop,
					onMonitorDragStart,
					onMonitorDragEnter,
					onMonitorDragOver,
					onMonitorDragExit,
					onMonitorDragEnd,
					onMonitorDragDrop,
					animateSnapback,
					snapbackDelay,
					snapbackDuration,
					snapbackAnimator,
					internalRenderHoverView,
					draggable,
					receptive,
					monitoring,
					lockDragXPosition,
					lockDragYPosition,
					dragPayload: dragPayload ?? payload,
					receiverPayload: receiverPayload ?? payload,
				},
			});
		},
		[
			id,
			updateViewProtocol,
			children,
			onDragStart,
			onDrag,
			onDragEnter,
			onDragOver,
			onDragExit,
			onDragEnd,
			onDragDrop,
			onSnapbackEnd,
			onReceiveDragEnter,
			onReceiveDragOver,
			onReceiveDragExit,
			onReceiveDragDrop,
			onMonitorDragStart,
			onMonitorDragEnter,
			onMonitorDragOver,
			onMonitorDragExit,
			onMonitorDragEnd,
			onMonitorDragDrop,
			animateSnapback,
			snapbackDelay,
			snapbackDuration,
			snapbackAnimator,
			payload,
			dragPayload,
			receiverPayload,
			draggable,
			receptive,
			monitoring,
			lockDragXPosition,
			lockDragYPosition,
			internalRenderHoverView,
		],
	);

	// Connect gesture state change handling into Drax context, tied to this id.
	const onHandlerStateChange = useCallback(
		({ nativeEvent }: LongPressGestureHandlerStateChangeEvent) => handleGestureStateChange(id, nativeEvent),
		[id, handleGestureStateChange],
	);

	// Create throttled gesture event handler, tied to this id.
	const throttledHandleGestureEvent = useMemo(
		() => throttle(
			(event: DraxGestureEvent) => {
				// Pass the event up to the Drax context.
				handleGestureEvent(id, event);
			},
			10,
		),
		[id, handleGestureEvent],
	);

	// Connect gesture event handling into Drax context, extracting nativeEvent.
	const onGestureEvent = useCallback(
		({ nativeEvent }: LongPressGestureHandlerGestureEvent) => throttledHandleGestureEvent(nativeEvent),
		[throttledHandleGestureEvent],
	);

	// Build a callback which will report our measurements to Drax context,
	// onMeasure, and an optional measurement handler.
	const buildMeasureCallback = useCallback(
		(measurementHandler?: DraxViewMeasurementHandler) => (
			(x?: number, y?: number, width?: number, height?: number) => {
				/*
				 * In certain cases (on Android), all of these values can be
				 * undefined when the view is not on screen; This should not
				 * happen with the measurement functions we're using, but just
				 * for the sake of paranoia, we'll check and use undefined
				 * for the entire measurements object.
				 */
				const measurements: DraxViewMeasurements | undefined = (
					height === undefined
						? undefined
						: {
							height,
							x: x!,
							y: y!,
							width: width!,
						}
				);
				measurementsRef.current = measurements;
				updateViewMeasurements({ id, measurements });
				onMeasure?.(measurements);
				measurementHandler?.(measurements);
			}
		),
		[id, updateViewMeasurements, onMeasure],
	);

	// Callback which will report our measurements to Drax context and onMeasure.
	const updateMeasurements = useMemo(
		() => buildMeasureCallback(),
		[buildMeasureCallback],
	);

	// Measure and report our measurements to Drax context, onMeasure, and an
	// optional measurement handler on demand.
	const measureWithHandler = useCallback(
		(measurementHandler?: DraxViewMeasurementHandler) => {
			const view = viewRef.current;
			if (view) {
				if (parentViewRef.current) {
					const measureCallback = measurementHandler
						? buildMeasureCallback(measurementHandler)
						: updateMeasurements;
					// console.log('definitely measuring in reference to something');
					view.measureLayout(
						// @ts-ignore
						parentViewRef.current,
						measureCallback,
						() => {
							// console.log('Failed to measure Drax view in relation to parent nodeHandle');
						},
					);
				} else {
					// console.log('No parent nodeHandle to measure Drax view in relation to');
				}
			} else {
				// console.log('No view to measure');
			}
		},
		[
			parentViewRef,
			buildMeasureCallback,
			updateMeasurements,
		],
	);

	// Measure and send our measurements to Drax context and onMeasure, used when this view finishes layout.
	const onLayout = useCallback(
		() => {
			// console.log(`onLayout ${id}`);
			measureWithHandler();
		},
		[measureWithHandler],
	);

	// Establish dimensions/orientation change handler when necessary.
	useEffect(
		() => {
			const handler = (/* { screen: { width, height } }: { screen: ScaledSize } */) => {
				// console.log(`Dimensions changed to ${width}/${height}`);
				setTimeout(measureWithHandler, 100);
			};
			const listener = Dimensions.addEventListener('change', handler);
			return () => listener.remove();
		},
		[measureWithHandler],
	);

	// Register and unregister externally when necessary.
	useEffect(
		() => {
			if (registration) { // Register externally when registration is set.
				registration({
					id,
					measure: measureWithHandler,
				});
				return () => registration(undefined); // Unregister when we unmount or registration changes.
			}
			return undefined;
		},
		[id, registration, measureWithHandler],
	);

	// Get the render-related state for rendering.
	const viewState = getViewState(id);
	const trackingStatus = getTrackingStatus();

	// Get full render props for non-hovering view content.
	const getRenderContentProps = useCallback(
		(): DraxRenderContentProps => {
			const measurements = measurementsRef.current;
			const dimensions = measurements && extractDimensions(measurements);
			return {
				viewState,
				trackingStatus,
				children,
				dimensions,
				hover: false,
			};
		},
		[
			viewState,
			trackingStatus,
			children,
		],
	);

	// Combined style for current render-related state.
	const combinedStyle = useMemo(
		() => {
			const {
				dragStatus = DraxViewDragStatus.Inactive,
				receiveStatus = DraxViewReceiveStatus.Inactive,
			} = viewState ?? {};
			const {
				dragging: anyDragging,
				receiving: anyReceiving,
			} = trackingStatus;

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
		},
		[
			viewState,
			trackingStatus,
			style,
			dragInactiveStyle,
			draggingStyle,
			draggingWithReceiverStyle,
			draggingWithoutReceiverStyle,
			dragReleasedStyle,
			receivingStyle,
			receiverInactiveStyle,
			otherDraggingStyle,
			otherDraggingWithReceiverStyle,
			otherDraggingWithoutReceiverStyle,
		],
	);

	// The rendered React children of this view.
	const renderedChildren = useMemo(
		() => {
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
					<DraxSubprovider parent={{ id, nodeViewRef: viewRef }}>
						{content}
					</DraxSubprovider>
				);
			}
			return content;
		},
		[
			renderContent,
			getRenderContentProps,
			children,
			isParent,
			id,
			viewRef,
		],
	);

	const setViewRefs = useCallback(
		(ref: View | null) => {
			viewRef.current = ref;
		},
		[],
	);

	return (
		<LongPressGestureHandler
			maxDist={Number.MAX_SAFE_INTEGER}
			shouldCancelWhenOutside={false}
			minDurationMs={longPressDelay}
			onHandlerStateChange={onHandlerStateChange}
			onGestureEvent={onGestureEvent as any /* Workaround incorrect typings. */}
			enabled={draggable}
		>
			<Animated.View
				{...props}
				style={combinedStyle}
				ref={setViewRefs}
				onLayout={onLayout}
				collapsable={false}
			>
				{renderedChildren}
			</Animated.View>
		</LongPressGestureHandler>
	);
};
