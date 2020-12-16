import { StyleSheet } from 'react-native';

import {
	AnimatedTransform,
	AnimatedViewStyleProp,
	AnimatedViewStyleWithoutLayout,
} from './types';

export const flattenStylesWithoutLayout = (
	styles: AnimatedViewStyleProp[],
): AnimatedViewStyleWithoutLayout => {
	const {
		margin,
		marginHorizontal,
		marginVertical,
		marginLeft,
		marginRight,
		marginTop,
		marginBottom,
		marginStart,
		marginEnd,
		left,
		right,
		top,
		bottom,
		flex,
		flexBasis,
		flexDirection,
		flexGrow,
		flexShrink,
		...flattened
	} = StyleSheet.flatten(styles);
	return flattened;
};

export const mergeStyleTransform = (
	style: AnimatedViewStyleWithoutLayout,
	transform: AnimatedTransform,
): AnimatedViewStyleWithoutLayout => ({
	...style,
	transform: [
		...(transform ?? []),
		...(style.transform ?? []),
	],
});
