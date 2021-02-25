import React, { FunctionComponent } from "react";

import { DraxContext } from "./DraxContext";
import { DraxSubproviderProps } from "./types";
import { useDraxContext } from "./hooks";

export const DraxSubprovider: FunctionComponent<DraxSubproviderProps> = ({
	parent,
	children,
}) => {
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
