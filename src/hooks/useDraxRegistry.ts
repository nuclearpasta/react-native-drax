import { useCallback, useRef, useMemo, useEffect } from "react";
import {
	withTiming,
	ReduceMotion,
	runOnJS,
	withDelay,
	AnimationCallback,
} from "react-native-reanimated";

import { actions } from "./useDraxState";
import {
	clipMeasurements,
	isPointInside,
	getRelativePosition,
	generateRandomId,
} from "../math";
import {
	INITIAL_REANIMATED_POSITION,
	defaultSnapbackDelay,
	defaultSnapbackDuration,
} from "../params";
import {
	DraxRegistry,
	DraxViewDragStatus,
	DraxViewReceiveStatus,
	DraxProtocol,
	RegisterViewPayload,
	UnregisterViewPayload,
	UpdateViewProtocolPayload,
	UpdateViewMeasurementsPayload,
	DraxViewData,
	DraxViewMeasurements,
	Position,
	DraxFoundAbsoluteViewEntry,
	StartDragPayload,
	DraxAbsoluteViewEntry,
	DraxAbsoluteViewData,
	DraxViewState,
	DraxStateDispatch,
	DraxTrackingRelease,
	DraxSnapbackTarget,
	DraxSnapbackTargetPreset,
	isPosition,
	GetDragPositionDataParams,
} from "../types";

/*
 * The registry functions mutate their registry parameter, so let's
 * disable the "no parameter reassignment" rule for the entire file:
 */

/** Create an initial empty Drax registry. */
const createInitialRegistry = (
	stateDispatch: DraxStateDispatch,
): DraxRegistry => ({
	stateDispatch,
	viewIds: [],
	viewDataById: {},
	drag: undefined,
	releaseIds: [],
	releaseById: {},
});

/** Create the initial empty protocol data for a newly registered view. */
const createInitialProtocol = (): DraxProtocol => ({
	draggable: false,
	receptive: false,
	monitoring: false,
	hoverPosition: INITIAL_REANIMATED_POSITION,
});

/** Get data for a registered view by its id. */
const getViewDataFromRegistry = (
	registry: DraxRegistry,
	id: string | undefined,
): DraxViewData | undefined =>
	id && registry.viewIds.includes(id) ? registry.viewDataById[id] : undefined;

/** Get absolute measurements for a registered view, incorporating parents and clipping. */
const getAbsoluteMeasurementsForViewFromRegistry = (
	registry: DraxRegistry,
	{ measurements, parentId }: DraxViewData,
	clipped: boolean = false,
): DraxViewMeasurements | undefined => {
	if (!measurements) {
		// console.log('Failed to get absolute measurements for view: no measurements');
		return undefined;
	}
	if (!parentId) {
		return measurements;
	}
	const parentViewData = getViewDataFromRegistry(registry, parentId);
	if (!parentViewData) {
		// console.log(`Failed to get absolute measurements for view: no view data for parent id ${parentId}`);
		return undefined;
	}
	const parentMeasurements = getAbsoluteMeasurementsForViewFromRegistry(
		registry,
		parentViewData,
		clipped,
	);
	if (!parentMeasurements) {
		// console.log(`Failed to get absolute measurements for view: no absolute measurements for parent id ${parentId}`);
		return undefined;
	}
	const { x, y, width, height } = measurements;
	const { x: parentX, y: parentY } = parentMeasurements;

	const { x: offsetX, y: offsetY } = parentViewData.protocol
		.scrollPositionValue || {
		x: 0,
		y: 0,
	};

	const abs: DraxViewMeasurements = {
		width,
		height,
		x: parentX + x - offsetX,
		y: parentY + y - offsetY,
	};
	return clipped ? clipMeasurements(abs, parentMeasurements) : abs;
};

/** Get data, including absolute measurements, for a registered view by its id. */
const getAbsoluteViewDataFromRegistry = (
	registry: DraxRegistry,
	id: string | undefined,
): DraxAbsoluteViewData | undefined => {
	const viewData = getViewDataFromRegistry(registry, id);
	if (!viewData) {
		// console.log(`No view data for id ${id}`);
		return undefined;
	}
	const absoluteMeasurements = getAbsoluteMeasurementsForViewFromRegistry(
		registry,
		viewData,
	);
	if (!absoluteMeasurements) {
		// console.log(`No absolute measurements for id ${id}`);
		return undefined;
	}
	return {
		...viewData,
		measurements: viewData.measurements!, // It must exist, since absoluteMeasurements is defined.
		absoluteMeasurements,
	};
};

