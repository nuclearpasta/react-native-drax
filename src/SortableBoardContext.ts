import { createContext, useContext } from 'react';
import type { SortableListInternal } from './hooks/useSortableList';

export interface SortableBoardContextValue {
  registerColumn: (id: string, internal: SortableListInternal<unknown>) => void;
  unregisterColumn: (id: string) => void;
  columns: Map<string, SortableListInternal<unknown>>;
  /** Transfer state ref — set by SortableBoardContainer during cross-column drag */
  transferRef: React.RefObject<{
    sourceId: string;
    targetId: string;
    targetSlot: number;
    itemKey: string;
    item: unknown;
    height: number;
    dragStartIndex: number;
  } | undefined>;
  /** Call after snap to finalize cross-container transfer */
  commitTransfer: () => void;
}

const SortableBoardContext = createContext<SortableBoardContextValue | undefined>(undefined);

export const SortableBoardProvider = SortableBoardContext.Provider;

export function useSortableBoardContext(): SortableBoardContextValue | undefined {
  return useContext(SortableBoardContext);
}
