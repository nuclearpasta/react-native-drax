import type { ComponentRef, ReactNode } from 'react';
import { use, useLayoutEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';

import { DraxHandleContext } from './DraxHandleContext';

export interface DraxHandleProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Drag handle component — only touches on this area will start a drag.
 *
 * Must be a descendant of a `DraxView` that has `dragHandle={true}`.
 * The parent DraxView provides its gesture via context; this component
 * attaches it to the handle's touch area via GestureDetector.
 *
 * @example
 * ```tsx
 * <DraxView dragHandle style={styles.row}>
 *   <DraxHandle style={styles.grip}>
 *     <GripIcon />
 *   </DraxHandle>
 *   <Text>Item content</Text>
 * </DraxView>
 * ```
 */
export function DraxHandle({ children, style }: DraxHandleProps) {
  const ctx = use(DraxHandleContext);
  const handleRef = useRef<ComponentRef<typeof Reanimated.View>>(null);

  // The gesture event reports the touch relative to this handle. Store the
  // handle's offset within the DraxView so the drag can compute the grab offset.
  const measureHandle = () => {
    const handle = handleRef.current;
    const view = ctx?.viewRef.current;
    if (!handle || !view) return;
    handle.measureLayout(
      view,
      (x, y) => {
        ctx.handleOffsetSV.value = { x, y };
      },
      () => {}
    );
  };
  useLayoutEffect(measureHandle);

  if (!ctx) {
    // No context = either misconfigured, or rendering inside hover overlay
    // (which clones children outside the DraxHandleContext tree).
    // Render as a plain view — the gesture isn't needed in hover.
    return (
      <Reanimated.View style={style}>
        {children}
      </Reanimated.View>
    );
  }

  return (
    <GestureDetector gesture={ctx.gesture}>
      <Reanimated.View ref={handleRef} style={style} onLayout={measureHandle} collapsable={false}>
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}