/** Convenience function to return a view's id and absolute data. */
const getAbsoluteViewEntryFromRegistry = (
	registry: DraxRegistry,
	id: string | undefined,
): DraxAbsoluteViewEntry | undefined => {
	if (id === undefined) {
		return undefined;
	}
	const data = getAbsoluteViewDataFromRegistry(registry, id);
	return data && { id, data };
};

/**
 * Find all monitoring views and the latest receptive view that
 * contain the touch coordinates, excluding the specified view.
 */
const findMonitorsAndReceiverInRegistry = (
	registry: DraxRegistry,
	absolutePosition: Position,
	excludeViewId: string,
) => {
	const monitors: DraxFoundAbsoluteViewEntry[] = [];
	let receiver: DraxFoundAbsoluteViewEntry | undefined;

	// console.log(`find monitors and receiver for absolute position (${absolutePosition.x}, ${absolutePosition.y})`);
	registry.viewIds.forEach((targetId) => {
		// console.log(`checking target id ${targetId}`);
		if (targetId === excludeViewId) {
			// Don't consider the excluded view.
			// console.log('excluded');
			return;
		}

		const target = getViewDataFromRegistry(registry, targetId);

		if (!target) {
			// This should never happen, but just in case.
			// console.log('no view data found');
			return;
		}

		const { receptive, monitoring } = target.protocol;

		if (!receptive && !monitoring) {
			// Only consider receptive or monitoring views.
			// console.log('not receptive nor monitoring');
			return;
		}

		const absoluteMeasurements = getAbsoluteMeasurementsForViewFromRegistry(
			registry,
			target,
			true,
		);

		if (!absoluteMeasurements) {
			// Only consider views for which we have absolute measurements.
			// console.log('failed to find absolute measurements');
			return;
		}

		// console.log(`absolute measurements: ${JSON.stringify(absoluteMeasurements, null, 2)}`);

		if (isPointInside(absolutePosition, absoluteMeasurements)) {
			// Drag point is within this target.
			const foundView: DraxFoundAbsoluteViewEntry = {
				id: targetId,
				data: {
					...target,
					measurements: target.measurements!, // It must exist, since absoluteMeasurements is defined.
					absoluteMeasurements,
				},
				...getRelativePosition(absolutePosition, absoluteMeasurements),
			};

			if (monitoring) {
				// Add it to the list of monitors.
				monitors.push(foundView);
				// console.log('it\'s a monitor');
			}

			if (receptive) {
				// It's the latest receiver found.
				receiver = foundView;
				// console.log('it\'s a receiver');
			}
		}
	});
	return {
		monitors,
		receiver,
	};
};

/** Get id and data for the currently dragged view, if any. */
const getTrackingDraggedFromRegistry = (registry: DraxRegistry) => {
	const tracking = registry.drag;
	if (tracking !== undefined) {
		const viewEntry = getAbsoluteViewEntryFromRegistry(
			registry,
			tracking.draggedId,
		);
		if (viewEntry !== undefined) {
			return {
				...viewEntry,
				tracking,
			};
		}
	}
	return undefined;
};

/** Get id and data for the currently receiving view, if any. */
const getTrackingReceiverFromRegistry = (registry: DraxRegistry) => {
	const tracking = registry.drag?.receiver;
	if (tracking !== undefined) {
		const viewEntry = getAbsoluteViewEntryFromRegistry(
			registry,
			tracking.receiverId,
		);
		if (viewEntry !== undefined) {
			return {
				...viewEntry,
				tracking,
			};
		}
	}
	return undefined;
};

/** Get ids for all currently monitoring views. */
const getTrackingMonitorIdsFromRegistry = (registry: DraxRegistry) =>
	registry.drag?.monitorIds || [];

/** Get id and data for all currently monitoring views. */
const getTrackingMonitorsFromRegistry = (registry: DraxRegistry) =>
	registry.drag?.monitorIds
		.map((id) => getAbsoluteViewEntryFromRegistry(registry, id))
		.filter((value): value is DraxAbsoluteViewEntry => !!value) || [];

