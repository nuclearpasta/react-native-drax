import React, { PropsWithChildren } from 'react';

import { DraxContext } from './DraxContext';
import { DraxSubproviderProps } from './types';
import { useDraxContext } from './hooks';

export const DraxSubprovider = ({ parent, children }: PropsWithChildren<DraxSubproviderProps>) => {
	const contextValue = useDraxContext();
	const subContextValue = {
		...contextValue,
		parent,
	};
	return (
		<DraxContext.Provider value={subContextValue}>
			{children}
		</DraxContext.Provider>
	);
};
