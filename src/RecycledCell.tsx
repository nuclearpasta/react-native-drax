/**
 * RecycledCell — A single cell in the recycling pool.
 *
 * Position model (zero Yoga relayout):
 *   left/top: always 0 (no Yoga relayout on position change)
 *   translateX/Y = basePosition + shift (all via SharedValues on UI thread)
 *
 * basePositionSV: written by pushBasePositionsToSVs (JS → SV, no React re-render)
 * shiftSV: written by worklet during drag (UI thread)
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
  springConfig: SpringConfig | null;
  shiftDuration: number;
  inactiveItemStyle?: Record<string, unknown>;
  registerCellBase: (key: string, sv: SharedValue<Position>) => void;
  unregisterCellBase: (key: string) => void;
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
  registerCellBase,
  unregisterCellBase,
  registerCellShift,
  unregisterCellShift,
  children,
}: RecycledCellProps) => {
  // Per-cell base position SV — all positioning via translateX/Y (no Yoga relayout)
  const basePositionSV = useSharedValue<Position>({ x: baseX, y: baseY });
  // Per-cell shift SV — drag reorder animation
  const shiftSV = useSharedValue<Position>({ x: 0, y: 0 });

  // Register base position SV
  useLayoutEffect(() => {
    if (!itemKey) return;
    registerCellBase(itemKey, basePositionSV);
    return () => unregisterCellBase(itemKey);
  }, [itemKey, basePositionSV, registerCellBase, unregisterCellBase]);

  // Register shift SV
  useLayoutEffect(() => {
    if (!itemKey) return;
    registerCellShift(itemKey, shiftSV);
    return () => unregisterCellShift(itemKey);
  }, [itemKey, shiftSV, registerCellShift, unregisterCellShift]);

  // Sync base position from props on mount/recycle
  useLayoutEffect(() => {
    basePositionSV.value = { x: baseX, y: baseY };
  }, [baseX, baseY, basePositionSV]);

  const clampedSpringConfig = useMemo(
    () => springConfig ? { ...springConfig, overshootClamping: true } : null,
    [springConfig],
  );

  // Static: position absolute at origin, dimensions from props
  const staticStyle = useMemo(
    () => ({ position: 'absolute' as const, left: 0, top: 0, width: cellWidth, height: cellHeight }),
    [cellWidth, cellHeight],
  );

  // All positioning via translateX/Y — no Yoga relayout
  //
  // CRITICAL: base position and shift are SEPARATE transforms, not combined.
  // Combining them (`translateX: base.x + withSpring(shift.x)`) causes Reanimated
  // to reset/misinterpret the spring when the worklet re-evaluates (e.g., on
  // draggedKeySV change), making all cells jump to wrong positions.
  // Stacking transforms avoids this: base is always direct, shift is always animated.
  const animatedStyle = useAnimatedStyle(() => {
    if (!itemKey) return { opacity: 0 };

    const base = basePositionSV.value;
    const shift = shiftSV.value;
    const isDragged = draggedKeySV.value === itemKey && hoverReadySV.value;
    const dragActive = draggedKeySV.value !== '';
    const isInactive = dragActive && !isDragged;

    if (skipShiftAnimationSV.value) {
      return {
        opacity: isDragged ? 0 : 1,
        transform: [
          { translateX: base.x },
          { translateY: base.y },
          { translateX: shift.x },
          { translateY: shift.y },
        ],
        ...(isInactive && inactiveItemStyle ? inactiveItemStyle : {}),
      };
    }

    const animatedX = clampedSpringConfig
      ? withSpring(shift.x, clampedSpringConfig)
      : withTiming(shift.x, { duration: shiftDuration });
    const animatedY = clampedSpringConfig
      ? withSpring(shift.y, clampedSpringConfig)
      : withTiming(shift.y, { duration: shiftDuration });

    return {
      opacity: isDragged ? 0 : 1,
      transform: [
        { translateX: base.x },
        { translateY: base.y },
        { translateX: animatedX },
        { translateY: animatedY },
      ],
      ...(isInactive && inactiveItemStyle ? inactiveItemStyle : {}),
    };
  });

  if (!itemKey) return null;

  return (
    <Reanimated.View style={[staticStyle, animatedStyle]}>
      {children}
    </Reanimated.View>
  );
});

RecycledCell.displayName = 'RecycledCell';