/** Get the array of hover items for dragged and released views */
const getHoverItemsFromRegistry = (
	registry: DraxRegistry,
	viewIds: string[],
) => {
	return viewIds.map((viewId) => {
		const releaseData = Object.values(registry.releaseById).find(
			(release) => release.viewId === viewId,
		);

		const scrollPosition = releaseData?.scrollPosition;
		const scrollPositionOffset = releaseData?.scrollPositionOffset;
		const viewData = getViewDataFromRegistry(registry, viewId);

		if (viewData) {
			return {
				id: viewId,
				...viewData,
				scrollPosition,
				scrollPositionOffset,
			};
		}
	});
};

/**
 * Get the absolute position of a drag already in progress from touch
 * coordinates within the immediate parent view of the dragged view.
 */
const getDragPositionDataFromRegistry = (
	registry: DraxRegistry,
	{
		parentPosition,
		draggedMeasurements,
		lockXPosition = false,
		lockYPosition = false,
	}: GetDragPositionDataParams,
) => {
	if (!registry.drag) {
		return undefined;
	}
	/*
	 * To determine drag position in absolute coordinates, we add:
	 *   absolute coordinates of drag start
	 *   + translation offset of drag
	 */
	const { absoluteStartPosition, parentStartPosition } = registry.drag;
	const dragTranslation = {
		x: lockXPosition ? 0 : parentPosition.x - parentStartPosition.x,
		y: lockYPosition ? 0 : parentPosition.y - parentStartPosition.y,
	};
	const dragTranslationRatio = {
		x: dragTranslation.x / draggedMeasurements.width,
		y: dragTranslation.y / draggedMeasurements.height,
	};
	const dragAbsolutePosition = {
		x: absoluteStartPosition.x + dragTranslation.x,
		y: absoluteStartPosition.y + dragTranslation.y,
	};
	return {
		dragAbsolutePosition,
		dragTranslation,
		dragTranslationRatio,
	};
};

/** Register a Drax view. */
const registerViewInRegistry = (
	registry: DraxRegistry,
	{ id, parentId, scrollPosition }: RegisterViewPayload,
) => {
	const { viewIds, viewDataById, stateDispatch } = registry;

	// Make sure not to duplicate registered view id.
	if (viewIds.indexOf(id) < 0) {
		viewIds.push(id);
	}

	// Maintain any existing view data.
	const existingData = getViewDataFromRegistry(registry, id);

	// console.log(`Register view ${id} with parent ${parentId}`);

	viewDataById[id] = {
		parentId,
		scrollPosition,
		protocol: existingData?.protocol ?? createInitialProtocol(),
		measurements: existingData?.measurements, // Starts undefined.
	};

	stateDispatch(actions.createViewState({ id }));
};

/** Update a view's protocol callbacks/data. */
const updateViewProtocolInRegistry = (
	registry: DraxRegistry,
	{ id, protocol }: UpdateViewProtocolPayload,
) => {
	const existingData = getViewDataFromRegistry(registry, id);
	if (existingData) {
		registry.viewDataById[id].protocol = protocol;
	}
};

/** Update a view's measurements. */
const updateViewMeasurementsInRegistry = (
	registry: DraxRegistry,
	{ id, measurements }: UpdateViewMeasurementsPayload,
) => {
	const existingData = getViewDataFromRegistry(registry, id);
	if (existingData) {
		// console.log(`Update ${id} measurements: @(${measurements?.x}, ${measurements?.y}) ${measurements?.width}x${measurements?.height}`);
		registry.viewDataById[id].measurements = measurements;
	}
};

/** Update a view's measurements. */
const updateHoverViewMeasurementsInRegistry = (
	registry: DraxRegistry,
	{ id, measurements }: UpdateViewMeasurementsPayload,
) => {
	const existingData = getViewDataFromRegistry(registry, id);
	if (existingData) {
		// console.log(`Update ${id} measurements: @(${measurements?.x}, ${measurements?.y}) ${measurements?.width}x${measurements?.height}`);
		registry.viewDataById[id].hoverMeasurements = measurements;
	}
};

/** Reset the receiver in drag tracking, if any. */
const resetReceiverInRegistry = ({ drag }: DraxRegistry) => {
	if (!drag) {
		return;
	}
	const { draggedId, receiver } = drag;
	if (!receiver) {
		// console.log('no receiver to clear');
		return;
	}
	// console.log('clearing receiver');
	drag.receiver = undefined;
	// stateDispatch(actions.updateTrackingStatus({ receiving: false }));
	// stateDispatch(actions.updateViewState({
	// 	id: draggedId,
	// 	viewStateUpdate: {
	// 		draggingOverReceiver: undefined,
	// 	},
	// }));
	// stateDispatch(actions.updateViewState({
	// 	id: receiver.receiverId,
	// 	viewStateUpdate: {
	// 		receiveStatus: DraxViewReceiveStatus.Inactive,
	// 		receiveOffset: undefined,
	// 		receiveOffsetRatio: undefined,
	// 		receivingDrag: undefined,
	// 	},
	// }));
};

