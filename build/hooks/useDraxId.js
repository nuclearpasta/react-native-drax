"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDraxId = void 0;
const react_1 = require("react");
const math_1 = require("../math");
// Return explicitId, or a consistent randomly generated identifier if explicitId is falsy.
const useDraxId = (explicitId) => {
    // A generated unique identifier for this view, for use if id prop is not specified.
    const [randomId] = (0, react_1.useState)(math_1.generateRandomId);
    // We use || rather than ?? for the return value in case explicitId is an empty string.
    return explicitId || randomId;
};
exports.useDraxId = useDraxId;
