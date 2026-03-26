import type { ReactNode } from 'react';
import { use, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';

import { DraxHandleContext } from './DraxHandleContext';

export interface DraxHandleProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function DraxHandle({ children, style }: DraxHandleProps) {
  const ctx = use(DraxHandleContext);
  const handleRef = useRef<any>(null);

  if (!ctx) {
    return (
      <Reanimated.View style={style}>
        {children}
      </Reanimated.View>
    );
  }

  const measureOffset = () => {
    const handle = handleRef.current;
    const parent = ctx.parentViewRef.current;
    if (!handle || !parent) return;
    try {
      handle.measureLayout(parent, (x: number, y: number) => {
        ctx.handleOffsetSV.value = { x, y };
      });
    } catch {
      // measureLayout can fail if views aren't mounted yet
    }
  };

  return (
    <GestureDetector gesture={ctx.gesture}>
      <Reanimated.View ref={handleRef} style={style} onLayout={measureOffset}>
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}
