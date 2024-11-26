"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraxProvider = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const hooks_1 = require("./hooks");
const DraxContext_1 = require("./DraxContext");
const types_1 = require("./types");
const math_1 = require("./math");
const DraxProvider = ({ debug = false, style = styles.provider, children, }) => {
    const { getViewState, getTrackingStatus, dispatch, } = (0, hooks_1.useDraxState)();
    const { getAbsoluteViewData, getTrackingDragged, getTrackingReceiver, getTrackingMonitorIds, getTrackingMonitors, getDragPositionData, findMonitorsAndReceiver, getHoverItems, registerView, updateViewProtocol, updateViewMeasurements, resetReceiver, resetDrag, startDrag, updateDragPosition, updateReceiver, setMonitorIds, unregisterView, } = (0, hooks_1.useDraxRegistry)(dispatch);
    const rootNodeHandleRef = (0, react_1.useRef)(null);
    const handleGestureStateChange = (0, react_1.useCallback)((id, event) => {
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
            }
            else if (debug) {
                console.log(`Ignoring gesture for view id ${id} because view data was not found`);
            }
            return;
        }
        /*
         * Documentation on gesture handler state flow used in switches below:
         * https://github.com/kmagiera/react-native-gesture-handler/blob/master/docs/state.md
         */
        const { state: gestureState, // Used in switch logic below; see block comment above.
        x: grabX, // x position of touch relative to dragged view
        y: grabY, // y position of touch relative to dragged view
        absoluteX: parentX, // x position of touch relative to parent of dragged view
        absoluteY: parentY, // y position of touch relative to parent of dragged view
         } = event;
        /** Position of touch relative to parent of dragged view */
        const dragParentPosition = { x: parentX, y: parentY };
        const { x: absoluteX, // absolute x position of dragged view within DraxProvider
        y: absoluteY, // absolute y position of dragged view within DraxProvider
        width, // width of dragged view
        height, // height of dragged view
         } = draggedData.absoluteMeasurements;
        if (dragged) {
            // Case 3: This is the view we're already dragging.
            let endDrag = false;
            let cancelled = false;
            let shouldDrop = false;
            switch (gestureState) {
                case react_native_gesture_handler_1.State.BEGAN:
                    // This should never happen, but we'll do nothing.
                    if (debug) {
                        console.log(`Received unexpected BEGAN event for dragged view id ${id}`);
                    }
                    break;
                case react_native_gesture_handler_1.State.ACTIVE:
                    // This should also never happen, but we'll do nothing.
                    if (debug) {
                        console.log(`Received unexpected ACTIVE event for dragged view id ${id}`);
                    }
                    break;
                case react_native_gesture_handler_1.State.CANCELLED:
                    // The gesture handler system has cancelled, so end the drag without dropping.
                    if (debug) {
                        console.log(`Stop dragging view id ${id} (CANCELLED)`);
                    }
                    endDrag = true;
                    cancelled = true;
                    break;
                case react_native_gesture_handler_1.State.FAILED:
                    // This should never happen, but let's end the drag without dropping.
                    if (debug) {
                        console.log(`Received unexpected FAILED event for dragged view id ${id}`);
                    }
                    endDrag = true;
                    cancelled = true;
                    break;
                case react_native_gesture_handler_1.State.END:
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
            // Get the absolute position data for the drag touch.
            const dragPositionData = getDragPositionData({
                parentPosition: dragParentPosition,
                draggedMeasurements: draggedData.absoluteMeasurements,
                lockXPosition: draggedData.protocol.lockDragXPosition,
                lockYPosition: draggedData.protocol.lockDragYPosition,
            });
            if (!dragPositionData) {
                // Failed to get absolute position of drag. This should never happen.
                return;
            }
            const { dragAbsolutePosition, dragTranslation, dragTranslationRatio, } = dragPositionData;
            // Prepare event data for dragged view.
            const eventDataDragged = {
                id,
                dragTranslationRatio,
                parentId: draggedData.parentId,
                payload: draggedData.protocol.dragPayload,
                dragOffset: dragged.tracking.dragOffset,
                grabOffset: dragged.tracking.grabOffset,
                grabOffsetRatio: dragged.tracking.grabOffsetRatio,
                hoverPosition: dragged.tracking.hoverPosition,
            };
            // Get data for receiver view (if any) before we reset.
            const receiver = getTrackingReceiver();
            // Get the monitors (if any) before we reset.
            const monitors = getTrackingMonitors();
            // Snapback target, which may be modified by responses from protocols.
            let snapbackTarget = types_1.DraxSnapbackTargetPreset.Default;
            if (receiver && shouldDrop) {
                // It's a successful drop into a receiver, let them both know, and check for response.
                let responded = false;
                // Prepare event data for receiver view.
                const eventDataReceiver = {
                    id: receiver.id,
                    parentId: receiver.data.parentId,
                    payload: receiver.data.protocol.receiverPayload,
                    receiveOffset: receiver.tracking.receiveOffset,
                    receiveOffsetRatio: receiver.tracking.receiveOffsetRatio,
                };
                const eventData = {
                    dragAbsolutePosition,
                    dragTranslation,
                    dragged: eventDataDragged,
                    receiver: eventDataReceiver,
                };
                let response = draggedData.protocol.onDragDrop?.(eventData);
                if (response !== undefined) {
                    snapbackTarget = response;
                    responded = true;
                }
                response = receiver.data.protocol.onReceiveDragDrop?.(eventData);
                if (!responded && response !== undefined) {
                    snapbackTarget = response;
                    responded = true;
                }
                // And let any active monitors know too.
                if (monitors.length > 0) {
                    monitors.forEach(({ data: monitorData }) => {
                        if (monitorData) {
                            const { relativePosition: monitorOffset, relativePositionRatio: monitorOffsetRatio, } = (0, math_1.getRelativePosition)(dragAbsolutePosition, monitorData.absoluteMeasurements);
                            response = monitorData.protocol.onMonitorDragDrop?.({
                                ...eventData,
                                monitorOffset,
                                monitorOffsetRatio,
                            });
                        }
                        if (!responded && response !== undefined) {
                            snapbackTarget = response;
                            responded = true;
                        }
                    });
                }
            }
            else {
                // There is no receiver, or the drag was cancelled.
                // Prepare common event data.
                const eventData = {
                    dragAbsolutePosition,
                    dragTranslation,
                    cancelled,
                    dragged: eventDataDragged,
                };
                // Let the dragged item know the drag ended, and capture any response.
                let responded = false;
                let response = draggedData.protocol.onDragEnd?.(eventData);
                if (response !== undefined) {
                    snapbackTarget = response;
                    responded = true;
                }
                // Prepare receiver event data, or undefined if no receiver.
                const eventReceiverData = receiver && {
                    id: receiver.id,
                    parentId: receiver.data.parentId,
                    payload: receiver.data.protocol.receiverPayload,
                    receiveOffset: receiver.tracking.receiveOffset,
                    receiveOffsetRatio: receiver.tracking.receiveOffsetRatio,
                };
                // If there is a receiver but drag was cancelled, let it know the drag exited it.
                receiver?.data.protocol.onReceiveDragExit?.({
                    ...eventData,
                    receiver: eventReceiverData,
                });
                // And let any active monitors know too.
                if (monitors.length > 0) {
                    const monitorEventData = {
                        ...eventData,
                        receiver: eventReceiverData,
                    };
                    monitors.forEach(({ data: monitorData }) => {
                        const { relativePosition: monitorOffset, relativePositionRatio: monitorOffsetRatio, } = (0, math_1.getRelativePosition)(dragAbsolutePosition, monitorData.absoluteMeasurements);
                        response = monitorData.protocol.onMonitorDragEnd?.({
                            ...monitorEventData,
                            monitorOffset,
                            monitorOffsetRatio,
                            cancelled,
                        });
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
            case react_native_gesture_handler_1.State.ACTIVE:
                shouldStartDrag = true;
                break;
            case react_native_gesture_handler_1.State.BEGAN:
                // Do nothing until the gesture becomes active.
                break;
            case react_native_gesture_handler_1.State.CANCELLED:
            case react_native_gesture_handler_1.State.FAILED:
            case react_native_gesture_handler_1.State.END:
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
             * To determine drag start position in absolute coordinates, we add:
             *   absolute coordinates of dragged view
             *   + relative coordinates of touch within view
             *
             * NOTE: if view is transformed, these will be wrong.
             */
            const dragAbsolutePosition = {
                x: absoluteX + grabX,
                y: absoluteY + grabY,
            };
            const grabOffset = { x: grabX, y: grabY };
            const grabOffsetRatio = {
                x: grabX / width,
                y: grabY / height,
            };
            const { dragOffset, dragTranslation, dragTranslationRatio, hoverPosition, } = startDrag({
                grabOffset,
                grabOffsetRatio,
                dragAbsolutePosition,
                dragParentPosition,
                draggedId: id,
            });
            if (debug) {
                console.log(`Start dragging view id ${id} at absolute position (${dragAbsolutePosition.x}, ${dragAbsolutePosition.y})`);
            }
            const eventData = {
                dragAbsolutePosition,
                dragTranslation,
                dragged: {
                    id,
                    dragOffset,
                    grabOffset,
                    grabOffsetRatio,
                    hoverPosition,
                    dragTranslationRatio,
                    parentId: draggedData.parentId,
                    payload: draggedData.protocol.dragPayload,
                },
            };
            draggedData.protocol.onDragStart?.(eventData);
            // Find which monitors and receiver this drag is over.
            const { monitors } = findMonitorsAndReceiver(dragAbsolutePosition, id);
            // Notify monitors and update monitor tracking.
            if (monitors.length > 0) {
                const newMonitorIds = monitors.map(({ id: monitorId, data: monitorData, relativePosition: monitorOffset, relativePositionRatio: monitorOffsetRatio, }) => {
                    const monitorEventData = {
                        ...eventData,
                        monitorOffset,
                        monitorOffsetRatio,
                    };
                    monitorData.protocol.onMonitorDragStart?.(monitorEventData);
                    return monitorId;
                });
                setMonitorIds(newMonitorIds);
            }
        }
    }, [
        getAbsoluteViewData,
        getDragPositionData,
        getTrackingDragged,
        getTrackingReceiver,
        getTrackingMonitors,
        resetDrag,
        startDrag,
        findMonitorsAndReceiver,
        setMonitorIds,
        debug,
    ]);
    const handleGestureEvent = (0, react_1.useCallback)((id, event) => {
        if (debug) {
            console.log(`handleGestureEvent(${id}, ${JSON.stringify(event, null, 2)})`);
        }
        const dragged = getTrackingDragged();
        if (dragged === undefined) {
            // We're not tracking any gesture yet.
            if (debug) {
                console.log('Ignoring gesture event because we have not initialized a drag');
            }
            return;
        }
        if (dragged.id !== id) {
            // This is not a gesture we're tracking. We don't support multiple simultaneous drags.
            if (debug) {
                console.log('Ignoring gesture event because this is not the view being dragged');
            }
            return;
        }
        const { absoluteX: parentX, // x position of touch relative to parent of dragged view
        absoluteY: parentY, // y position of touch relative to parent of dragged view
         } = event;
        if (debug) {
            console.log(`Dragged item absolute coordinates (${dragged.data.absoluteMeasurements.x}, ${dragged.data.absoluteMeasurements.y})`);
            console.log(`Native event in-view touch coordinates: (${event.x}, ${event.y})`);
        }
        /** Position of touch relative to parent of dragged view */
        const parentPosition = { x: parentX, y: parentY };
        // Get the absolute position data for the drag touch.
        const dragPositionData = getDragPositionData({
            parentPosition,
            draggedMeasurements: dragged.data.absoluteMeasurements,
            lockXPosition: dragged.data.protocol.lockDragXPosition,
            lockYPosition: dragged.data.protocol.lockDragYPosition,
        });
        if (!dragPositionData) {
            // Failed to get drag position data. This should never happen.
            return;
        }
        const { dragAbsolutePosition, dragTranslation, dragTranslationRatio, } = dragPositionData;
        if (debug) {
            console.log(`Drag at absolute coordinates (${dragAbsolutePosition.x}, ${dragAbsolutePosition.y})\n`);
            console.log(`Drag translation (${dragTranslation.x}, ${dragTranslation.y})`);
            console.log(`Drag translation ratio (${dragTranslationRatio.x}, ${dragTranslationRatio.y})`);
        }
        // Find which monitors and receiver this drag is over.
        const { monitors, receiver } = findMonitorsAndReceiver(dragAbsolutePosition, dragged.id);
        // Get the previous receiver, if any.
        const oldReceiver = getTrackingReceiver();
        // Always update the drag position.
        updateDragPosition(dragAbsolutePosition);
        const draggedProtocol = dragged.data.protocol;
        // Prepare event data for dragged view.
        const eventDataDragged = {
            dragTranslationRatio,
            id: dragged.id,
            parentId: dragged.data.parentId,
            payload: dragged.data.protocol.dragPayload,
            dragOffset: dragged.tracking.dragOffset,
            grabOffset: dragged.tracking.grabOffset,
            grabOffsetRatio: dragged.tracking.grabOffsetRatio,
            hoverPosition: dragged.tracking.hoverPosition,
        };
        // Prepare base drag event data.
        const dragEventData = {
            dragAbsolutePosition,
            dragTranslation,
            dragged: eventDataDragged,
        };
        // Prepare event data stub for monitor updates later so we can optionally add receiver.
        const monitorEventDataStub = {
            ...dragEventData,
        };
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
            const receiverProtocol = receiver.data.protocol;
            // Update the receiver.
            const trackingReceiver = updateReceiver(receiver, dragged);
            if (trackingReceiver === undefined) {
                // This should never happen, but just in case.
                if (debug) {
                    console.log('Failed to update tracking receiver');
                }
                return;
            }
            // Prepare event data for receiver view.
            const eventDataReceiver = {
                id: receiver.id,
                parentId: receiver.data.parentId,
                payload: receiver.data.protocol.receiverPayload,
                receiveOffset: trackingReceiver.receiveOffset,
                receiveOffsetRatio: trackingReceiver.receiveOffsetRatio,
            };
            // Add receiver data to monitor event stub.
            monitorEventDataStub.receiver = eventDataReceiver;
            // Prepare event data for callbacks.
            const eventData = {
                ...dragEventData,
                receiver: eventDataReceiver,
            };
            if (oldReceiver) {
                if (receiver.id === oldReceiver.id) {
                    // Case 1: new exists, old exists, new is the same as old
                    // Call the protocol event callbacks for dragging over the receiver.
                    draggedProtocol.onDragOver?.(eventData);
                    receiverProtocol.onReceiveDragOver?.(eventData);
                }
                else {
                    // Case 2: new exists, old exists, new is different from old
                    // Prepare event data with old receiver.
                    const eventDataOldReceiver = {
                        ...dragEventData,
                        receiver: {
                            id: oldReceiver.id,
                            parentId: oldReceiver.data.parentId,
                            payload: oldReceiver.data.protocol.receiverPayload,
                            receiveOffset: oldReceiver.tracking.receiveOffset,
                            receiveOffsetRatio: oldReceiver.tracking.receiveOffsetRatio,
                        },
                    };
                    // Call the protocol event callbacks for exiting the old receiver...
                    draggedProtocol.onDragExit?.(eventDataOldReceiver);
                    oldReceiver.data.protocol.onReceiveDragExit?.({
                        ...eventDataOldReceiver,
                        cancelled: false,
                    });
                    // ...and entering the new receiver.
                    draggedProtocol.onDragEnter?.(eventData);
                    receiverProtocol.onReceiveDragEnter?.(eventData);
                }
            }
            else {
                // Case 3: new exists, old does not exist
                // Call the protocol event callbacks for entering the new receiver.
                draggedProtocol.onDragEnter?.(eventData);
                receiverProtocol.onReceiveDragEnter?.(eventData);
            }
        }
        else if (oldReceiver) {
            // Case 4: new does not exist, old exists
            // Reset the old receiver.
            resetReceiver();
            // Prepare event data with old receiver.
            const eventData = {
                ...dragEventData,
                receiver: {
                    id: oldReceiver.id,
                    parentId: oldReceiver.data.parentId,
                    payload: oldReceiver.data.protocol.receiverPayload,
                    receiveOffset: oldReceiver.tracking.receiveOffset,
                    receiveOffsetRatio: oldReceiver.tracking.receiveOffsetRatio,
                },
            };
            // Call the protocol event callbacks for exiting the old receiver.
            draggedProtocol.onDragExit?.(eventData);
            oldReceiver.data.protocol.onReceiveDragExit?.({
                ...eventData,
                cancelled: false,
            });
        }
        else {
            // Case 5: new does not exist, old does not exist
            // Call the protocol event callback for dragging.
            draggedProtocol.onDrag?.(dragEventData);
        }
        // Notify monitors and update monitor tracking, if necessary.
        const prevMonitorIds = getTrackingMonitorIds();
        if (monitors.length > 0 || prevMonitorIds.length > 0) {
            const newMonitorIds = monitors.map(({ id: monitorId, data: monitorData, relativePosition: monitorOffset, relativePositionRatio: monitorOffsetRatio, }) => {
                const monitorEventData = {
                    ...monitorEventDataStub,
                    monitorOffset,
                    monitorOffsetRatio,
                };
                if (prevMonitorIds.includes(monitorId)) {
                    // Drag was already over this monitor.
                    monitorData.protocol.onMonitorDragOver?.(monitorEventData);
                }
                else {
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
                    const { relativePosition: monitorOffset, relativePositionRatio: monitorOffsetRatio, } = (0, math_1.getRelativePosition)(dragAbsolutePosition, monitorData.absoluteMeasurements);
                    monitorData.protocol.onMonitorDragExit?.({
                        ...monitorEventDataStub,
                        monitorOffset,
                        monitorOffsetRatio,
                    });
                }
            });
            setMonitorIds(newMonitorIds);
        }
    }, [
        getAbsoluteViewData,
        getDragPositionData,
        getTrackingDragged,
        getTrackingReceiver,
        getTrackingMonitorIds,
        findMonitorsAndReceiver,
        resetReceiver,
        updateDragPosition,
        updateReceiver,
        setMonitorIds,
        debug,
    ]);
    const contextValue = {
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
    const hoverViews = [];
    const trackingStatus = getTrackingStatus();
    getHoverItems().forEach(({ id, key, internalRenderHoverView, hoverPosition, dimensions, }) => {
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
    const setRootNodeHandleRef = (0, react_1.useCallback)((ref) => {
        rootNodeHandleRef.current = ref && (0, react_native_1.findNodeHandle)(ref);
    }, []);
    return (react_1.default.createElement(DraxContext_1.DraxContext.Provider, { value: contextValue },
        react_1.default.createElement(react_native_1.View, { style: style, ref: setRootNodeHandleRef },
            children,
            react_1.default.createElement(react_native_1.View, { style: react_native_1.StyleSheet.absoluteFill, pointerEvents: "none" }, hoverViews))));
};
exports.DraxProvider = DraxProvider;
const styles = react_native_1.StyleSheet.create({
    provider: {
        flex: 1,
    },
});
