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
  /** RNGH 3.0.0-beta.3+ end events (onDeactivate/onFinalize): true when the
   *  gesture was cancelled or failed. Absent on v2 and earlier v3 betas. */
  canceled?: boolean;
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
  /** Fail the gesture if finger moves more than this distance during activation.
   *  Prevents accidental drags when the user is trying to scroll. */
  failOffsetX?: number | [number, number];
  failOffsetY?: number | [number, number];
  onActivate: (event: DraxPanEvent) => void;
  onUpdate: (event: DraxPanEvent) => void;
  onDeactivate: (event: DraxPanEvent) => void;
  /** `didSucceed` is normalized across RNGH versions by the compat layer; do not read `event.canceled` here (RNGH PR #3887: https://github.com/software-mansion/react-native-gesture-handler/pull/3887). */
  onFinalize: (event: DraxPanEvent, didSucceed: boolean) => void;
}
