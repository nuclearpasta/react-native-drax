import { useState, useEffect } from 'react';
import uuid from 'uuid/v4';

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
