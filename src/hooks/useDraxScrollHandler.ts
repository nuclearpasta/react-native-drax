import type { Ref, RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { FlatList, ScrollView } from 'react-native';
import {
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';

import type { AutoScrollTimer } from '../autoScrollTimer';
import { startAutoScrollTimer, stopAutoScrollTimer } from '../autoScrollTimer';
import type { DraxViewMeasurements, Position } from '../types';
import { useDraxId } from './useDraxId';

// FlatList is invariant in its type parameter — `any` is the only valid union constraint
type ScrollableComponents = FlatList<any> | ScrollView;

type DraxScrollHandlerArgs<T extends ScrollableComponents> = {
  idProp?: string;
  onContentSizeChangeProp?: (w: number, h: number) => void;
  onScrollProp?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  externalRef?: Ref<T>;
  doScroll: RefObject<() => void>;
  autoScrollIntervalLength: number;
  autoScrollInitialDelay: number;
};

export const useDraxScrollHandler = <T extends ScrollableComponents>({
  idProp,
  onContentSizeChangeProp,
  onScrollProp,
  externalRef,
  doScroll,
  autoScrollIntervalLength,
  autoScrollInitialDelay,
}: DraxScrollHandlerArgs<T>) => {
  const scrollRef = useRef<T>(null);
  const id = useDraxId(idProp);
  const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
    undefined
  );
  const scrollTimerRef = useRef<AutoScrollTimer>({});
  const contentSizeRef = useRef<Position | undefined>(undefined);

  const scrollPosition = useSharedValue<Position>({ x: 0, y: 0 });

  const onMeasureContainer = (measurements: DraxViewMeasurements | undefined) => {
    containerMeasurementsRef.current = measurements;
  };

  const onContentSizeChange = (width: number, height: number) => {
    contentSizeRef.current = { x: width, y: height };
    return onContentSizeChangeProp?.(width, height);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollProp?.(event);

    runOnUI((_scrollPos: typeof scrollPosition, _event: NativeScrollEvent) => {
      'worklet';
      _scrollPos.value = {
        x: _event.contentOffset.x,
        y: _event.contentOffset.y,
      };
    })(scrollPosition, event.nativeEvent);
  };

  const setScrollRefs = (instance: T | null) => {
    if (instance) {
      scrollRef.current = instance;
      if (externalRef) {
        if (typeof externalRef === 'function') {
          externalRef(instance);
        } else {
          externalRef.current = instance;
        }
      }
    }
  };

  const startScroll = useCallback(() => {
    startAutoScrollTimer(
      scrollTimerRef.current,
      () => doScroll.current(),
      autoScrollIntervalLength,
      autoScrollInitialDelay
    );
  }, [doScroll, autoScrollIntervalLength, autoScrollInitialDelay]);

  const stopScroll = useCallback(() => {
    stopAutoScrollTimer(scrollTimerRef.current);
  }, []);

  useEffect(() => {
    const { delay, interval } = scrollTimerRef.current;
    if (delay !== undefined || interval !== undefined) {
      stopScroll();
      startScroll();
    }
  }, [stopScroll, startScroll]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => stopScroll();
  }, [stopScroll]);

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
