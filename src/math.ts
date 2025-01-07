import { PropsWithChildren } from "react";
import { runOnJS, SharedValue } from "react-native-reanimated";

import {
	DraxAbsoluteViewData,
	DraxViewMeasurements,
	GetDragPositionDataParams,
	Position,
	TReanimatedHoverViewProps,
	TStartPosition,
} from "./types";

export const clipMeasurements = (
	vm: DraxViewMeasurements,
	cvm: DraxViewMeasurements,
): DraxViewMeasurements => {
	"worklet";

	let { width, height, x: x0, y: y0 } = vm;
	let x1 = x0 + width;
	let y1 = y0 + height;
	const { width: cwidth, height: cheight, x: cx0, y: cy0 } = cvm;
	const cx1 = cx0 + cwidth;
	const cy1 = cy0 + cheight;
	if (x0 >= cx1 || x1 <= cx0 || y0 >= cy1 || y1 <= cy0) {
		return {
			x: -1,
			y: -1,
			width: 0,
			height: 0,
		};
	}
	if (x0 < cx0) {
		width -= cx0 - x0;
		x0 = cx0;
	}
	if (x1 > cx1) {
		width -= x1 - cx1;
		x1 = cx1;
	}
	if (y0 < cy0) {
		height -= cy0 - y0;
		y0 = cy0;
	}
	if (y1 > cy1) {
		height -= y1 - cy1;
		y1 = cy1;
	}
	return {
		width,
		height,
		x: x0,
		y: y0,
	};
};

export const isPointInside = (
	{ x, y }: Position,
	{ width, height, x: x0, y: y0 }: DraxViewMeasurements,
): boolean => x >= x0 && y >= y0 && x < x0 + width && y < y0 + height;

export const getRelativePosition = (
	{ x, y }: Position,
	{ width, height, x: x0, y: y0 }: DraxViewMeasurements,
) => {
	const rx = x - x0;
	const ry = y - y0;
	return {
		relativePosition: { x: rx, y: ry },
		relativePositionRatio: { x: rx / width, y: ry / height },
	};
};

export const extractPosition = ({ x, y }: DraxViewMeasurements) => ({ x, y });
export const extractDimensions = ({ width, height }: DraxViewMeasurements) => ({
	width,
	height,
});

/*
 * Previously we were using the uuid library to generate unique identifiers for Drax
 * components. Since we do not need them to be cryptographically secure and likely
 * won't need very many of them, let's just use this simple function.
 */
export const generateRandomId = () =>
	`${Math.random().toString(36).substr(2)}${Math.random().toString(36).substr(2)}`;

export const updateHoverPosition = (
	parentPos: Position,
	hoverPosition: SharedValue<Position> | undefined,
	startPosition: SharedValue<TStartPosition>,
	props: Omit<PropsWithChildren<TReanimatedHoverViewProps>, "internalProps">,
	scrollPosition?: SharedValue<Position>,
	absoluteMeasurements?: DraxAbsoluteViewData["absoluteMeasurements"],
) => {
	"worklet";

	if (
		absoluteMeasurements &&
		hoverPosition?.value &&
		scrollPosition?.value &&
		![
			startPosition.value.parent.x,
			startPosition.value.parent.y,
			startPosition.value.grab.x,
			startPosition.value.grab.y,
		].every((item) => item === 0)
	) {
		// console.log("entered updateHover?");

		/**
		 * Get the absolute position of a drag already in progress from touch
		 * coordinates within the immediate parent view of the dragged view.
		 */
		const getDragPositionDataFromRegistry = ({
			// parentPosition: _parentPosition,
			draggedMeasurements,
			lockXPosition = false,
			lockYPosition = false,
		}: GetDragPositionDataParams) => {
			/*
			 * To determine drag position in absolute coordinates, we add:
			 *   absolute coordinates of drag start
			 *   + translation offset of drag
			 */

			const absoluteStartPosition = {
				x: absoluteMeasurements?.x + startPosition.value.grab.x,
				y: absoluteMeasurements?.y + startPosition.value.grab.y,
			}; // dragAbsolutePosition,
			const parentStartPosition = startPosition.value.parent;

			const dragTranslation = {
				x: lockXPosition ? 0 : parentPos.x - parentStartPosition.x,
				y: lockYPosition ? 0 : parentPos.y - parentStartPosition.y,
			};
			const dragTranslationRatio = {
				x: dragTranslation.x / draggedMeasurements.width,
				y: dragTranslation.y / draggedMeasurements.height,
			};
			const dragAbsolutePosition = {
				x: absoluteStartPosition.x + dragTranslation.x,
				y: absoluteStartPosition.y + dragTranslation.y,
			};
			return {
				dragAbsolutePosition,
				dragTranslation,
				dragTranslationRatio,
			};
		};

		// Get the absolute position data for the drag touch.
		const dragPositionData = getDragPositionDataFromRegistry({
			parentPosition: parentPos,
			draggedMeasurements: absoluteMeasurements,
			lockXPosition: props.lockDragXPosition,
			lockYPosition: props.lockDragYPosition,
		});

		if (!dragPositionData) {
			// Failed to get drag position data. This should never happen.
			return;
		}

		const { dragAbsolutePosition } = dragPositionData;
		// runOnJS(console.log)("scrollPosition", scrollPosition);
		const x =
			dragAbsolutePosition.x - scrollPosition?.value?.x
				? startPosition.value.grab.x + scrollPosition?.value?.x
				: startPosition.value.grab.x;

		const y =
			dragAbsolutePosition.y - scrollPosition?.value?.y
				? startPosition.value.grab.y + scrollPosition?.value?.y
				: startPosition.value.grab.y;
		//
		// hoverPosition.value = {
		// 	x,
		// 	y,
		// };
	}
	// runOnJS(console.log)('updateHoverPosition', viewData);
};
