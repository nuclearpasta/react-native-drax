import { useDraxContext } from './useDraxContext';

/**
 * Imperative methods for controlling and querying the Drax provider.
 *
 * Must be called within a `<DraxProvider>`.
 */
export const useDraxMethods = () => {
  const ctx = useDraxContext();

  /**
   * Trigger re-measurement of all registered views.
   * Useful after dynamic layout changes where onLayout may not fire
   * (e.g., orientation changes, animated layout transitions).
   */
  const requestPositionUpdate = () => {
    // Re-measuring is done by reading each view's measure function from
    // the spatial index. For now, this triggers a spatial index refresh
    // by writing the current value back — views that are still mounted
    // will re-measure on the next layout pass.
    const current = ctx.spatialIndexSV.value;
    ctx.spatialIndexSV.value = [...current];
  };

  /**
   * Get the set of dragged item IDs currently dropped on a specific receiver.
   * Returns an empty Set if no items have been dropped on the receiver.
   */
  const getDroppedItems = (receiverId?: string): Map<string, Set<string>> | Set<string> => {
    if (receiverId) {
      return ctx.droppedItemsRef.current.get(receiverId) ?? new Set();
    }
    return new Map(ctx.droppedItemsRef.current);
  };

  /**
   * Clear all tracked dropped items for a specific receiver,
   * or clear all dropped items if no receiverId is provided.
   * Call this when items are programmatically removed from a drop zone.
   */
  const clearDroppedItems = (receiverId?: string) => {
    if (receiverId) {
      ctx.droppedItemsRef.current.delete(receiverId);
    } else {
      ctx.droppedItemsRef.current.clear();
    }
  };

  /**
   * Check if a drag is currently active.
   */
  const isDragging = (): boolean => {
    return ctx.draggedIdSV.value !== '';
  };

  /**
   * Get the ID of the currently dragged view, or undefined if no drag is active.
   */
  const getDraggedId = (): string | undefined => {
    const id = ctx.draggedIdSV.value;
    return id || undefined;
  };

  return {
    requestPositionUpdate,
    getDroppedItems,
    clearDroppedItems,
    isDragging,
    getDraggedId,
  };
};
