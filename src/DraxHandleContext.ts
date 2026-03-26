import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { DraxPanGesture } from './compat';
import type { Position } from './types';

export interface DraxHandleContextValue {
  gesture: DraxPanGesture;
  /** Handle's offset within the parent DraxView (set by DraxHandle via measureLayout) */
  handleOffsetSV: SharedValue<Position>;
  /** Ref to the parent DraxView's native view (for measureLayout) */
  parentViewRef: React.RefObject<any>;
}

export const DraxHandleContext = createContext<DraxHandleContextValue | null>(null);
