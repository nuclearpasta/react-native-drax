import { useContext } from 'react';

import { DraxContext } from './DraxContext';

export const useDrax = () => {
	const drax = useContext(DraxContext);
	if (!drax) {
		throw Error('No DraxProvider found');
	}
	return drax;
};
