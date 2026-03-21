import { createContext } from 'react';

import type { DraxContextValue } from './types';

export const DraxContext = createContext<DraxContextValue | undefined>(
  undefined
);
DraxContext.displayName = 'Drax';
