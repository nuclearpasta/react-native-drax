import { use } from 'react';

import { DraxContext } from '../DraxContext';

export const useDraxContext = () => {
  const drax = use(DraxContext);
  if (!drax) {
    throw Error('No DraxProvider found');
  }
  return drax;
};
