import {
	Animated,
	StyleProp,
	StyleSheet,
	ViewStyle,
} from 'react-native';

import { AnimatedViewStyleWithoutLayout } from './types';

export const flattenStylesWithoutLayout = (
	styles: StyleProp<Animated.WithAnimatedValue<ViewStyle>>[],
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
	transform: Animated.WithAnimatedValue<ViewStyle['transform']>,
): AnimatedViewStyleWithoutLayout => ({
	...style,
	transform: [
		...(transform ?? []),
		...(style.transform ?? []),
	],
});
