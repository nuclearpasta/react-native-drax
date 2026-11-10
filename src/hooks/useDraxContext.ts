import { use } from 'react';

import type { DraxInternalContextValue } from '../DraxContext';
import { DraxContext } from '../DraxContext';
import type { DraxContextValue } from '../types';

export const useDraxInternalContext = (): DraxInternalContextValue => {
  const drax = use(DraxContext);
  if (!drax) {
    throw Error('No DraxProvider found');
  }
  return drax;
};

export const useDraxContext = (): DraxContextValue => useDraxInternalContext();
