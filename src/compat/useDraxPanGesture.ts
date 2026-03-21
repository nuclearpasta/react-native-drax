import { useMemo, useState } from 'react';
import { useAnimatedReaction } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

import { isGestureHandlerV3 } from './detectVersion';
import type { DraxPanEvent, DraxPanGesture, DraxPanGestureConfig } from './types';

// Module-scope require — cached by the bundler, always the same reference.
// Hoisted out of the hook body so the compiler sees a stable function identity.
const rngh = require('react-native-gesture-handler');

/**
 * v3 path — passes through to RNGH's usePanGesture with SharedValue config.
 * Zero overhead, UI-thread-driven reconfiguration.
 */
function useDraxPanGestureV3(config: DraxPanGestureConfig): DraxPanGesture {
  return rngh.usePanGesture({
    enabled: config.enabledSV,
    activateAfterLongPress: config.longPressDelaySV,
    maxPointers: config.maxPointers,
    shouldCancelWhenOutside: config.shouldCancelWhenOutside,
    touchAction: config.touchAction,
    ...(config.failOffsetX !== undefined && { failOffsetX: config.failOffsetX }),
    ...(config.failOffsetY !== undefined && { failOffsetY: config.failOffsetY }),
    onActivate: config.onActivate,
    onUpdate: config.onUpdate,
    onDeactivate: config.onDeactivate,
    onFinalize: config.onFinalize,
  });
}

/**
 * v2 path — wraps Gesture.Pan() builder pattern.
 * SharedValue config is watched via useAnimatedReaction and triggers gesture
 * recreation on change. This is slower than v3 but functionally correct.
 * In practice, enabled/longPressDelay change very rarely (prop updates only).
 */
function useDraxPanGestureV2(config: DraxPanGestureConfig): DraxPanGesture {
  const Gesture = rngh.Gesture;

  // Mirror SharedValues to React state for v2 gesture config
  const [enabled, setEnabled] = useState(config.enabledSV.value);
  const [longPressDelay, setLongPressDelay] = useState(
    config.longPressDelaySV.value
  );

  // Watch SharedValue changes and sync to JS state
  useAnimatedReaction(
    () => config.enabledSV.value,
    (current, prev) => {
      if (prev !== null && current !== prev) {
        runOnJS(setEnabled)(current);
      }
    }
  );

  useAnimatedReaction(
    () => config.longPressDelaySV.value,
    (current, prev) => {
      if (prev !== null && current !== prev) {
        runOnJS(setLongPressDelay)(current);
      }
    }
  );

  // Typed as DraxPanGesture directly — v2 builder returns a legacy type that's structurally
  // different from v3's PanGesture at compile time, but GestureDetector accepts both at runtime.
  // Since Gesture comes from require() (any), the assignment is valid without a cast.
  const gesture: DraxPanGesture = useMemo(() => {
    let g = Gesture.Pan()
      .enabled(enabled)
      .activateAfterLongPress(longPressDelay)
      .maxPointers(config.maxPointers)
      .shouldCancelWhenOutside(config.shouldCancelWhenOutside);
    if (config.failOffsetX !== undefined) g = g.failOffsetX(config.failOffsetX);
    if (config.failOffsetY !== undefined) g = g.failOffsetY(config.failOffsetY);
    return g
      .onStart((event: DraxPanEvent) => {
        'worklet';
        config.onActivate(event);
      })
      .onUpdate((event: DraxPanEvent) => {
        'worklet';
        config.onUpdate(event);
      })
      .onEnd((event: DraxPanEvent) => {
        'worklet';
        config.onDeactivate(event);
      })
      .onFinalize((event: DraxPanEvent, success: boolean) => {
        'worklet';
        config.onFinalize(event, success);
      });
  }, [Gesture, enabled, longPressDelay, config]);

  return gesture;
}

/**
 * Version-agnostic pan gesture hook.
 * Delegates to v3's usePanGesture (optimal) or v2's Gesture.Pan() builder (compat).
 * Selected at module load time to avoid conditional hook calls.
 */
export const useDraxPanGesture: (
  config: DraxPanGestureConfig
) => DraxPanGesture = isGestureHandlerV3()
  ? useDraxPanGestureV3
  : useDraxPanGestureV2;
