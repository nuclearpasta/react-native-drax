// import React, { useMemo } from "react";
//
// import { ReanimatedHoverView } from "./HoverView";
// import { useDraxContext } from "./hooks";
//
// export const AllHoverViews = ({ allViewIds }: { allViewIds: string[] }) => {
// 	const { getHoverItems } = useDraxContext();
//
// 	const hoverViews = useMemo(
// 		() => allViewIds && getHoverItems(allViewIds),
// 		[allViewIds, getHoverItems],
// 	);
// 	//   const updateHoverViews = () => {
// 	//     console.log('getAllViewIds()', allViewIds);
// 	//     console.log('getHoverItems(getAllViewIds())', allViewIds && getHoverItems(allViewIds));
// 	//     allViewIds && setAllHoverViews(getHoverItems(allViewIds));
// 	//   };
// 	return hoverViews?.map(
// 		(viewData, index) =>
// 			viewData?.protocol.hoverPosition?.value && (
// 				<ReanimatedHoverView
// 					key={viewData.id || index}
// 					hoverPosition={viewData?.protocol.hoverPosition}
// 					scrollPosition={viewData?.scrollPosition}
// 					{...(viewData?.protocol || {})}
// 				/>
// 			),
// 	);
// };
