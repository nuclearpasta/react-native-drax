import { createContext, useContext } from 'react';
import type { SortableBoardContextValue } from './types';

export const SortableBoardContext = createContext<SortableBoardContextValue | undefined>(undefined);

export const useSortableBoardContext = () => useContext(SortableBoardContext);
