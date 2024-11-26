"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoScrollDirection = exports.DraxViewReceiveStatus = exports.DraxViewDragStatus = exports.DraxSnapbackTargetPreset = exports.isWithCancelledFlag = exports.isPosition = void 0;
/** Predicate for checking if something is a Position */
const isPosition = (something) => (typeof something === 'object' && something !== null && typeof something.x === 'number' && typeof something.y === 'number');
exports.isPosition = isPosition;
/** Predicate for checking if something has a cancelled flag */
const isWithCancelledFlag = (something) => (typeof something === 'object' && something !== null && typeof something.cancelled === 'boolean');
exports.isWithCancelledFlag = isWithCancelledFlag;
/** Preset values for specifying snapback targets without a Position */
var DraxSnapbackTargetPreset;
(function (DraxSnapbackTargetPreset) {
    DraxSnapbackTargetPreset[DraxSnapbackTargetPreset["Default"] = 0] = "Default";
    DraxSnapbackTargetPreset[DraxSnapbackTargetPreset["None"] = 1] = "None";
})(DraxSnapbackTargetPreset = exports.DraxSnapbackTargetPreset || (exports.DraxSnapbackTargetPreset = {}));
/** The states a dragged view can be in */
var DraxViewDragStatus;
(function (DraxViewDragStatus) {
    /** View is not being dragged */
    DraxViewDragStatus[DraxViewDragStatus["Inactive"] = 0] = "Inactive";
    /** View is being actively dragged; an active drag touch began in this view */
    DraxViewDragStatus[DraxViewDragStatus["Dragging"] = 1] = "Dragging";
    /** View has been released but has not yet snapped back to inactive */
    DraxViewDragStatus[DraxViewDragStatus["Released"] = 2] = "Released";
})(DraxViewDragStatus = exports.DraxViewDragStatus || (exports.DraxViewDragStatus = {}));
/** The states a receiver view can be in */
var DraxViewReceiveStatus;
(function (DraxViewReceiveStatus) {
    /** View is not receiving a drag */
    DraxViewReceiveStatus[DraxViewReceiveStatus["Inactive"] = 0] = "Inactive";
    /** View is receiving a drag; an active drag touch point is currently over this view */
    DraxViewReceiveStatus[DraxViewReceiveStatus["Receiving"] = 1] = "Receiving";
})(DraxViewReceiveStatus = exports.DraxViewReceiveStatus || (exports.DraxViewReceiveStatus = {}));
/** Auto-scroll direction used internally by DraxScrollView and DraxList */
var AutoScrollDirection;
(function (AutoScrollDirection) {
    /** Auto-scrolling back toward the beginning of list */
    AutoScrollDirection[AutoScrollDirection["Back"] = -1] = "Back";
    /** Not auto-scrolling */
    AutoScrollDirection[AutoScrollDirection["None"] = 0] = "None";
    /** Auto-scrolling forward toward the end of the list */
    AutoScrollDirection[AutoScrollDirection["Forward"] = 1] = "Forward";
})(AutoScrollDirection = exports.AutoScrollDirection || (exports.AutoScrollDirection = {}));
