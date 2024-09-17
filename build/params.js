"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAutoScrollForwardThreshold = exports.defaultAutoScrollBackThreshold = exports.defaultAutoScrollJumpRatio = exports.defaultAutoScrollIntervalLength = exports.defaultScrollEventThrottle = exports.defaultListItemLongPressDelay = exports.defaultLongPressDelay = exports.defaultSnapbackDuration = exports.defaultSnapbackDelay = void 0;
/** Default snapback delay in milliseconds */
exports.defaultSnapbackDelay = 100;
/** Default snapback duration in milliseconds */
exports.defaultSnapbackDuration = 250;
/** Default pre-drag long press delay in milliseconds */
exports.defaultLongPressDelay = 0;
/** Default pre-drag long press delay in milliseconds for DraxList items */
exports.defaultListItemLongPressDelay = 250;
/** Default scroll event throttle (number of events per second) for DraxScrollView */
exports.defaultScrollEventThrottle = 8;
/** Default interval length in milliseconds for auto-scrolling jumps */
exports.defaultAutoScrollIntervalLength = 250;
/** Default auto-scroll jump distance, as a fraction relative to content width/length */
exports.defaultAutoScrollJumpRatio = 0.2;
/** Default drag-over maximum position threshold for auto-scroll back, as a fraction relative to content width/length */
exports.defaultAutoScrollBackThreshold = 0.1;
/** Default drag-over minimum position threshold for auto-scroll forward, as a fraction relative to content width/length */
exports.defaultAutoScrollForwardThreshold = 0.9;