/** Track a new release, returning its unique identifier. */
const createReleaseInRegistry = (
	registry: DraxRegistry,
	release: DraxTrackingRelease,
) => {
	const releaseId = generateRandomId();
	registry.releaseIds.push(releaseId);
	registry.releaseById[releaseId] = release;

	/**
	 * @todo remove BUG workaround
	 * @summary Force HoverView state to get the latest scrollPosition
	 */
	registerViewInRegistry(registry, { id: "fakefakefake" });
	unregisterViewInRegistry(registry, { id: "fakefakefake" });

	return releaseId;
};

/** Stop tracking a release, given its unique identifier. */
const deleteReleaseInRegistry = (registry: DraxRegistry, releaseId: string) => {
	registry.releaseIds = registry.releaseIds.filter((id) => id !== releaseId);
	delete registry.releaseById[releaseId];
};

/** Get the array of hover items for dragged and released views */
const getReleasesFromRegistry = (registry: DraxRegistry): string[] => {
	// Find all released view hover items, in order from oldest to newest.

	return registry.releaseIds.map((releaseId) => {
		const release = registry.releaseById[releaseId];
		const { viewId } = release;

		return viewId;
	});
};

/** Reset drag tracking, if any. */
const resetDragInRegistry = (
	registry: DraxRegistry,
	snapTarget: DraxSnapbackTarget = DraxSnapbackTargetPreset.Default,
) => {
	const { drag } = registry;

	if (!drag) {
		return;
	}

	const { draggedId, hoverPosition, receiver } = drag;

	const receiverData = getAbsoluteViewDataFromRegistry(
		registry,
		receiver?.receiverId,
	);
	const receiverParentData = getAbsoluteViewDataFromRegistry(
		registry,
		receiverData?.parentId,
	);
	resetReceiverInRegistry(registry);

	const draggedData = getAbsoluteViewDataFromRegistry(registry, draggedId);

	// Clear the drag.
	registry.drag = undefined;

	// Determine if/where/how to snapback.
	let snapping = false;
	if (snapTarget !== DraxSnapbackTargetPreset.None && draggedData) {
		const {
			onSnapEnd,
			snapAnimator,
			animateSnap = true,
			snapDelay = defaultSnapbackDelay,
			snapDuration = defaultSnapbackDuration,
		} = draggedData.protocol;

		const parentData = getAbsoluteViewDataFromRegistry(
			registry,
			draggedData?.parentId,
		);
		const scrollPosition =
			(receiverData
				? receiverParentData?.scrollPosition
				: parentData?.scrollPosition) || INITIAL_REANIMATED_POSITION;

		if (animateSnap) {
			let toValue: Position | undefined;

			if (isPosition(snapTarget)) {
				// Snapback to specified target.
				toValue = snapTarget;
			} else if (receiverData) {
				// Snap forward to the center of the receiver
				toValue = {
					x:
						receiverData.absoluteMeasurements.x +
						receiverData.absoluteMeasurements.width / 2 -
						draggedData.absoluteMeasurements.width / 2,
					y:
						receiverData.absoluteMeasurements.y +
						receiverData.absoluteMeasurements.height / 2 -
						draggedData.absoluteMeasurements.height / 2,
				};
			} else {
				// Snapback to default position (where original view is).
				// console.log(
				// 	" Snapback to default position (where original view is).",
				// );
				toValue = {
					x: draggedData.absoluteMeasurements.x,
					y: draggedData.absoluteMeasurements.y,
				};
			}

			if (toValue && snapDuration > 0) {
				snapping = true;
				// Add a release to tracking.
				const releaseId = createReleaseInRegistry(registry, {
					hoverPosition,
					viewId: draggedId,
					scrollPosition,
					scrollPositionOffset: {
						x: scrollPosition.value.x,
						y: scrollPosition.value.y,
					},
				});

				const onSnapAnimationEnd = (_finished?: boolean) => {
					const snapPayload = {
						dragged: { data: draggedData, ...drag },
						receiver: receiver &&
							receiverData && {
								data: receiverData,
								...receiver,
							},
					};

					delete snapPayload.dragged.receiver;

					// // Call the snap end handlers, regardless of whether animation of finished.
					onSnapEnd?.(snapPayload);
					receiverData?.protocol?.onReceiveSnapEnd?.(snapPayload);

					// Remove the release from tracking, regardless of whether animation finished.
					deleteReleaseInRegistry(registry, releaseId);

					// Resetting the hover position updates the view state for the released view to be inactive.
					hoverPosition.value = { x: 0, y: 0 };
				};

				const finishedCallback: AnimationCallback = (finished) => {
					"worklet";

					runOnJS(onSnapAnimationEnd)(finished);
				};

				// Animate the released hover snapback.
				if (snapAnimator) {
					snapAnimator({
						hoverPosition,
						toValue,
						delay: snapDelay,
						duration: snapDuration,
						scrollPosition,
						finishedCallback,
					});
				} else {
					hoverPosition.value = withDelay(
						snapDelay,
						withTiming<Position>(
							toValue,
							{
								duration: snapDuration,
								reduceMotion: ReduceMotion.System,
							},
							finishedCallback,
						),
						ReduceMotion.System,
					);
				}
			}
		}
	} else {
		// Update the drag tracking status.
		// Resetting the hover position updates the view state for the released view to be inactive.
		hoverPosition.value = { x: 0, y: 0 };
	}

	// Update the view state, data dependent on whether snapping back.
	const viewStateUpdate: Partial<DraxViewState> = {
		dragAbsolutePosition: undefined,
		dragTranslation: undefined,
		dragTranslationRatio: undefined,
		dragOffset: undefined,
	};

	if (snapping) {
		viewStateUpdate.dragStatus = DraxViewDragStatus.Released;
	} else {
		viewStateUpdate.dragStatus = DraxViewDragStatus.Inactive;

		viewStateUpdate.grabOffset = undefined;
		viewStateUpdate.grabOffsetRatio = undefined;

		hoverPosition.value = { x: 0, y: 0 };
	}

	// stateDispatch(actions.updateViewState({
	// 	viewStateUpdate,
	// 	id: draggedId,
	// }));
};

