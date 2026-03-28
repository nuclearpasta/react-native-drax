// ─── Sortable Types (List-Agnostic) ─────────────────────────────────────────

/** Reorder strategy for sortable lists */
export type SortableReorderStrategy = 'insert' | 'swap';

/** Named animation preset for sortable item shift animations */
export type SortableAnimationPreset = 'default' | 'spring' | 'gentle' | 'snappy' | 'none';

/** Custom animation configuration for sortable item shifts */
export interface SortableAnimationCustomConfig {
  /** Duration in ms for timing-based animations. Ignored when useSpring is true. @default 200 */
  shiftDuration?: number;
  /** Use spring physics instead of timing. @default false */
  useSpring?: boolean;
  /** Spring damping. @default 15 */
  springDamping?: number;
  /** Spring stiffness. @default 150 */
  springStiffness?: number;
  /** Spring mass. @default 1 */
  springMass?: number;
}

/** Animation configuration: a preset name or custom config object */
export type SortableAnimationConfig = SortableAnimationPreset | SortableAnimationCustomConfig;

// ─── Sortable Item Types ───────────────────────────────────────────────────

/** Internal payload attached to each SortableItem's DraxView */
export interface SortableItemPayload {
  index: number;
  originalIndex: number;
}

/** Type guard for SortableItemPayload */
export function isSortableItemPayload(value: unknown): value is SortableItemPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'index' in value &&
    'originalIndex' in value &&
    typeof value.index === 'number' &&
    typeof value.originalIndex === 'number'
  );
}
