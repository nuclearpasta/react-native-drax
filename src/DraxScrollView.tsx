import React, {
	PropsWithChildren,
	useRef,
	useCallback,
	useEffect,
	ForwardedRef,
	forwardRef,
} from 'react';
import {
	ScrollView,
	NativeSyntheticEvent,
	NativeScrollEvent,
} from 'react-native';

import { DraxView } from './DraxView';
import { DraxSubprovider } from './DraxSubprovider';
import { useDraxId } from './hooks';
import {
	DraxScrollViewProps,
	AutoScrollDirection,
	AutoScrollState,
	Position,
	DraxViewMeasurements,
	DraxMonitorEventData,
} from './types';
import {
	defaultAutoScrollIntervalLength,
	defaultAutoScrollJumpRatio,
	defaultAutoScrollBackThreshold,
	defaultAutoScrollForwardThreshold,
	defaultScrollEventThrottle,
} from './params';

const DraxScrollViewUnforwarded = (
	props: PropsWithChildren<DraxScrollViewProps>,
	forwardedRef: ForwardedRef<ScrollView>,
) => {
	const {
		children,
		style,
		onScroll: onScrollProp,
		onContentSizeChange: onContentSizeChangeProp,
		scrollEventThrottle = defaultScrollEventThrottle,
		autoScrollIntervalLength = defaultAutoScrollIntervalLength,
		autoScrollJumpRatio = defaultAutoScrollJumpRatio,
		autoScrollBackThreshold = defaultAutoScrollBackThreshold,
		autoScrollForwardThreshold = defaultAutoScrollForwardThreshold,
		id: idProp,
		...scrollViewProps
	} = props;

	// The unique identifer for this view.
	const id = useDraxId(idProp);

	// Scrollable view, used for scrolling and measuring children
	const scrollRef = useRef<ScrollView | null>(null);

	// Container view measurements, for scrolling by percentage.
	const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(undefined);

	// Content size, for scrolling by percentage.
	const contentSizeRef = useRef<Position | undefined>(undefined);

	// Scroll position, for Drax bounds checking and auto-scrolling.
	const scrollPositionRef = useRef<Position>({ x: 0, y: 0 });

	// Auto-scroll state.
	const autoScrollStateRef = useRef<AutoScrollState>({
		x: AutoScrollDirection.None,
		y: AutoScrollDirection.None,
	});

	// Auto-scroll interval.
	const autoScrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Handle auto-scrolling on interval.
	const doScroll = useCallback(
		() => {
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
			let xNew: number | undefined;
			let yNew: number | undefined;
			if (autoScrollState.x === AutoScrollDirection.Forward) {
				const xMax = contentSize.x - containerMeasurements.width;
				if (scrollPosition.x < xMax) {
					xNew = Math.min(scrollPosition.x + jump.x, xMax);
				}
			} else if (autoScrollState.x === AutoScrollDirection.Back) {
				if (scrollPosition.x > 0) {
					xNew = Math.max(scrollPosition.x - jump.x, 0);
				}
			}
			if (autoScrollState.y === AutoScrollDirection.Forward) {
				const yMax = contentSize.y - containerMeasurements.height;
				if (scrollPosition.y < yMax) {
					yNew = Math.min(scrollPosition.y + jump.y, yMax);
				}
			} else if (autoScrollState.y === AutoScrollDirection.Back) {
				if (scrollPosition.y > 0) {
					yNew = Math.max(scrollPosition.y - jump.y, 0);
				}
			}
			if (xNew !== undefined || yNew !== undefined) {
				scroll.scrollTo({
					x: xNew ?? scrollPosition.x,
					y: yNew ?? scrollPosition.y,
				});
				(scroll as any).flashScrollIndicators(); // ScrollView typing is missing this method
			}
		},
		[autoScrollJumpRatio],
	);

	// Start the auto-scrolling interval.
	const startScroll = useCallback(
		() => {
			if (autoScrollIntervalRef.current) {
				return;
			}
			doScroll();
			autoScrollIntervalRef.current = setInterval(doScroll, autoScrollIntervalLength);
		},
		[doScroll, autoScrollIntervalLength],
	);

	// Stop the auto-scrolling interval.
	const stopScroll = useCallback(
		() => {
			if (autoScrollIntervalRef.current) {
				clearInterval(autoScrollIntervalRef.current);
				autoScrollIntervalRef.current = undefined;
			}
		},
		[],
	);

	// If startScroll changes, refresh our interval.
	useEffect(
		() => {
			if (autoScrollIntervalRef.current) {
				stopScroll();
				startScroll();
			}
		},
		[stopScroll, startScroll],
	);

	// Clear auto-scroll direction and stop the auto-scrolling interval.
	const resetScroll = useCallback(
		() => {
			const autoScrollState = autoScrollStateRef.current;
			autoScrollState.x = AutoScrollDirection.None;
			autoScrollState.y = AutoScrollDirection.None;
			stopScroll();
		},
		[stopScroll],
	);

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
			if (autoScrollState.x === AutoScrollDirection.None && autoScrollState.y === AutoScrollDirection.None) {
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
		(ref: ScrollView | null) => {
			scrollRef.current = ref;
			if (forwardedRef) {
				if (typeof forwardedRef === 'function') {
					forwardedRef(ref);
				} else {
					// eslint-disable-next-line no-param-reassign
					forwardedRef.current = ref;
				}
			}
		},
		[forwardedRef],
	);

	// Track content size.
	const onContentSizeChange = useCallback(
		(width: number, height: number) => {
			contentSizeRef.current = { x: width, y: height };
			return onContentSizeChangeProp?.(width, height);
		},
		[onContentSizeChangeProp],
	);

	// Update tracked scroll position when list is scrolled.
	const onScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { nativeEvent: { contentOffset } } = event;
			scrollPositionRef.current = { ...contentOffset };
			return onScrollProp?.(event);
		},
		[onScrollProp],
	);

	return id ? (
		<DraxView
			id={id}
			style={style}
			scrollPositionRef={scrollPositionRef}
			onMeasure={onMeasureContainer}
			onMonitorDragOver={onMonitorDragOver}
			onMonitorDragExit={resetScroll}
			onMonitorDragEnd={resetScroll}
			onMonitorDragDrop={resetScroll}
		>
			<DraxSubprovider parent={{ id, nodeViewRef: scrollRef }}>
				<ScrollView
					{...scrollViewProps}
					ref={setScrollViewRefs}
					onContentSizeChange={onContentSizeChange}
					onScroll={onScroll}
					scrollEventThrottle={scrollEventThrottle}
				>
					{children}
				</ScrollView>
			</DraxSubprovider>
		</DraxView>
	) : null;
};

export const DraxScrollView = forwardRef<ScrollView, PropsWithChildren<DraxScrollViewProps>>(DraxScrollViewUnforwarded);
