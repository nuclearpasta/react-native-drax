import { ForwardedRef, useCallback, useEffect, useRef } from "react";
import {
	FlatList,
	NativeScrollEvent,
	NativeSyntheticEvent,
	ScrollView,
} from "react-native";
import {
	runOnUI,
	useAnimatedRef,
	useSharedValue,
} from "react-native-reanimated";

import { INITIAL_REANIMATED_POSITION } from "../params";
import { DraxListProps, DraxViewMeasurements, Position } from "../types";
import { useDraxId } from "./useDraxId";

type DraxScrollHandlerArgs<T> = {
	idProp?: string;
	onContentSizeChangeProp?: DraxListProps<T>["onContentSizeChange"];
	onScrollProp: DraxListProps<any>["onScroll"];
	forwardedRef?: ForwardedRef<any>;
	doScroll: () => void;
};

type ScrollableComponents = FlatList<any> | ScrollView;

export const useDraxScrollHandler = <T extends ScrollableComponents>({
	idProp,
	onContentSizeChangeProp,
	onScrollProp,
	forwardedRef,
	doScroll,
}: DraxScrollHandlerArgs<T>) => {
	// Scrollable view, used for scrolling.
	const scrollRef = useAnimatedRef<T>();

	// The unique identifer for this view.
	const id = useDraxId(idProp);

	// Container view measurements, for scrolling by percentage.
	const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
		undefined,
	);

	// Auto-scrolling interval.
	const scrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Content size, for scrolling by percentage.
	const contentSizeRef = useRef<Position | undefined>(undefined);

	const scrollPosition = useSharedValue<Position>(
		INITIAL_REANIMATED_POSITION.value,
	);

	// Track the size of the container view.
	const onMeasureContainer = useCallback(
		(measurements: DraxViewMeasurements | undefined) => {
			containerMeasurementsRef.current = measurements;
		},
		[],
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
			onScrollProp?.(event);

			runOnUI((_event: NativeScrollEvent) => {
				scrollPosition.value = {
					x: _event.contentOffset.x,
					y: _event.contentOffset.y,
				};
			})(event.nativeEvent);
		},
		[onScrollProp],
	);

	// Set the ScrollView/FlatList refs.
	const setScrollRefs = useCallback(
		(ref: T | null) => {
			if (ref) {
				scrollRef(ref);
				if (forwardedRef) {
					if (typeof forwardedRef === "function") {
						forwardedRef(ref);
					} else {
						forwardedRef.current = ref;
					}
				}
			}
		},
		[forwardedRef, scrollRef],
	);

	// Start the auto-scrolling interval.
	const startScroll = useCallback(() => {
		if (scrollIntervalRef.current) {
			return;
		}
		doScroll();
		scrollIntervalRef.current = setInterval(doScroll, 250);
	}, [doScroll]);

	// Stop the auto-scrolling interval.
	const stopScroll = useCallback(() => {
		if (scrollIntervalRef.current) {
			clearInterval(scrollIntervalRef.current);
			scrollIntervalRef.current = undefined;
		}
	}, []);

	// If startScroll changes, refresh our interval.
	useEffect(() => {
		if (scrollIntervalRef.current) {
			stopScroll();
			startScroll();
		}
	}, [stopScroll, startScroll]);

	return {
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
	};
};
