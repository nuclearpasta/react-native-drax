import React, { PropsWithChildren } from "react";

import { DraxContext } from "./DraxContext";
import { useDraxContext } from "./hooks";
import { DraxSubproviderProps } from "./types";

export const DraxSubprovider = ({
	parent,
	children,
}: PropsWithChildren<DraxSubproviderProps>) => {
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
