import React, { FunctionComponent } from 'react';

import { DraxContext } from './DraxContext';
import { DraxSubproviderProps } from './types';
import { useDrax } from './useDrax';

export const DraxSubprovider: FunctionComponent<DraxSubproviderProps> = ({ parent, children }) => {
	const contextValue = useDrax();
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
