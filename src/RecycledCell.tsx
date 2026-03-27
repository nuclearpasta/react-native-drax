/**
 * RecycledCell — A single cell in the recycling pool.
 *
 * Position model:
 *   left/top: baseX/baseY (React props → Yoga → touch hit-testing)
 *   translateX/Y: shiftX/Y (per-cell SharedValue → Reanimated → visual offset during drag)
 *   Visual = (left + translateX, top + translateY) = (baseX + shiftX, baseY + shiftY)
 *
 * Each cell has its own SharedValue for shift — only cells with changed shifts
 * re-evaluate their animated style on the UI thread. This eliminates full-record
 * lookups per cell per frame.
 */
import type { ReactNode } from 'react';
import { memo, useLayoutEffect, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Position } from './types';

interface SpringConfig { damping: number; stiffness: number; mass: number }

interface RecycledCellProps {
  baseX: number;
  baseY: number;
  cellWidth: number | undefined;
  cellHeight: number | undefined;
  itemKey: string;
  draggedKeySV: SharedValue<string>;
  hoverReadySV: SharedValue<boolean>;
  skipShiftAnimationSV: SharedValue<boolean>;
  /** Pre-computed spring config (stable ref from useMemo). Null = use withTiming. */
  springConfig: SpringConfig | null;
  shiftDuration: number;
  /** Style applied to non-dragged items while a drag is active. */
  inactiveItemStyle?: Record<string, unknown>;
  /** Register this cell's shift SV with the parent hook for targeted writes. */
  registerCellShift: (key: string, sv: SharedValue<Position>) => void;
  unregisterCellShift: (key: string) => void;
  children: ReactNode;
}

export const RecycledCell = memo(({
  baseX,
  baseY,
  cellWidth,
  cellHeight,
  itemKey,
  draggedKeySV,
  hoverReadySV,
  skipShiftAnimationSV,
  springConfig,
  shiftDuration,
  inactiveItemStyle,
  registerCellShift,
  unregisterCellShift,
  children,
}: RecycledCellProps) => {
  // Per-cell shift SharedValue — only THIS cell re-evaluates when its shift changes
  const shiftSV = useSharedValue<Position>({ x: 0, y: 0 });

  // Register with parent hook so it can write to this cell's SV
  useLayoutEffect(() => {
    if (!itemKey) return;
    registerCellShift(itemKey, shiftSV);
    return () => unregisterCellShift(itemKey);
  }, [itemKey, shiftSV, registerCellShift, unregisterCellShift]);

  // Memoize spring config with overshootClamping — MUST be stable reference,
  // NOT created inside useAnimatedStyle (new object every frame → spring restarts)
  const clampedSpringConfig = useMemo(
    () => springConfig ? { ...springConfig, overshootClamping: true } : null,
    [springConfig],
  );

  // Memoize the static style to avoid inline object allocation per render
  const staticStyle = useMemo(
    () => ({ position: 'absolute' as const, left: baseX, top: baseY, width: cellWidth, height: cellHeight }),
    [baseX, baseY, cellWidth, cellHeight],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (!itemKey) return { opacity: 0 };

    const shift = shiftSV.value; // Direct atomic read — no full-record lookup
    const isDragged = draggedKeySV.value === itemKey && hoverReadySV.value;
    const dragActive = draggedKeySV.value !== '';
    const isInactive = dragActive && !isDragged;
    const shiftX = shift.x;
    const shiftY = shift.y;

    // Skip animation during position reset (snap instantly)
    if (skipShiftAnimationSV.value) {
      return {
        opacity: isDragged ? 0 : 1,
        transform: [{ translateX: shiftX }, { translateY: shiftY }],
        ...(isInactive && inactiveItemStyle ? inactiveItemStyle : {}),
      };
    }

    const animatedX = clampedSpringConfig
      ? withSpring(shiftX, clampedSpringConfig)
      : withTiming(shiftX, { duration: shiftDuration });
    const animatedY = clampedSpringConfig
      ? withSpring(shiftY, clampedSpringConfig)
      : withTiming(shiftY, { duration: shiftDuration });

    return {
      opacity: isDragged ? 0 : 1,
      transform: [{ translateX: animatedX }, { translateY: animatedY }],
      ...(isInactive && inactiveItemStyle ? inactiveItemStyle : {}),
    };
  });

  if (!itemKey) return null;

  return (
    <Reanimated.View
      style={[
        staticStyle,
        animatedStyle,
      ]}
    >
      {children}
    </Reanimated.View>
  );
});

RecycledCell.displayName = 'RecycledCell';