/** Start tracking a drag. */
const startDragInRegistry = (
	registry: DraxRegistry,
	{
		dragAbsolutePosition,
		dragParentPosition,
		draggedId,
		grabOffset,
		grabOffsetRatio,
	}: StartDragPayload,
) => {
	resetDragInRegistry(registry);
	const dragTranslation = { x: 0, y: 0 };
	const dragTranslationRatio = { x: 0, y: 0 };
	const dragOffset = grabOffset;
	const draggedData = getViewDataFromRegistry(registry, draggedId);

	const hoverPosition =
		draggedData?.protocol.hoverPosition || INITIAL_REANIMATED_POSITION;

	registry.drag = {
		absoluteStartPosition: dragAbsolutePosition,
		parentStartPosition: dragParentPosition,
		draggedId,
		dragAbsolutePosition,
		dragTranslation,
		dragTranslationRatio,
		dragOffset,
		grabOffset,
		grabOffsetRatio,
		hoverPosition,
		receiver: undefined,
		monitorIds: [],
	};

	return {
		dragAbsolutePosition,
		dragTranslation,
		dragTranslationRatio,
		dragOffset,
		hoverPosition,
	};
};

/** Update drag position. */
const updateDragPositionInRegistry = (
	registry: DraxRegistry,
	dragAbsolutePosition: Position,
) => {
	const { drag } = registry;
	if (!drag) {
		return;
	}
	const dragged = getTrackingDraggedFromRegistry(registry);
	if (!dragged) {
		return;
	}
	const { absoluteMeasurements } = dragged.data;

	const { grabOffset, hoverPosition } = drag;
	const dragTranslation = {
		x: dragAbsolutePosition.x - drag.absoluteStartPosition.x,
		y: dragAbsolutePosition.y - drag.absoluteStartPosition.y,
	};
	const dragTranslationRatio = {
		x: dragTranslation.x / absoluteMeasurements.width,
		y: dragTranslation.y / absoluteMeasurements.height,
	};
	const dragOffset = {
		x: dragAbsolutePosition.x - absoluteMeasurements.x,
		y: dragAbsolutePosition.y - absoluteMeasurements.y,
	};
	drag.dragAbsolutePosition = dragAbsolutePosition;
	drag.dragTranslation = dragTranslation;
	drag.dragTranslationRatio = dragTranslationRatio;
	drag.dragOffset = dragOffset;
	hoverPosition.value = {
		x: dragAbsolutePosition.x - grabOffset.x,
		y: dragAbsolutePosition.y - grabOffset.y,
	};
};

