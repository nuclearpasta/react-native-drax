import { createContext } from 'react';
import type { ComponentRef, RefObject } from 'react';
import type Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { DraxPanGesture } from './compat';
import type { Position } from './types';

export interface DraxHandleContextValue {
  gesture: DraxPanGesture;
  /** The owning DraxView, used to measure the handle within it. */
  viewRef: RefObject<ComponentRef<typeof Reanimated.View> | null>;
  /** The handle's offset within the owning DraxView, written by DraxHandle. */
  handleOffsetSV: SharedValue<Position>;
}

/**
 * Context that passes the drag gesture from a DraxView (with `dragHandle` prop)
 * to its descendant DraxHandle component. When a DraxView has `dragHandle={true}`,
 * it does NOT wrap itself in a GestureDetector. Instead, the gesture is provided
 * via this context so that DraxHandle can attach it to a smaller touch area.
 */
export const DraxHandleContext = createContext<DraxHandleContextValue | null>(null);
