"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomId = exports.extractDimensions = exports.extractPosition = exports.getRelativePosition = exports.isPointInside = exports.clipMeasurements = void 0;
const clipMeasurements = (vm, cvm) => {
    let { width, height, x: x0, y: y0, } = vm;
    let x1 = x0 + width;
    let y1 = y0 + height;
    const { width: cwidth, height: cheight, x: cx0, y: cy0, } = cvm;
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
exports.clipMeasurements = clipMeasurements;
const isPointInside = ({ x, y }, { width, height, x: x0, y: y0, }) => (x >= x0 && y >= y0 && x < x0 + width && y < y0 + height);
exports.isPointInside = isPointInside;
const getRelativePosition = ({ x, y }, { width, height, x: x0, y: y0, }) => {
    const rx = x - x0;
    const ry = y - y0;
    return {
        relativePosition: { x: rx, y: ry },
        relativePositionRatio: { x: rx / width, y: ry / height },
    };
};
exports.getRelativePosition = getRelativePosition;
const extractPosition = ({ x, y }) => ({ x, y });
exports.extractPosition = extractPosition;
const extractDimensions = ({ width, height }) => ({ width, height });
exports.extractDimensions = extractDimensions;
/*
 * Previously we were using the uuid library to generate unique identifiers for Drax
 * components. Since we do not need them to be cryptographically secure and likely
 * won't need very many of them, let's just use this simple function.
 */
const generateRandomId = () => (`${Math.random().toString(36).substr(2)}${Math.random().toString(36).substr(2)}`);
exports.generateRandomId = generateRandomId;
