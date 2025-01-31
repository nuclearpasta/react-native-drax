import React, {
	PropsWithChildren,
	useRef,
	useCallback,
	useEffect,
	ForwardedRef,
	forwardRef,
} from "react";
import { ScrollView } from "react-native";
import Reanimated, {
	useAnimatedRef,
	useScrollViewOffset,
	useDerivedValue,
} from "react-native-reanimated";

import { DraxSubprovider } from "./DraxSubprovider";
import { DraxView } from "./DraxView";
import { useDraxId } from "./hooks";
import {
	defaultAutoScrollIntervalLength,
	defaultAutoScrollJumpRatio,
	defaultAutoScrollBackThreshold,
	defaultAutoScrollForwardThreshold,
	defaultScrollEventThrottle,
} from "./params";
import {
	DraxScrollViewProps,
	AutoScrollDirection,
	AutoScrollState,
	Position,
	DraxViewMeasurements,
	DraxMonitorEventData,
} from "./types";

const DraxScrollViewUnforwarded = (
	props: PropsWithChildren<DraxScrollViewProps>,
	forwardedRef: ForwardedRef<ScrollView>,
) => {
	const {
		children,
		style,
		onContentSizeChange: onContentSizeChangeProp,
		scrollEventThrottle = defaultScrollEventThrottle,
		autoScrollIntervalLength = defaultAutoScrollIntervalLength,
		autoScrollJumpRatio = defaultAutoScrollJumpRatio,
		autoScrollBackThreshold = defaultAutoScrollBackThreshold,
		autoScrollForwardThreshold = defaultAutoScrollForwardThreshold,
		horizontal,
		id: idProp,
		...scrollViewProps
	} = props;

	// Scrollable view, used for scrolling.
	const scrollRef = useAnimatedRef<Reanimated.ScrollView>();

	// Updates tracked scroll position when list is scrolled.
	const scrollHandler = useScrollViewOffset(scrollRef);

	// Scroll position, for Drax bounds checking and auto-scrolling.
	const scrollPosition = useDerivedValue(() => ({
		x: horizontal ? scrollHandler.value : 0,
		y: horizontal ? 0 : scrollHandler.value,
	}));

	// The unique identifer for this view.
	const id = useDraxId(idProp);

	// Container view measurements, for scrolling by percentage.
	const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
		undefined,
	);

	// Content size, for scrolling by percentage.
	const contentSizeRef = useRef<Position | undefined>(undefined);

	// Auto-scroll state.
	const autoScrollStateRef = useRef<AutoScrollState>({
		x: AutoScrollDirection.None,
		y: AutoScrollDirection.None,
	});

	// Auto-scroll interval.
	const autoScrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Handle auto-scrolling on interval.
	const doScroll = useCallback(() => {
		const scroll = scrollRef.current;
		const containerMeasurements = containerMeasurementsRef.current;
		const contentSize = contentSizeRef.current;
		if (!scroll || !containerMeasurements || !contentSize) {
			return;
		}
		const autoScrollState = autoScrollStateRef.current;
		const jump = {
			x: containerMeasurements.width * autoScrollJumpRatio,
			y: containerMeasurements.height * autoScrollJumpRatio,
		};
		let xNew: number | undefined;
		let yNew: number | undefined;
		if (autoScrollState.x === AutoScrollDirection.Forward) {
			const xMax = contentSize.x - containerMeasurements.width;
			if (scrollPosition.value.x < xMax) {
				xNew = Math.min(scrollPosition.value.x + jump.x, xMax);
			}
		} else if (autoScrollState.x === AutoScrollDirection.Back) {
			if (scrollPosition.value.x > 0) {
				xNew = Math.max(scrollPosition.value.x - jump.x, 0);
			}
		}
		if (autoScrollState.y === AutoScrollDirection.Forward) {
			const yMax = contentSize.y - containerMeasurements.height;
			if (scrollPosition.value.y < yMax) {
				yNew = Math.min(scrollPosition.value.y + jump.y, yMax);
			}
		} else if (autoScrollState.y === AutoScrollDirection.Back) {
			if (scrollPosition.value.y > 0) {
				yNew = Math.max(scrollPosition.value.y - jump.y, 0);
			}
		}
		if (xNew !== undefined || yNew !== undefined) {
			scroll.scrollTo({
				x: xNew ?? scrollPosition.value.x,
				y: yNew ?? scrollPosition.value.y,
			});
			(scroll as any).flashScrollIndicators(); // ScrollView typing is missing this method
		}
	}, [autoScrollJumpRatio, scrollRef]);

	// Start the auto-scrolling interval.
	const startScroll = useCallback(() => {
		if (autoScrollIntervalRef.current) {
			return;
		}
		doScroll();
		autoScrollIntervalRef.current = setInterval(
			doScroll,
			autoScrollIntervalLength,
		);
	}, [doScroll, autoScrollIntervalLength]);

	// Stop the auto-scrolling interval.
	const stopScroll = useCallback(() => {
		if (autoScrollIntervalRef.current) {
			clearInterval(autoScrollIntervalRef.current);
			autoScrollIntervalRef.current = undefined;
		}
	}, []);

	// If startScroll changes, refresh our interval.
	useEffect(() => {
		if (autoScrollIntervalRef.current) {
			stopScroll();
			startScroll();
		}
	}, [stopScroll, startScroll]);

	// Clear auto-scroll direction and stop the auto-scrolling interval.
	const resetScroll = useCallback(() => {
		const autoScrollState = autoScrollStateRef.current;
		autoScrollState.x = AutoScrollDirection.None;
		autoScrollState.y = AutoScrollDirection.None;
		stopScroll();
	}, [stopScroll]);

	// Track the size of the container view.
	const onMeasureContainer = useCallback(
		(measurements: DraxViewMeasurements | undefined) => {
			containerMeasurementsRef.current = measurements;
		},
		[],
	);

	// Monitor drag-over events to react with auto-scrolling.
	const onMonitorDragOver = useCallback(
		(event: DraxMonitorEventData) => {
			const { monitorOffsetRatio } = event;
			const autoScrollState = autoScrollStateRef.current;
			if (monitorOffsetRatio.x >= autoScrollForwardThreshold) {
				autoScrollState.x = AutoScrollDirection.Forward;
			} else if (monitorOffsetRatio.x <= autoScrollBackThreshold) {
				autoScrollState.x = AutoScrollDirection.Back;
			} else {
				autoScrollState.x = AutoScrollDirection.None;
			}
			if (monitorOffsetRatio.y >= autoScrollForwardThreshold) {
				autoScrollState.y = AutoScrollDirection.Forward;
			} else if (monitorOffsetRatio.y <= autoScrollBackThreshold) {
				autoScrollState.y = AutoScrollDirection.Back;
			} else {
				autoScrollState.y = AutoScrollDirection.None;
			}
			if (
				autoScrollState.x === AutoScrollDirection.None &&
				autoScrollState.y === AutoScrollDirection.None
			) {
				stopScroll();
			} else {
				startScroll();
			}
		},
		[
			stopScroll,
			startScroll,
			autoScrollBackThreshold,
			autoScrollForwardThreshold,
		],
	);

	// Set the ScrollView and node handle refs.
	const setScrollViewRefs = useCallback(
		(ref: Reanimated.ScrollView) => {
			scrollRef(ref);
			if (forwardedRef) {
				if (typeof forwardedRef === "function") {
					forwardedRef(ref);
				} else {
					forwardedRef.current = ref;
				}
			}
		},
		[forwardedRef, scrollRef],
	);

	// Track content size.
	const onContentSizeChange = useCallback(
		(width: number, height: number) => {
			contentSizeRef.current = { x: width, y: height };
			return onContentSizeChangeProp?.(width, height);
		},
		[onContentSizeChangeProp],
	);

	return id ? (
		<DraxView
			id={id}
			style={style}
			scrollPosition={scrollPosition}
			onMeasure={onMeasureContainer}
			onMonitorDragOver={onMonitorDragOver}
			onMonitorDragExit={resetScroll}
			onMonitorDragEnd={resetScroll}
			onMonitorDragDrop={resetScroll}
		>
			<DraxSubprovider parent={{ id, viewRef: scrollRef }}>
				<Reanimated.ScrollView
					{...scrollViewProps}
					horizontal={horizontal}
					ref={setScrollViewRefs}
					onContentSizeChange={onContentSizeChange}
					scrollEventThrottle={scrollEventThrottle}
				>
					{children}
				</Reanimated.ScrollView>
			</DraxSubprovider>
		</DraxView>
	) : null;
};

export const DraxScrollView = forwardRef<
	ScrollView,
	PropsWithChildren<DraxScrollViewProps>
>(DraxScrollViewUnforwarded);
