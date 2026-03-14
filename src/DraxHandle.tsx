import type { ReactNode } from 'react';
import { use } from 'react';
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

  if (!ctx) {
    if (__DEV__) {
      console.warn(
        'DraxHandle must be a descendant of a DraxView with dragHandle={true}. ' +
        'The handle will not function.'
      );
    }
    return (
      <Reanimated.View style={style}>
        {children}
      </Reanimated.View>
    );
  }

  return (
    <GestureDetector gesture={ctx.gesture}>
      <Reanimated.View style={style}>
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}
