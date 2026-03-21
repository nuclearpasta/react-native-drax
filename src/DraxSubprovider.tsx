import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

import { DraxContext } from './DraxContext';
import { useDraxContext } from './hooks';
import type { DraxSubproviderProps } from './types';

export const DraxSubprovider = ({
  parent,
  children,
}: PropsWithChildren<DraxSubproviderProps>) => {
  const contextValue = useDraxContext();
  const subContextValue = useMemo(
    () => ({ ...contextValue, parent }),
    [contextValue, parent]
  );
  return (
    <DraxContext value={subContextValue}>
      {children}
    </DraxContext>
  );
};
