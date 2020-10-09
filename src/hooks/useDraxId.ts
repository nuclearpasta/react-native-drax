import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';

export const useDraxId = (idProp?: string) => {
	// The unique identifer for this view, initialized below.
	const [id, setId] = useState('');

	// Initialize id.
	useEffect(
		() => {
			if (idProp) {
				if (id !== idProp) {
					setId(idProp);
				}
			} else if (!id) {
				setId(uuid());
			}
		},
		[id, idProp],
	);

	return id;
};
