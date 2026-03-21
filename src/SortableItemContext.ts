import { createContext, use } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/** Per-item state exposed by useItemContext */
export interface SortableItemContextValue {
  /** The item's key (from keyExtractor) */
  itemKey: string;
  /** Display index in the current sort order */
  index: number;
  /** SharedValue: true when this item is being dragged */
  isActive: SharedValue<boolean>;
  /** SharedValue: ID of the currently dragged item (empty string if none) */
  activeItemId: SharedValue<string>;
}

export const SortableItemContext = createContext<SortableItemContextValue | null>(null);

/**
 * Access per-item state from within a SortableItem's children.
 *
 * Returns SharedValues for reactive animations:
 * - `isActive` — true when THIS item is being dragged
 * - `activeItemId` — ID of the currently dragged item
 * - `itemKey` — this item's key
 * - `index` — this item's display index
 *
 * Must be called within a `<SortableItem>`.
 *
 * @example
 * ```tsx
 * function MyItem() {
 *   const { isActive } = useItemContext();
 *   const style = useAnimatedStyle(() => ({
 *     transform: [{ scale: isActive.value ? 1.1 : 1 }],
 *   }));
 *   return <Reanimated.View style={style}>...</Reanimated.View>;
 * }
 * ```
 */
export const useItemContext = (): SortableItemContextValue => {
  const ctx = use(SortableItemContext);
  if (!ctx) {
    throw new Error('useItemContext must be used within a SortableItem');
  }
  return ctx;
};
