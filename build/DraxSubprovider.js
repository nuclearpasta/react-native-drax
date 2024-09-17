"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraxSubprovider = void 0;
const react_1 = __importDefault(require("react"));
const DraxContext_1 = require("./DraxContext");
const hooks_1 = require("./hooks");
const DraxSubprovider = ({ parent, children }) => {
    const contextValue = (0, hooks_1.useDraxContext)();
    const subContextValue = {
        ...contextValue,
        parent,
    };
    return (react_1.default.createElement(DraxContext_1.DraxContext.Provider, { value: subContextValue }, children));
};
exports.DraxSubprovider = DraxSubprovider;
