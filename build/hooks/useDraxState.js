"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDraxState = exports.actions = void 0;
const react_1 = require("react");
const typesafe_actions_1 = require("typesafe-actions");
const lodash_isequal_1 = __importDefault(require("lodash.isequal"));
const types_1 = require("../types");
/** Create the initial empty view state data for a newly registered view. */
const createInitialViewState = () => ({
    dragStatus: types_1.DraxViewDragStatus.Inactive,
    dragAbsolutePosition: undefined,
    dragOffset: undefined,
    grabOffset: undefined,
    grabOffsetRatio: undefined,
    draggingOverReceiver: undefined,
    receiveStatus: types_1.DraxViewReceiveStatus.Inactive,
    receiveOffset: undefined,
    receiveOffsetRatio: undefined,
    receivingDrag: undefined,
});
/** Create an initial empty Drax state. */
const createInitialState = () => ({
    viewStateById: {},
    trackingStatus: {
        dragging: false,
        receiving: false,
    },
});
/** Selector for a view state by view id. */
const selectViewState = (state, id) => (id === undefined ? undefined : state.viewStateById[id]);
/** Selector for tracking status. */
const selectTrackingStatus = (state) => state.trackingStatus;
/** Collection of Drax action creators */
exports.actions = {
    createViewState: (0, typesafe_actions_1.createAction)('createViewState')(),
    updateViewState: (0, typesafe_actions_1.createAction)('updateViewState')(),
    deleteViewState: (0, typesafe_actions_1.createAction)('deleteViewState')(),
    updateTrackingStatus: (0, typesafe_actions_1.createAction)('updateTrackingStatus')(),
};
/** The DraxState reducer. */
const reducer = (state, action) => {
    switch (action.type) {
        case (0, typesafe_actions_1.getType)(exports.actions.createViewState): {
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
        case (0, typesafe_actions_1.getType)(exports.actions.updateViewState): {
            const { id, viewStateUpdate } = action.payload;
            const viewState = selectViewState(state, id);
            if (viewState) {
                const newViewState = {
                    ...viewState,
                    ...viewStateUpdate,
                };
                if ((0, lodash_isequal_1.default)(viewState, newViewState)) {
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
        case (0, typesafe_actions_1.getType)(exports.actions.deleteViewState): {
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
        case (0, typesafe_actions_1.getType)(exports.actions.updateTrackingStatus): {
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
const useDraxState = () => {
    /** Reducer for storing view states and tracking status. */
    const [state, dispatch] = (0, react_1.useReducer)(reducer, undefined, createInitialState);
    /** Get state for a view by its id. */
    const getViewState = (0, react_1.useCallback)((id) => selectViewState(state, id), [state]);
    /** Get the current tracking status. */
    const getTrackingStatus = (0, react_1.useCallback)(() => selectTrackingStatus(state), [state]);
    /** Create the Drax state object for return, only replacing reference when necessary. */
    const draxState = (0, react_1.useMemo)(() => ({
        getViewState,
        getTrackingStatus,
        dispatch,
    }), [
        getViewState,
        getTrackingStatus,
    ]);
    /*
    useEffect(() => {
        console.log(`Rendering drax state ${JSON.stringify(state, null, 2)}`);
    });
    */
    return draxState;
};
exports.useDraxState = useDraxState;
