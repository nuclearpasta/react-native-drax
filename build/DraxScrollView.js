"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraxScrollView = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const DraxView_1 = require("./DraxView");
const DraxSubprovider_1 = require("./DraxSubprovider");
const hooks_1 = require("./hooks");
const types_1 = require("./types");
const params_1 = require("./params");
const DraxScrollViewUnforwarded = (props, forwardedRef) => {
    const { children, style, onScroll: onScrollProp, onContentSizeChange: onContentSizeChangeProp, scrollEventThrottle = params_1.defaultScrollEventThrottle, autoScrollIntervalLength = params_1.defaultAutoScrollIntervalLength, autoScrollJumpRatio = params_1.defaultAutoScrollJumpRatio, autoScrollBackThreshold = params_1.defaultAutoScrollBackThreshold, autoScrollForwardThreshold = params_1.defaultAutoScrollForwardThreshold, id: idProp, ...scrollViewProps } = props;
    // The unique identifer for this view.
    const id = (0, hooks_1.useDraxId)(idProp);
    // Scrollable view, used for scrolling.
    const scrollRef = (0, react_1.useRef)(null);
    // ScrollView node handle, used for measuring children.
    const nodeHandleRef = (0, react_1.useRef)(null);
    // Container view measurements, for scrolling by percentage.
    const containerMeasurementsRef = (0, react_1.useRef)(undefined);
    // Content size, for scrolling by percentage.
    const contentSizeRef = (0, react_1.useRef)(undefined);
    // Scroll position, for Drax bounds checking and auto-scrolling.
    const scrollPositionRef = (0, react_1.useRef)({ x: 0, y: 0 });
    // Auto-scroll state.
    const autoScrollStateRef = (0, react_1.useRef)({
        x: types_1.AutoScrollDirection.None,
        y: types_1.AutoScrollDirection.None,
    });
    // Auto-scroll interval.
    const autoScrollIntervalRef = (0, react_1.useRef)(undefined);
    // Handle auto-scrolling on interval.
    const doScroll = (0, react_1.useCallback)(() => {
        const scroll = scrollRef.current;
        const containerMeasurements = containerMeasurementsRef.current;
        const contentSize = contentSizeRef.current;
        if (!scroll || !containerMeasurements || !contentSize) {
            return;
        }
        const scrollPosition = scrollPositionRef.current;
        const autoScrollState = autoScrollStateRef.current;
        const jump = {
            x: containerMeasurements.width * autoScrollJumpRatio,
            y: containerMeasurements.height * autoScrollJumpRatio,
        };
        let xNew;
        let yNew;
        if (autoScrollState.x === types_1.AutoScrollDirection.Forward) {
            const xMax = contentSize.x - containerMeasurements.width;
            if (scrollPosition.x < xMax) {
                xNew = Math.min(scrollPosition.x + jump.x, xMax);
            }
        }
        else if (autoScrollState.x === types_1.AutoScrollDirection.Back) {
            if (scrollPosition.x > 0) {
                xNew = Math.max(scrollPosition.x - jump.x, 0);
            }
        }
        if (autoScrollState.y === types_1.AutoScrollDirection.Forward) {
            const yMax = contentSize.y - containerMeasurements.height;
            if (scrollPosition.y < yMax) {
                yNew = Math.min(scrollPosition.y + jump.y, yMax);
            }
        }
        else if (autoScrollState.y === types_1.AutoScrollDirection.Back) {
            if (scrollPosition.y > 0) {
                yNew = Math.max(scrollPosition.y - jump.y, 0);
            }
        }
        if (xNew !== undefined || yNew !== undefined) {
            scroll.scrollTo({
                x: xNew ?? scrollPosition.x,
                y: yNew ?? scrollPosition.y,
            });
            scroll.flashScrollIndicators(); // ScrollView typing is missing this method
        }
    }, [autoScrollJumpRatio]);
    // Start the auto-scrolling interval.
    const startScroll = (0, react_1.useCallback)(() => {
        if (autoScrollIntervalRef.current) {
            return;
        }
        doScroll();
        autoScrollIntervalRef.current = setInterval(doScroll, autoScrollIntervalLength);
    }, [doScroll, autoScrollIntervalLength]);
    // Stop the auto-scrolling interval.
    const stopScroll = (0, react_1.useCallback)(() => {
        if (autoScrollIntervalRef.current) {
            clearInterval(autoScrollIntervalRef.current);
            autoScrollIntervalRef.current = undefined;
        }
    }, []);
    // If startScroll changes, refresh our interval.
    (0, react_1.useEffect)(() => {
        if (autoScrollIntervalRef.current) {
            stopScroll();
            startScroll();
        }
    }, [stopScroll, startScroll]);
    // Clear auto-scroll direction and stop the auto-scrolling interval.
    const resetScroll = (0, react_1.useCallback)(() => {
        const autoScrollState = autoScrollStateRef.current;
        autoScrollState.x = types_1.AutoScrollDirection.None;
        autoScrollState.y = types_1.AutoScrollDirection.None;
        stopScroll();
    }, [stopScroll]);
    // Track the size of the container view.
    const onMeasureContainer = (0, react_1.useCallback)((measurements) => {
        containerMeasurementsRef.current = measurements;
    }, []);
    // Monitor drag-over events to react with auto-scrolling.
    const onMonitorDragOver = (0, react_1.useCallback)((event) => {
        const { monitorOffsetRatio } = event;
        const autoScrollState = autoScrollStateRef.current;
        if (monitorOffsetRatio.x >= autoScrollForwardThreshold) {
            autoScrollState.x = types_1.AutoScrollDirection.Forward;
        }
        else if (monitorOffsetRatio.x <= autoScrollBackThreshold) {
            autoScrollState.x = types_1.AutoScrollDirection.Back;
        }
        else {
            autoScrollState.x = types_1.AutoScrollDirection.None;
        }
        if (monitorOffsetRatio.y >= autoScrollForwardThreshold) {
            autoScrollState.y = types_1.AutoScrollDirection.Forward;
        }
        else if (monitorOffsetRatio.y <= autoScrollBackThreshold) {
            autoScrollState.y = types_1.AutoScrollDirection.Back;
        }
        else {
            autoScrollState.y = types_1.AutoScrollDirection.None;
        }
        if (autoScrollState.x === types_1.AutoScrollDirection.None && autoScrollState.y === types_1.AutoScrollDirection.None) {
            stopScroll();
        }
        else {
            startScroll();
        }
    }, [
        stopScroll,
        startScroll,
        autoScrollBackThreshold,
        autoScrollForwardThreshold,
    ]);
    // Set the ScrollView and node handle refs.
    const setScrollViewRefs = (0, react_1.useCallback)((ref) => {
        scrollRef.current = ref;
        nodeHandleRef.current = ref && (0, react_native_1.findNodeHandle)(ref);
        if (forwardedRef) {
            if (typeof forwardedRef === 'function') {
                forwardedRef(ref);
            }
            else {
                // eslint-disable-next-line no-param-reassign
                forwardedRef.current = ref;
            }
        }
    }, [forwardedRef]);
    // Track content size.
    const onContentSizeChange = (0, react_1.useCallback)((width, height) => {
        contentSizeRef.current = { x: width, y: height };
        return onContentSizeChangeProp?.(width, height);
    }, [onContentSizeChangeProp]);
    // Update tracked scroll position when list is scrolled.
    const onScroll = (0, react_1.useCallback)((event) => {
        const { nativeEvent: { contentOffset } } = event;
        scrollPositionRef.current = { ...contentOffset };
        return onScrollProp?.(event);
    }, [onScrollProp]);
    return id ? (react_1.default.createElement(DraxView_1.DraxView, { id: id, style: style, scrollPositionRef: scrollPositionRef, onMeasure: onMeasureContainer, onMonitorDragOver: onMonitorDragOver, onMonitorDragExit: resetScroll, onMonitorDragEnd: resetScroll, onMonitorDragDrop: resetScroll },
        react_1.default.createElement(DraxSubprovider_1.DraxSubprovider, { parent: { id, nodeHandleRef } },
            react_1.default.createElement(react_native_1.ScrollView, { ...scrollViewProps, ref: setScrollViewRefs, onContentSizeChange: onContentSizeChange, onScroll: onScroll, scrollEventThrottle: scrollEventThrottle }, children)))) : null;
};
exports.DraxScrollView = (0, react_1.forwardRef)(DraxScrollViewUnforwarded);