/** Update receiver for a drag. */
const updateReceiverInRegistry = (
	registry: DraxRegistry,
	receiver: DraxFoundAbsoluteViewEntry,
	dragged: DraxAbsoluteViewEntry,
) => {
	const { drag } = registry;
	if (!drag) {
		return undefined;
	}
	const {
		relativePosition,
		relativePositionRatio,
		id: receiverId,
	} = receiver;

	const { id: draggedId, data: draggedData } = dragged;
	const {
		parentId: draggedParentId,
		protocol: { dragPayload },
	} = draggedData;
	const oldReceiver = drag.receiver;
	const receiveOffset = relativePosition;
	const receiveOffsetRatio = relativePositionRatio;
	const receiverUpdate: Partial<DraxViewState> = {
		receivingDrag: {
			id: draggedId,
			parentId: draggedParentId,
			payload: dragPayload,
			data: draggedData,
		},
		receiveOffset,
		receiveOffsetRatio,
	};
	if (oldReceiver?.receiverId === receiverId) {
		// Same receiver, update offsets.
		oldReceiver.receiveOffset = receiveOffset;
		oldReceiver.receiveOffsetRatio = receiveOffsetRatio;
	} else {
		// New receiver.
		if (oldReceiver) {
			// Clear the old receiver.
			runOnJS(resetReceiverInRegistry)(registry);
		}
		drag.receiver = {
			receiverId,
			receiveOffset,
			receiveOffsetRatio,
		};
		receiverUpdate.receiveStatus = DraxViewReceiveStatus.Receiving;
	}

	return drag.receiver;
};

/** Set the monitors for a drag. */
const setMonitorIdsInRegistry = (
	{ drag }: DraxRegistry,
	monitorIds: string[],
) => {
	if (drag) {
		drag.monitorIds = monitorIds;
	}
};

/** Unregister a Drax view. */
const unregisterViewInRegistry = (
	registry: DraxRegistry,
	{ id }: UnregisterViewPayload,
) => {
	const { [id]: removed, ...viewDataById } = registry.viewDataById;
	registry.viewIds = registry.viewIds.filter((thisId) => thisId !== id);
	registry.viewDataById = viewDataById;
	if (registry.drag?.draggedId === id) {
		resetDragInRegistry(registry);
	} else if (registry.drag?.receiver?.receiverId === id) {
		resetReceiverInRegistry(registry);
	}
	registry.stateDispatch(actions.deleteViewState({ id }));
};

