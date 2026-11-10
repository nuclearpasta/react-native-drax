import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

import { DraxContext } from './DraxContext';
import { useDraxInternalContext } from './hooks/useDraxContext';
import type { DraxSubproviderProps } from './types';

export const DraxSubprovider = ({
  parent,
  children,
}: PropsWithChildren<DraxSubproviderProps>) => {
  const contextValue = useDraxInternalContext();
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
