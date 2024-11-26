import { Animated, StyleProp, ViewStyle } from 'react-native';
import { AnimatedViewStyleWithoutLayout } from './types';
export declare const flattenStylesWithoutLayout: (styles: StyleProp<Animated.WithAnimatedValue<ViewStyle>>[]) => AnimatedViewStyleWithoutLayout;
export declare const mergeStyleTransform: (style: AnimatedViewStyleWithoutLayout, transform: Animated.WithAnimatedValue<ViewStyle['transform']>) => AnimatedViewStyleWithoutLayout;
