import { useCallback, useRef } from 'react';
import type {
  SortableBoardHandle,
  SortableBoardInternal,
  SortableBoardTransferState,
  SortableListInternal,
  UseSortableBoardOptions,
} from '../types';

/**
 * Board-level coordinator for cross-container sortable drag.
 *
 * Maintains a registry of columns (each with their own useSortableList)
 * and tracks cross-container transfer state. The actual monitor callbacks
 * are handled by SortableBoardContainer.
 */
export const useSortableBoard = <TItem,>(
  options: UseSortableBoardOptions<TItem>
): SortableBoardHandle<TItem> => {
  const { keyExtractor, onTransfer } = options;

  const columnsRef = useRef<Map<string, SortableListInternal<unknown>>>(new Map());
  const transferStateRef = useRef<SortableBoardTransferState | undefined>(undefined);

  const registerColumn = useCallback((id: string, internal: SortableListInternal<unknown>) => {
    columnsRef.current.set(id, internal);
  }, []);

  const unregisterColumn = useCallback((id: string) => {
    columnsRef.current.delete(id);
  }, []);

  const internal: SortableBoardInternal<TItem> = {
    keyExtractor,
    onTransfer,
    columns: columnsRef.current,
    registerColumn,
    unregisterColumn,
    transferState: transferStateRef,
    // finalizeTransfer is set by SortableBoardContainer (needs DraxContext access)
  };

  return { _internal: internal };
};
