/// <reference types="react" />
import { DraxViewState, DraxStateActionCreators, CreateViewStatePayload, UpdateViewStatePayload, DeleteViewStatePayload, UpdateTrackingStatusPayload } from '../types';
/** Collection of Drax action creators */
export declare const actions: DraxStateActionCreators;
/** Create a Drax state and wire up its methods. */
export declare const useDraxState: () => {
    getViewState: (id: string | undefined) => DraxViewState | undefined;
    getTrackingStatus: () => import("../types").DraxTrackingStatus;
    dispatch: import("react").Dispatch<import("typesafe-actions").PayloadAction<"createViewState", CreateViewStatePayload> | import("typesafe-actions").PayloadAction<"updateViewState", UpdateViewStatePayload> | import("typesafe-actions").PayloadAction<"deleteViewState", DeleteViewStatePayload> | import("typesafe-actions").PayloadAction<"updateTrackingStatus", UpdateTrackingStatusPayload>>;
};