/** Create a Drax registry and wire up all of the methods. */
export const useDraxRegistry = (stateDispatch: DraxStateDispatch) => {
	/** Registry for tracking views and drags. */
	const registryRef = useRef(createInitialRegistry(stateDispatch));

	/** Ensure that the registry has the latest version of state dispatch, although it should never change. */
	useEffect(() => {
		registryRef.current.stateDispatch = stateDispatch;
	}, [stateDispatch]);

	/**
	 *
	 * Getters/finders, with no state reactions.
	 *
	 */

	/** Get data for a registered view by its id. */
	const getViewData = useCallback(
		(id: string | undefined) =>
			getViewDataFromRegistry(registryRef.current, id),
		[],
	);

	/** Get data, including absolute measurements, for a registered view by its id. */
	const getAbsoluteViewData = useCallback(
		(id: string | undefined) =>
			getAbsoluteViewDataFromRegistry(registryRef.current, id),
		[],
	);

	/** Get id and data for the currently dragged view, if any. */
	const getTrackingDragged = useCallback(
		() => getTrackingDraggedFromRegistry(registryRef.current),
		[],
	);

	/** Get id and data for the currently receiving view, if any. */
	const getTrackingReceiver = useCallback(
		() => getTrackingReceiverFromRegistry(registryRef.current),
		[],
	);

	/** Get ids for all currently monitoring views. */
	const getTrackingMonitorIds = useCallback(
		() => getTrackingMonitorIdsFromRegistry(registryRef.current),
		[],
	);

	/** Get id and data for all currently monitoring views. */
	const getTrackingMonitors = useCallback(
		() => getTrackingMonitorsFromRegistry(registryRef.current),
		[],
	);

	/**
	 * Get the absolute position of a drag already in progress from touch
	 * coordinates within the immediate parent view of the dragged view.
	 */
	const getDragPositionData = useCallback(
		(params: GetDragPositionDataParams) =>
			getDragPositionDataFromRegistry(registryRef.current, params),
		[],
	);

	/**
	 * Find all monitoring views and the latest receptive view that
	 * contain the touch coordinates, excluding the specified view.
	 */
	const findMonitorsAndReceiver = useCallback(
		(absolutePosition: Position, excludeViewId: string) =>
			findMonitorsAndReceiverInRegistry(
				registryRef.current,
				absolutePosition,
				excludeViewId,
			),
		[],
	);

	/** Get the array of hover items for dragged and released views */
	const getHoverItems = useCallback(
		(viewIds: string[]) =>
			getHoverItemsFromRegistry(registryRef.current, viewIds),
		[],
	);

	/**
	 *
	 * Imperative methods without state reactions (data management only).
	 *
	 */

	/** Update a view's protocol callbacks/data. */
	const updateViewProtocol = useCallback(
		(payload: UpdateViewProtocolPayload) =>
			updateViewProtocolInRegistry(registryRef.current, payload),
		[],
	);

	/** Update a view's measurements. */
	const updateViewMeasurements = useCallback(
		(payload: UpdateViewMeasurementsPayload) =>
			updateViewMeasurementsInRegistry(registryRef.current, payload),
		[],
	);

	/** Update a hover view's measurements. */
	const updateHoverViewMeasurements = useCallback(
		(payload: UpdateViewMeasurementsPayload) =>
			updateHoverViewMeasurementsInRegistry(registryRef.current, payload),
		[],
	);

	/**
	 *
	 * Imperative methods with potential state reactions.
	 *
	 */

	/** Register a Drax view. */
	const registerView = useCallback(
		(payload: RegisterViewPayload) =>
			registerViewInRegistry(registryRef.current, payload),
		[],
	);

	/** Reset the receiver in drag tracking, if any. */
	const resetReceiver = useCallback(
		() => resetReceiverInRegistry(registryRef.current),
		[],
	);

	/** Reset drag tracking, if any. */
	const resetDrag = useCallback(
		(snapbackTarget?: DraxSnapbackTarget) =>
			resetDragInRegistry(registryRef.current, snapbackTarget),
		[],
	);

	/** Start tracking a drag. */
	const startDrag = useCallback(
		(payload: StartDragPayload) =>
			startDragInRegistry(registryRef.current, payload),
		[],
	);

	/** Update drag position. */
	const updateDragPosition = useCallback(
		(dragAbsolutePosition: Position) =>
			updateDragPositionInRegistry(
				registryRef.current,
				dragAbsolutePosition,
			),
		[],
	);

	/** Update the receiver for a drag. */
	const updateReceiver = useCallback(
		(
			receiver: DraxFoundAbsoluteViewEntry,
			dragged: DraxAbsoluteViewEntry,
		) => updateReceiverInRegistry(registryRef.current, receiver, dragged),
		[],
	);

	/** Set the monitors for a drag. */
	const setMonitorIds = useCallback(
		(monitorIds: string[]) =>
			setMonitorIdsInRegistry(registryRef.current, monitorIds),
		[],
	);

	/** Unregister a Drax view. */
	const unregisterView = useCallback(
		(payload: UnregisterViewPayload) =>
			unregisterViewInRegistry(registryRef.current, payload),
		[],
	);

	const getReleaseViews = useCallback(
		() => getReleasesFromRegistry(registryRef.current),
		[],
	);

	/** Create the Drax registry object for return, only replacing reference when necessary. */
	const draxRegistry = useMemo(
		() => ({
			registryRef,
			getReleaseViews,
			getViewData,
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
			updateHoverViewMeasurements,
			resetReceiver,
			resetDrag,
			startDrag,
			updateDragPosition,
			updateReceiver,
			setMonitorIds,
			unregisterView,
		}),
		[
			getViewData,
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
			updateHoverViewMeasurements,
			resetReceiver,
			resetDrag,
			startDrag,
			updateDragPosition,
			updateReceiver,
			setMonitorIds,
			unregisterView,
		],
	);

	return draxRegistry;
};
