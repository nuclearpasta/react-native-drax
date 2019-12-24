import React, {
	FunctionComponent,
	useCallback,
	ReactNodeArray,
	useRef,
} from 'react';
import { View, StyleSheet, findNodeHandle } from 'react-native';
import { State } from 'react-native-gesture-handler';

import { useDraxState, useDraxRegistry } from './hooks';
import { DraxContext } from './DraxContext';
import {
	DraxProviderProps,
	DraxContextValue,
	DraxGestureStateChangeEvent,
	DraxGestureEvent,
	DraxSnapbackTarget,
	DraxSnapbackTargetPreset,
} from './types';
import { getRelativePosition } from './math';

export const DraxProvider: FunctionComponent<DraxProviderProps> = ({ debug = false, children }) => {
	const {
		getViewState,
		getTrackingStatus,
		dispatch,
	} = useDraxState();
	const {
		getAbsoluteViewData,
		getTrackingDragged,
		getTrackingReceiver,
		getTrackingMonitorIds,
		getTrackingMonitors,
		getDragPositionData,
		findMonitorsAndReceiver,
		getHoverItems,
		registerView,
		updateViewProtocol,
		updateViewMeasurements,
		resetReceiver,
		resetDrag,
		startDrag,
		updateDragPosition,
		updateReceiver,
		setMonitorIds,
		unregisterView,
	} = useDraxRegistry(dispatch);

	const rootNodeHandleRef = useRef<number | null>(null);

	const handleGestureStateChange = useCallback(
		(id: string, event: DraxGestureStateChangeEvent) => {
			if (debug) {
				console.log(`handleGestureStateChange(${id}, ${JSON.stringify(event, null, 2)})`);
			}

			// Get info on the currently dragged view, if any.
			const dragged = getTrackingDragged();

			/*
			 * Case 1: We're already dragging a different view.
			 * Case 2: This view can't be found/measured.
			 * Case 3: This is the view we're already dragging.
			 *   Case 3a: The drag is not ending.
			 *   Case 3b: The drag is ending.
			 * Case 4: We're not already dragging a view.
			 *   Case 4a: This view is not draggable.
			 *   Case 4b: No drag is starting.
			 *   Case 4c: A drag is starting.
			 */

			if (dragged && dragged.id !== id) {
				// Case 1: We're already dragging a different view.

				if (debug) {
					console.log(`Ignoring gesture state change because another view is being dragged: ${dragged.id}`);
				}
				return;
			}

			const draggedData = dragged?.data ?? getAbsoluteViewData(id);

			if (!draggedData) {
				// Case 2: This view can't be found/measured.

				if (dragged?.id === id) {
					if (debug) {
						console.log(`Data for currently dragged view id ${id} could not be found`);
						// TODO: reset drag and notify monitors
					}
				} else if (debug) {
					console.log(`Ignoring gesture for view id ${id} because view data was not found`);
				}
				return;
			}

			/*
			 * Documentation on gesture handler state flow used in switches below:
			 * https://github.com/kmagiera/react-native-gesture-handler/blob/master/docs/state.md
			 */

			const {
				state: gestureState, // Used in switch logic below; see block comment above.
				x: grabX, // x position of touch relative to dragged view
				y: grabY, // y position of touch relative to dragged view
				absoluteX: parentX, // x position of touch relative to parent of dragged view
				absoluteY: parentY, // y position of touch relative to parent of dragged view
			} = event;

			/** Position of touch relative to parent of dragged view */
			const parentPosition = { x: parentX, y: parentY };

			const {
				x: screenX, // x position of dragged view within screen
				y: screenY, // y position of dragged view within screen
				width, // width of dragged view
				height, // height of dragged view
			} = draggedData.absoluteMeasurements;

			if (dragged) {
				// Case 3: This is the view we're already dragging.

				let endDrag = false;
				let cancelled = false;
				let shouldDrop = false;

				switch (gestureState) {
					case State.BEGAN:
						// This should never happen, but we'll do nothing.
						if (debug) {
							console.log(`Received unexpected BEGAN event for dragged view id ${id}`);
						}
						break;
					case State.ACTIVE:
						// This should also never happen, but we'll do nothing.
						if (debug) {
							console.log(`Received unexpected ACTIVE event for dragged view id ${id}`);
						}
						break;
					case State.CANCELLED:
						// The gesture handler system has cancelled, so end the drag without dropping.
						if (debug) {
							console.log(`Stop dragging view id ${id} (CANCELLED)`);
						}
						endDrag = true;
						cancelled = true;
						break;
					case State.FAILED:
						// This should never happen, but let's end the drag without dropping.
						if (debug) {
							console.log(`Received unexpected FAILED event for dragged view id ${id}`);
						}
						endDrag = true;
						cancelled = true;
						break;
					case State.END:
						// User has ended the gesture, so end the drag, dropping into receiver if applicable.
						if (debug) {
							console.log(`Stop dragging view id ${id} (END)`);
						}
						endDrag = true;
						shouldDrop = true;
						break;
					default:
						if (debug) {
							console.warn(`Unrecognized gesture state ${gestureState} for dragged view`);
						}
						break;
				}

				if (!endDrag) {
					// Case 3a: The drag is not ending.

					return;
				}

				// Case 3b: The drag is ending.

				// Get the absolute screen position of the drag touch.
				const { screenPosition } = getDragPositionData(parentPosition) ?? {};

				if (!screenPosition) {
					// Failed to get screen position of drag. This should never happen.
					return;
				}

				// Get data for receiver view (if any) before we reset.
				const { id: receiverId, data: receiverData } = getTrackingReceiver() ?? {};

				// Get the monitors (if any) before we reset.
				const monitors = getTrackingMonitors();

				// Snapback target, which may be modified by responses from protocols.
				let snapbackTarget: DraxSnapbackTarget = DraxSnapbackTargetPreset.Default;

				if (receiverData && shouldDrop) {
					// It's a successful drop into a receiver, let them both know, and check for response.
					let responded = false;
					let response = draggedData.protocol.onDragDrop?.({
						screenPosition,
						receiver: {
							id: receiverId!,
							parentId: receiverData.parentId,
							payload: receiverData.protocol.receiverPayload,
						},
					});
					if (response !== undefined) {
						snapbackTarget = response;
						responded = true;
					}

					response = receiverData.protocol.onReceiveDragDrop?.({
						screenPosition,
						...getRelativePosition(screenPosition, receiverData.absoluteMeasurements),
						dragged: {
							id,
							parentId: draggedData.parentId,
							payload: draggedData.protocol.dragPayload,
						},
					});
					if (!responded && response !== undefined) {
						snapbackTarget = response;
						responded = true;
					}

					// And let any active monitors know too.
					if (monitors.length > 0) {
						const monitorEventData = {
							screenPosition,
							dragged: {
								id,
								parentId: draggedData.parentId,
								payload: draggedData.protocol.dragPayload,
							},
							receiver: {
								id: receiverId!,
								parentId: receiverData.parentId,
								payload: receiverData.protocol.receiverPayload,
							},
						};
						monitors.forEach(({ data: monitorData }) => {
							if (monitorData) {
								response = monitorData.protocol.onMonitorDragDrop?.({
									...monitorEventData,
									...getRelativePosition(screenPosition, monitorData.absoluteMeasurements),
								});
							}
							if (!responded && response !== undefined) {
								snapbackTarget = response;
								responded = true;
							}
						});
					}
				} else {
					// There is no receiver, or the drag was cancelled.

					// Let the dragged item know the drag ended, and capture any response.
					let responded = false;
					let response = draggedData.protocol.onDragEnd?.({ screenPosition, cancelled });
					if (response !== undefined) {
						snapbackTarget = response;
						responded = true;
					}

					// If there is a receiver but drag was cancelled, let it know the drag exited it.
					if (receiverData) {
						receiverData.protocol.onReceiveDragExit?.({
							screenPosition,
							...getRelativePosition(screenPosition, receiverData.absoluteMeasurements),
							dragged: {
								id,
								parentId: draggedData.parentId,
								payload: draggedData.protocol.dragPayload,
							},
							cancelled,
						});
					}

					// And let any active monitors know too.
					if (monitors.length > 0) {
						const monitorEventData = {
							screenPosition,
							dragged: {
								id,
								parentId: draggedData.parentId,
								payload: draggedData.protocol.dragPayload,
							},
							receiver: receiverData && {
								id: receiverId!,
								parentId: receiverData.parentId,
								payload: receiverData.protocol.receiverPayload,
							},
						};
						monitors.forEach(({ data: monitorData }) => {
							if (cancelled) {
								response = monitorData.protocol.onMonitorDragEnd?.({
									...monitorEventData,
									...getRelativePosition(screenPosition, monitorData.absoluteMeasurements),
									cancelled,
								});
							}
							if (!responded && response !== undefined) {
								snapbackTarget = response;
								responded = true;
							}
						});
					}
				}

				// Reset the drag.
				resetDrag(snapbackTarget);

				return;
			}

			// Case 4: We're not already dragging a view.

			if (!draggedData.protocol.draggable) {
				// Case 4a: This view is not draggable.

				return;
			}

			let shouldStartDrag = false;

			switch (gestureState) {
				case State.ACTIVE:
					shouldStartDrag = true;
					break;
				case State.BEGAN:
					// Do nothing until the gesture becomes active.
					break;
				case State.CANCELLED:
				case State.FAILED:
				case State.END:
					// Do nothing because we weren't tracking this gesture.
					break;
				default:
					if (debug) {
						console.warn(`Unrecognized gesture state ${gestureState} for non-dragged view id ${id}`);
					}
					break;
			}

			if (!shouldStartDrag) {
				// Case 4b: No drag is starting.

				return;
			}

			// Case 4c: A drag is starting.

			/*
			 * First, verify that the touch is still within the dragged view.
			 * Because we are using a LongPressGestureHandler with unlimited
			 * distance to handle the drag, it could be out of bounds before
			 * it even starts. (For some reason, LongPressGestureHandler does
			 * not provide us with a BEGAN state change event in iOS.)
			 */
			if (grabX >= 0 && grabY >= 0 && grabX < width && grabY < height) {
				/*
				 * To determine drag start position in screen coordinates, we add:
				 *   screen coordinates of dragged view
				 *   + relative coordinates of touch within view
				 *
				 * NOTE: if view is transformed, these will be wrong.
				 */
				const screenPosition = {
					x: screenX + grabX,
					y: screenY + grabY,
				};
				startDrag({
					screenStartPosition: screenPosition,
					parentStartPosition: parentPosition,
					draggedId: id,
					grabOffset: { x: grabX, y: grabY },
					grabOffsetRatio: {
						x: grabX / width,
						y: grabY / height,
					},
				});
				if (debug) {
					console.log(`Start dragging view id ${id} at screen position (${screenPosition.x}, ${screenPosition.y})`);
				}
				draggedData.protocol.onDragStart?.({ screenPosition });

				// TODO: find monitors and call onMonitorDragStart
			}
		},
		[
			getAbsoluteViewData,
			getDragPositionData,
			getTrackingDragged,
			getTrackingReceiver,
			getTrackingMonitors,
			resetDrag,
			startDrag,
			debug,
		],
	);

	const handleGestureEvent = useCallback(
		(id: string, event: DraxGestureEvent) => {
			if (debug) {
				console.log(`handleGestureEvent(${id}, ${JSON.stringify(event, null, 2)})`);
			}

			const dragged = getTrackingDragged();

			if (!dragged) {
				// We're not tracking any gesture yet.
				if (debug) {
					console.log('Ignoring gesture event because we have not initialized a drag');
				}
				return;
			}

			const { id: draggedId, data: draggedData } = dragged;

			if (draggedId !== id) {
				// This is not a gesture we're tracking. We don't support multiple simultaneous drags.
				if (debug) {
					console.log('Ignoring gesture event because this is not the view being dragged');
				}
				return;
			}

			if (!draggedData) {
				// The drag we're tracking is for a view that's no longer registered. Reset.
				resetDrag();
				return;
			}

			const {
				absoluteX: parentX, // x position of touch relative to parent of dragged view
				absoluteY: parentY, // y position of touch relative to parent of dragged view
			} = event;

			/** Position of touch relative to parent of dragged view */
			const parentPosition = { x: parentX, y: parentY };

			const { screenPosition, translation } = getDragPositionData(parentPosition) ?? {};

			if (debug) {
				console.log(`Dragged item screen coordinates (${draggedData.absoluteMeasurements.x}, ${draggedData.absoluteMeasurements.y})`);
				console.log(`Native event in-view touch coordinates: (${event.x}, ${event.y})`);
				console.log(`Drag translation (${translation?.x}, ${translation?.y})`);
				console.log(`Drag at screen coordinates (${screenPosition?.x}, ${screenPosition?.y})\n`);
			}

			if (!screenPosition || !translation) {
				// Failed to get drag position data. This should never happen.
				return;
			}

			// Find which monitors and receiver this drag is over.
			const { monitors, receiver } = findMonitorsAndReceiver(screenPosition, draggedId);

			// Get the previous receiver, if any.
			const { id: oldReceiverId, data: oldReceiverData } = getTrackingReceiver() ?? {};

			// Always update the drag screen position.
			updateDragPosition(screenPosition);

			const draggedProtocol = draggedData.protocol;
			const eventDataDragged = {
				id: draggedId,
				parentId: draggedData.parentId,
				payload: draggedData.protocol.dragPayload,
			};
			const eventDataReceiver = receiver && {
				id: receiver.id,
				parentId: receiver.data.parentId,
				payload: receiver.data.protocol.receiverPayload,
			};

			// Notify monitors and update monitor tracking, if necessary.
			const prevMonitorIds = getTrackingMonitorIds();
			if (monitors.length > 0 || prevMonitorIds.length > 0) {
				const baseMonitorEventData = {
					screenPosition,
					dragged: eventDataDragged,
					receiver: eventDataReceiver,
				};
				const newMonitorIds = monitors.map(({
					relativePosition,
					relativePositionRatio,
					id: monitorId,
					data: monitorData,
				}) => {
					const monitorEventData = {
						...baseMonitorEventData,
						relativePosition,
						relativePositionRatio,
					};
					if (prevMonitorIds.includes(monitorId)) {
						// Drag was already over this monitor.
						monitorData.protocol.onMonitorDragOver?.(monitorEventData);
					} else {
						// Drag is entering monitor.
						monitorData.protocol.onMonitorDragEnter?.(monitorEventData);
					}
					return monitorId;
				});
				prevMonitorIds.filter((monitorId) => !newMonitorIds.includes(monitorId))
					.forEach((monitorId) => {
						// Drag has exited monitor.
						const monitorData = getAbsoluteViewData(monitorId);
						if (monitorData) {
							monitorData.protocol.onMonitorDragExit?.({
								...baseMonitorEventData,
								...getRelativePosition(screenPosition, monitorData.absoluteMeasurements),
							});
						}
					});
				setMonitorIds(newMonitorIds);
			}

			/*
			 * Consider the following cases for new and old receiver ids:
			 * Case 1: new exists, old exists, new is the same as old
			 * Case 2: new exists, old exists, new is different from old
			 * Case 3: new exists, old does not exist
			 * Case 4: new does not exist, old exists
			 * Case 5: new does not exist, old does not exist
			 */

			if (receiver) {
				// New receiver exists.
				const { id: receiverId, data: receiverData } = receiver;
				const receiverProtocol = receiverData.protocol;

				const dragEventData = {
					screenPosition,
					receiver: eventDataReceiver!,
				};

				const receiveEventData = {
					screenPosition,
					relativePosition: receiver.relativePosition,
					relativePositionRatio: receiver.relativePositionRatio,
					dragged: eventDataDragged,
				};

				// Update the receiver.
				updateReceiver(receiver, dragged);

				if (oldReceiverId) {
					if (receiverId === oldReceiverId) {
						// Case 1: new exists, old exists, new is the same as old

						// Call the protocol event callbacks for dragging over the receiver.
						draggedProtocol.onDragOver?.(dragEventData);
						receiverProtocol.onReceiveDragOver?.(receiveEventData);
					} else {
						// Case 2: new exists, old exists, new is different from old

						// Call the protocol event callbacks for exiting the old receiver...
						draggedProtocol.onDragExit?.({
							screenPosition,
							receiver: {
								id: oldReceiverId,
								parentId: oldReceiverData?.parentId,
								payload: oldReceiverData?.protocol.receiverPayload,
							},
						});
						if (oldReceiverData) {
							oldReceiverData.protocol.onReceiveDragExit?.({
								screenPosition,
								...getRelativePosition(screenPosition, oldReceiverData.absoluteMeasurements),
								dragged: eventDataDragged,
								cancelled: false,
							});
						}

						// ...and entering the new receiver.
						draggedProtocol.onDragEnter?.(dragEventData);
						receiverProtocol.onReceiveDragEnter?.(receiveEventData);
					}
				} else {
					// Case 3: new exists, old does not exist

					// Call the protocol event callbacks for entering the new receiver.
					draggedProtocol.onDragEnter?.(dragEventData);
					receiverProtocol.onReceiveDragEnter?.(receiveEventData);
				}
			} else if (oldReceiverId) {
				// Case 4: new does not exist, old exists

				// Reset the old receiver.
				resetReceiver();

				// Call the protocol event callbacks for exiting the old receiver.
				draggedProtocol.onDragExit?.({
					screenPosition,
					receiver: {
						id: oldReceiverId,
						parentId: oldReceiverData?.parentId,
						payload: oldReceiverData?.protocol.receiverPayload,
					},
				});
				if (oldReceiverData) {
					oldReceiverData.protocol.onReceiveDragExit?.({
						screenPosition,
						...getRelativePosition(screenPosition, oldReceiverData.absoluteMeasurements),
						dragged: eventDataDragged,
						cancelled: false,
					});
				}
			} else {
				// Case 5: new does not exist, old does not exist

				// Call the protocol event callback for dragging.
				draggedProtocol.onDrag?.({ screenPosition });
			}
		},
		[
			getAbsoluteViewData,
			getDragPositionData,
			getTrackingDragged,
			getTrackingReceiver,
			getTrackingMonitorIds,
			findMonitorsAndReceiver,
			resetDrag,
			resetReceiver,
			updateDragPosition,
			updateReceiver,
			setMonitorIds,
			debug,
		],
	);

	const contextValue: DraxContextValue = {
		getViewState,
		getTrackingStatus,
		registerView,
		unregisterView,
		updateViewProtocol,
		updateViewMeasurements,
		handleGestureStateChange,
		handleGestureEvent,
		rootNodeHandleRef,
	};

	const hoverViews: ReactNodeArray = [];
	const trackingStatus = getTrackingStatus();
	getHoverItems().forEach(({
		id,
		key,
		internalRenderHoverView,
		hoverPosition,
		dimensions,
	}) => {
		const viewState = getViewState(id);
		if (viewState) {
			const hoverView = internalRenderHoverView({
				key,
				hoverPosition,
				viewState,
				trackingStatus,
				dimensions,
			});
			if (hoverView) {
				hoverViews.push(hoverView);
			}
		}
	});

	const setRootNodeHandleRef = useCallback(
		(ref: View | null) => {
			rootNodeHandleRef.current = ref && findNodeHandle(ref);
		},
		[],
	);

	return (
		<DraxContext.Provider value={contextValue}>
			<View
				style={StyleSheet.absoluteFill}
				ref={setRootNodeHandleRef}
			>
				{children}
				<View
					style={StyleSheet.absoluteFill}
					pointerEvents="none"
				>
					{hoverViews}
				</View>
			</View>
		</DraxContext.Provider>
	);
};
