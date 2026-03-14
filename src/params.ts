/** Default snapback delay in milliseconds */
export const defaultSnapbackDelay = 100;

/** Default snapback duration in milliseconds */
export const defaultSnapbackDuration = 250;

/** Default pre-drag long press delay in milliseconds */
export const defaultLongPressDelay = 0;

/** Default pre-drag long press delay in milliseconds for DraxList items */
export const defaultListItemLongPressDelay = 250;

/** Default scroll event throttle (number of events per second) for DraxScrollView */
export const defaultScrollEventThrottle = 8;

/** Default interval length in milliseconds for auto-scrolling jumps */
export const defaultAutoScrollIntervalLength = 250;

/** Default auto-scroll jump distance, as a fraction relative to content width/length */
export const defaultAutoScrollJumpRatio = 0.2;

/** Default drag-over maximum position threshold for auto-scroll back, as a fraction relative to content width/length */
export const defaultAutoScrollBackThreshold = 0.1;

/** Default drag-over minimum position threshold for auto-scroll forward, as a fraction relative to content width/length */
export const defaultAutoScrollForwardThreshold = 0.9;

/** Buffer in milliseconds added after snapback animation before cleaning up hover content */
export const SNAPBACK_CLEANUP_BUFFER_MS = 50;

/** Throttle delay in milliseconds for external drag state updates */
export const EXTERNAL_DRAG_THROTTLE_MS = 300;

/** Duration in milliseconds for list item shift/reorder animations */
export const ITEM_SHIFT_ANIMATION_DURATION = 200;

/** Duration in milliseconds for the layout + shift transition after reorder commit */
export const REORDER_TRANSITION_DURATION = 200;
