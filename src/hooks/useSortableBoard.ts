/**
 * useSortableBoard — Coordinator for cross-container drag-and-drop.
 * Zero React state. Column registry via refs.
 */
import { useCallback, useRef } from 'react';
import type { SortableListInternal } from './useSortableList';

export interface SortableBoardTransferEvent<T = unknown> {
  item: T;
  fromContainerId: string;
  fromIndex: number;
  toContainerId: string;
  toIndex: number;
}

export interface UseSortableBoardOptions<T = unknown> {
  onTransfer: (event: SortableBoardTransferEvent<T>) => void;
}

export interface SortableBoardHandle<T = unknown> {
  _internal: SortableBoardInternal<T>;
}

export interface SortableBoardInternal<T = unknown> {
  columns: Map<string, SortableListInternal<unknown>>;
  registerColumn: (id: string, internal: SortableListInternal<unknown>) => void;
  unregisterColumn: (id: string) => void;
  onTransfer: (event: SortableBoardTransferEvent<T>) => void;
}

export const useSortableBoard = <T = unknown,>(
  options: UseSortableBoardOptions<T>,
): SortableBoardHandle<T> => {
  const { onTransfer } = options;
  const columns = useRef<Map<string, SortableListInternal<unknown>>>(new Map()).current;

  const registerColumn = useCallback((id: string, internal: SortableListInternal<unknown>) => {
    columns.set(id, internal);
  }, [columns]);

  const unregisterColumn = useCallback((id: string) => {
    columns.delete(id);
  }, [columns]);

  return {
    _internal: {
      columns,
      registerColumn,
      unregisterColumn,
      onTransfer,
    },
  };
};
