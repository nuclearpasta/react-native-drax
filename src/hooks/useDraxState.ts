import isEqual from "lodash.isequal";
import {
	useCallback,
	useReducer,
	useMemo,
	// useEffect,
} from "react";
import { getType, createAction } from "typesafe-actions";

import { INITIAL_REANIMATED_POSITION } from "../params";
import {
	DraxState,
	DraxViewState,
	DraxViewDragStatus,
	DraxViewReceiveStatus,
	DraxStateAction,
	DraxStateActionCreators,
	CreateViewStatePayload,
	UpdateViewStatePayload,
	DeleteViewStatePayload,
	UpdateTrackingStatusPayload,
} from "../types";

/** Create the initial empty view state data for a newly registered view. */
const createInitialViewState = (): DraxViewState => ({
	dragStatus: DraxViewDragStatus.Inactive,
	dragAbsolutePosition: undefined,
	dragOffset: undefined,
	grabOffset: undefined,
	grabOffsetRatio: undefined,
	draggingOverReceiver: undefined,
	receiveStatus: DraxViewReceiveStatus.Inactive,
	receiveOffset: undefined,
	receiveOffsetRatio: undefined,
	receivingDrag: undefined,
});

/** Create an initial empty Drax state. */
const createInitialState = (): DraxState => ({
	viewStateById: {},
	trackingStatus: {
		dragging: false,
		receiving: false,
	},
});

/** Selector for a view state by view id. */
const selectViewState = (state: DraxState, id: string | undefined) =>
	id === undefined ? undefined : state.viewStateById[id];

/** Selector for tracking status. */
const selectTrackingStatus = (state: DraxState) => state.trackingStatus;
const selectAllViewIds = (state: DraxState) => {
	return Object.keys(state.viewStateById);
};

/** Collection of Drax action creators */
export const actions: DraxStateActionCreators = {
	createViewState: createAction("createViewState")<CreateViewStatePayload>(),
	updateViewState: createAction("updateViewState")<UpdateViewStatePayload>(),
	deleteViewState: createAction("deleteViewState")<DeleteViewStatePayload>(),
	updateTrackingStatus: createAction(
		"updateTrackingStatus",
	)<UpdateTrackingStatusPayload>(),
};

/** The DraxState reducer. */
const reducer = (state: DraxState, action: DraxStateAction): DraxState => {
	switch (action.type) {
		case getType(actions.createViewState): {
			const { id } = action.payload;
			const viewState = selectViewState(state, id);
			if (viewState) {
				return state;
			}
			return {
				...state,
				viewStateById: {
					...state.viewStateById,
					[id]: createInitialViewState(),
				},
			};
		}
		case getType(actions.updateViewState): {
			const { id, viewStateUpdate } = action.payload;
			const viewState = selectViewState(state, id);
			if (viewState) {
				const newViewState = {
					...viewState,
					...viewStateUpdate,
				};
				if (isEqual(viewState, newViewState)) {
					return state;
				}
				return {
					...state,
					viewStateById: {
						...state.viewStateById,
						[id]: newViewState,
					},
				};
			}
			return state;
		}
		case getType(actions.deleteViewState): {
			const { id } = action.payload;
			const { [id]: removed, ...viewStateById } = state.viewStateById;
			if (removed) {
				return {
					...state,
					viewStateById,
				};
			}
			return state;
		}
		case getType(actions.updateTrackingStatus): {
			return {
				...state,
				trackingStatus: {
					...state.trackingStatus,
					...action.payload,
				},
			};
		}
		default:
			return state;
	}
};

/** Create a Drax state and wire up its methods. */
export const useDraxState = () => {
	/** Reducer for storing view states and tracking status. */
	const [state, dispatch] = useReducer(
		reducer,
		undefined,
		createInitialState,
	);

	/** Get state for a view by its id. */
	const getViewState = useCallback(
		(id: string | undefined) => selectViewState(state, id),
		[state],
	);

	/** Get the current tracking status. */
	const getTrackingStatus = useCallback(
		() => selectTrackingStatus(state),
		[state],
	);
	/** Get the current tracking status. */
	const getAllViewIds = useCallback(() => selectAllViewIds(state), [state]);

	/** Create the Drax state object for return, only replacing reference when necessary. */
	const draxState = useMemo(
		() => ({
			getViewState,
			getTrackingStatus,
			getAllViewIds,
			dispatch,
		}),
		[getViewState, getTrackingStatus, getAllViewIds],
	);

	/*
	useEffect(() => {
		console.log(`Rendering drax state ${JSON.stringify(state, null, 2)}`);
	});
	*/

	return draxState;
};
