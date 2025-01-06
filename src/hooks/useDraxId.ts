import { useState } from "react";

import { generateRandomId } from "../math";

// Return explicitId, or a consistent randomly generated identifier if explicitId is falsy.
export const useDraxId = (explicitId?: string) => {
	// A generated unique identifier for this view, for use if id prop is not specified.
	const [randomId] = useState(generateRandomId);
	// We use || rather than ?? for the return value in case explicitId is an empty string.
	return explicitId || randomId;
};
