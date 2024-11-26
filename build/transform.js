"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeStyleTransform = exports.flattenStylesWithoutLayout = void 0;
const react_native_1 = require("react-native");
const flattenStylesWithoutLayout = (styles) => {
    const { margin, marginHorizontal, marginVertical, marginLeft, marginRight, marginTop, marginBottom, marginStart, marginEnd, left, right, top, bottom, flex, flexBasis, flexDirection, flexGrow, flexShrink, ...flattened } = react_native_1.StyleSheet.flatten(styles);
    return flattened;
};
exports.flattenStylesWithoutLayout = flattenStylesWithoutLayout;
const mergeStyleTransform = (style, transform) => ({
    ...style,
    transform: [
        ...(transform ?? []),
        ...(style.transform ?? []),
    ],
});
exports.mergeStyleTransform = mergeStyleTransform;
