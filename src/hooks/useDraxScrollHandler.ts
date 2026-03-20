import type { Ref, RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { FlatList, ScrollView } from 'react-native';
import {
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';

import { defaultAutoScrollIntervalLength } from '../params';
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
};

export const useDraxScrollHandler = <T extends ScrollableComponents>({
  idProp,
  onContentSizeChangeProp,
  onScrollProp,
  externalRef,
  doScroll,
}: DraxScrollHandlerArgs<T>) => {
  const scrollRef = useRef<T>(null);
  const id = useDraxId(idProp);
  const containerMeasurementsRef = useRef<DraxViewMeasurements | undefined>(
    undefined
  );
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
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
    if (scrollIntervalRef.current) {
      return;
    }
    doScroll.current();
    scrollIntervalRef.current = setInterval(
      () => doScroll.current(),
      defaultAutoScrollIntervalLength
    );
  }, [doScroll]);

  const stopScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    if (scrollIntervalRef.current) {
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
