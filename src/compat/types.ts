import type { SharedValue } from 'react-native-reanimated';

/**
 * Re-export PanGesture from RNGH — resolves to the correct type per installed version:
 * - v3: SingleGesture<PanHandlerData, PanGestureInternalProperties>
 * - v2: PanGesture class extending ContinousBaseGesture
 */
export type { PanGesture as DraxPanGesture } from 'react-native-gesture-handler';

/** Minimal event shape — only the fields Drax uses (present in both v2 and v3). */
export interface DraxPanEvent {
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
}

/** Config for the version-agnostic pan gesture hook. */
export interface DraxPanGestureConfig {
  enabledSV: SharedValue<boolean>;
  longPressDelaySV: SharedValue<number>;
  maxPointers: number;
  shouldCancelWhenOutside: boolean;
  /** Web: CSS touch-action for the gesture view. Set to 'pan-y' or 'pan-x'
   *  to allow native scrolling before the long-press activates. */
  touchAction?: string;
  onActivate: (event: DraxPanEvent) => void;
  onUpdate: (event: DraxPanEvent) => void;
  onDeactivate: (event: DraxPanEvent) => void;
  onFinalize: (event: DraxPanEvent, didSucceed: boolean) => void;
}
