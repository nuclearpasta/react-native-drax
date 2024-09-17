import { DraxViewMeasurements, Position } from './types';
export declare const clipMeasurements: (vm: DraxViewMeasurements, cvm: DraxViewMeasurements) => DraxViewMeasurements;
export declare const isPointInside: ({ x, y }: Position, { width, height, x: x0, y: y0, }: DraxViewMeasurements) => boolean;
export declare const getRelativePosition: ({ x, y }: Position, { width, height, x: x0, y: y0, }: DraxViewMeasurements) => {
    relativePosition: {
        x: number;
        y: number;
    };
    relativePositionRatio: {
        x: number;
        y: number;
    };
};
export declare const extractPosition: ({ x, y }: DraxViewMeasurements) => {
    x: number;
    y: number;
};
export declare const extractDimensions: ({ width, height }: DraxViewMeasurements) => {
    width: number;
    height: number;
};
export declare const generateRandomId: () => string;
