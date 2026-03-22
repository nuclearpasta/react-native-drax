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

/** Duration in milliseconds for list item shift/reorder animations */
export const ITEM_SHIFT_ANIMATION_DURATION = 200;

/** Resolved animation configuration for sortable item shifts */
export interface ResolvedAnimationConfig {
  useSpring: boolean;
  shiftDuration: number;
  springDamping: number;
  springStiffness: number;
  springMass: number;
}

// Frozen preset singletons — avoids object allocation on every call.
const PRESET_DEFAULT: ResolvedAnimationConfig = Object.freeze({
  useSpring: false, shiftDuration: 200, springDamping: 15, springStiffness: 150, springMass: 1,
});
const PRESET_SPRING: ResolvedAnimationConfig = Object.freeze({
  useSpring: true, shiftDuration: 200, springDamping: 15, springStiffness: 150, springMass: 1,
});
const PRESET_GENTLE: ResolvedAnimationConfig = Object.freeze({
  useSpring: true, shiftDuration: 200, springDamping: 20, springStiffness: 100, springMass: 1.2,
});
const PRESET_SNAPPY: ResolvedAnimationConfig = Object.freeze({
  useSpring: true, shiftDuration: 200, springDamping: 20, springStiffness: 300, springMass: 0.8,
});
const PRESET_NONE: ResolvedAnimationConfig = Object.freeze({
  useSpring: false, shiftDuration: 0, springDamping: 15, springStiffness: 150, springMass: 1,
});

/** Resolve a SortableAnimationConfig (preset or custom) to concrete values */
export function resolveAnimationConfig(
  config: import('./types').SortableAnimationConfig | undefined
): ResolvedAnimationConfig {
  if (!config || config === 'default') return PRESET_DEFAULT;
  if (config === 'spring') return PRESET_SPRING;
  if (config === 'gentle') return PRESET_GENTLE;
  if (config === 'snappy') return PRESET_SNAPPY;
  if (config === 'none') return PRESET_NONE;
  // Custom config — only case that allocates
  return {
    useSpring: config.useSpring ?? false,
    shiftDuration: config.shiftDuration ?? 200,
    springDamping: config.springDamping ?? 15,
    springStiffness: config.springStiffness ?? 150,
    springMass: config.springMass ?? 1,
  };
}
