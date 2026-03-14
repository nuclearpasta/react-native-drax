import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';

import type { DraxViewStyleProps, DraxStyleProp } from '../types';
import { useDraxContext } from './useDraxContext';

/**
 * Provides animated styles for a DraxView.
 *
 * Key performance property: reads ONLY draggedIdSV, receiverIdSV, and dragPhaseSV.
 * These change ~5 times per drag total (not per frame), so ALL views re-evaluate
 * their styles only ~5 times per drag operation.
 *
 * hoverPositionSV is NOT read here — only HoverLayer reads it, ensuring only
 * 1 component re-evaluates per frame during active drag.
 */
export const useViewStyles = (id: string, styleProps: DraxViewStyleProps) => {
  const { draggedIdSV, receiverIdSV, dragPhaseSV } = useDraxContext();

  const {
    style,
    dragInactiveStyle,
    draggingStyle,
    draggingWithReceiverStyle,
    draggingWithoutReceiverStyle,
    dragReleasedStyle,
    receiverInactiveStyle,
    receivingStyle,
    otherDraggingStyle,
    otherDraggingWithReceiverStyle,
    otherDraggingWithoutReceiverStyle,
  } = styleProps;

  // Flatten style props once (they don't change during a drag)
  const flatDraggingStyle = flattenOrNull(draggingStyle);
  const flatDraggingWithReceiverStyle = flattenOrNull(draggingWithReceiverStyle);
  const flatDraggingWithoutReceiverStyle = flattenOrNull(draggingWithoutReceiverStyle);
  const flatDragReleasedStyle = flattenOrNull(dragReleasedStyle);
  const flatDragInactiveStyle = flattenOrNull(dragInactiveStyle);
  const flatReceiverInactiveStyle = flattenOrNull(receiverInactiveStyle);
  const flatReceivingStyle = flattenOrNull(receivingStyle);
  const flatOtherDraggingStyle = flattenOrNull(otherDraggingStyle);
  const flatOtherDraggingWithReceiverStyle = flattenOrNull(otherDraggingWithReceiverStyle);
  const flatOtherDraggingWithoutReceiverStyle = flattenOrNull(otherDraggingWithoutReceiverStyle);

  // Compute a reset style that restores all animated properties to their base
  // style values (or neutral defaults if not in the base style). Reanimated does
  // not auto-clear native style properties when they disappear from
  // useAnimatedStyle, so we must always set them explicitly.
  const flatBaseStyle = flattenOrNull(style);
  const resetStyle = computeResetStyle(
    flatBaseStyle,
    flatDraggingStyle,
    flatDraggingWithReceiverStyle,
    flatDraggingWithoutReceiverStyle,
    flatDragReleasedStyle,
    flatDragInactiveStyle,
    flatReceiverInactiveStyle,
    flatReceivingStyle,
    flatOtherDraggingStyle,
    flatOtherDraggingWithReceiverStyle,
    flatOtherDraggingWithoutReceiverStyle,
  );

  /**
   * The animated style. Re-evaluates only when draggedIdSV, receiverIdSV,
   * or dragPhaseSV change (~5 times per drag).
   *
   * Always spreads resetStyle first so that every animated property is
   * explicitly set, preventing stale native-side values from lingering.
   */
  const animatedDragStyle = useAnimatedStyle(() => {
    const draggedId = draggedIdSV.value;
    const receiverId = receiverIdSV.value;
    const phase = dragPhaseSV.value;

    const isMe = draggedId === id;
    const amReceiving = receiverId === id;
    const isDragging = phase !== 'idle';

    // This view is being dragged
    if (isMe && phase === 'dragging') {
      return mergeStyles(
        resetStyle,
        flatDraggingStyle,
        amReceiving
          ? flatDraggingWithReceiverStyle
          : flatDraggingWithoutReceiverStyle
      );
    }

    // This view was just released
    if (isMe && phase === 'releasing') {
      return mergeStyles(resetStyle, flatDragReleasedStyle ?? flatDraggingStyle);
    }

    // This view is receiving a drag
    if (amReceiving && isDragging) {
      return mergeStyles(resetStyle, flatReceivingStyle);
    }

    // Another view is being dragged (not me, not receiving)
    if (isDragging && !isMe) {
      return mergeStyles(
        resetStyle,
        flatDragInactiveStyle,
        flatOtherDraggingStyle,
        amReceiving
          ? flatOtherDraggingWithReceiverStyle
          : flatOtherDraggingWithoutReceiverStyle
      );
    }

    // Idle state — combine inactive styles with reset base
    return mergeStyles(resetStyle, flatDragInactiveStyle, flatReceiverInactiveStyle);
  });

  return {
    style,
    animatedDragStyle,
  };
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function flattenOrNull(s: DraxStyleProp | undefined): ViewStyle | null {
  if (!s) return null;
  return StyleSheet.flatten(s) ?? null;
}

function mergeStyles(...styles: (ViewStyle | null | undefined)[]): ViewStyle {
  'worklet';
  let result: ViewStyle = {};
  for (const s of styles) {
    if (s) {
      result = { ...result, ...s };
    }
  }
  return result;
}

/**
 * Builds an object that explicitly resets every property found in any of the
 * special style objects to its base-style value (or a neutral default if the
 * base style doesn't define that property).
 *
 * This is necessary because Reanimated's native animation driver does not
 * automatically remove style properties when they disappear from
 * useAnimatedStyle. Without explicit resets, properties like borderWidth
 * or opacity linger with their last animated value.
 *
 * Using base-style values as defaults prevents the animated style from
 * overriding the regular `style` prop (e.g., blue borders set via React state).
 */
function computeResetStyle(base: ViewStyle | null, ...specials: (ViewStyle | null)[]): ViewStyle {
  const reset: Record<string, unknown> = {};
  const baseMap = base ? Object.entries(base).reduce<Record<string, unknown>>((acc, [k, v]) => {
    acc[k] = v;
    return acc;
  }, {}) : {};

  for (const s of specials) {
    if (!s) continue;
    for (const [key, value] of Object.entries(s)) {
      if (key in reset) continue;
      if (key in baseMap) {
        // Use the base style's value so we don't override it
        reset[key] = baseMap[key];
      } else if (typeof value === 'number') {
        // opacity defaults to 1; all other numeric properties default to 0
        reset[key] = key === 'opacity' ? 1 : 0;
      } else if (typeof value === 'string') {
        reset[key] = 'transparent';
      }
      // Skip non-primitive values (transform arrays, etc.)
    }
  }
  return reset as ViewStyle;
}
