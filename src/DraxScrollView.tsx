import React, {
	PropsWithChildren,
	useRef,
	useCallback,
	ForwardedRef,
	forwardRef,
} from "react";
import { ScrollView } from "react-native";
import Reanimated from "react-native-reanimated";

import { DraxSubprovider } from "./DraxSubprovider";
import { DraxView } from "./DraxView";
import { useDraxScrollHandler } from "./hooks/useDraxScrollHandler";
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
		id: idProp,
		...scrollViewProps
	} = props;

	// Auto-scroll state.
	const autoScrollStateRef = useRef<AutoScrollState>({
		x: AutoScrollDirection.None,
		y: AutoScrollDirection.None,
	});

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
	}, [autoScrollJumpRatio]);

	const {
		id,
		containerMeasurementsRef,
		contentSizeRef,
		onContentSizeChange,
		onMeasureContainer,
		onScroll,
		scrollRef,
		scrollPosition,
		setScrollRefs,
		startScroll,
		stopScroll,
	} = useDraxScrollHandler<ScrollView>({
		idProp,
		onContentSizeChangeProp,
		onScrollProp: props?.onScroll,
		forwardedRef,
		doScroll,
	});

	// Clear auto-scroll direction and stop the auto-scrolling interval.
	const resetScroll = useCallback(() => {
		const autoScrollState = autoScrollStateRef.current;
		autoScrollState.x = AutoScrollDirection.None;
		autoScrollState.y = AutoScrollDirection.None;
		stopScroll();
	}, [stopScroll]);

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
					ref={setScrollRefs}
					onContentSizeChange={onContentSizeChange}
					scrollEventThrottle={scrollEventThrottle}
					onScroll={onScroll}
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
