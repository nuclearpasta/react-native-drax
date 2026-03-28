import type { PropsWithChildren, Ref } from 'react';
import { useRef, type RefObject } from 'react';
import { ScrollView } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { DraxSubprovider } from './DraxSubprovider';
import { DraxView } from './DraxView';
import { useDraxScrollHandler } from './hooks/useDraxScrollHandler';
import { useWebScrollFreeze } from './hooks/useWebScrollFreeze';
import {
  defaultAutoScrollBackThreshold,
  defaultAutoScrollForwardThreshold,
  defaultAutoScrollJumpRatio,
  defaultScrollEventThrottle,
} from './params';
import type {
  AutoScrollState,
  DraxMonitorEventData,
  DraxScrollViewProps,
} from './types';
import { AutoScrollDirection } from './types';

export const DraxScrollView = (
  props: PropsWithChildren<DraxScrollViewProps> & { ref?: Ref<ScrollView> }
) => {
  const {
    ref,
    children,
    style,
    onContentSizeChange: onContentSizeChangeProp,
    scrollEventThrottle = defaultScrollEventThrottle,
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

  // Handle auto-scrolling on interval (ref-based to avoid circular deps with useDraxScrollHandler).
  const doScrollRef: RefObject<() => void> = useRef(() => {});

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
    externalRef: ref,
    doScroll: doScrollRef,
  });

  // Assign doScroll implementation now that we have scrollRef, measurements, etc.
  doScrollRef.current = () => {
    const scroll = scrollRef.current;
    const containerMeasurements = containerMeasurementsRef.current;
    const contentSize = contentSizeRef.current;
    if (!scroll || !containerMeasurements || !contentSize) return;
    const autoScrollState = autoScrollStateRef.current;
    // Single SV read — avoids 11 redundant cross-thread syncs per auto-scroll tick
    const currentScroll = scrollPosition.value;
    const jump = {
      x: containerMeasurements.width * autoScrollJumpRatio,
      y: containerMeasurements.height * autoScrollJumpRatio,
    };
    let xNew: number | undefined;
    let yNew: number | undefined;
    if (autoScrollState.x === AutoScrollDirection.Forward) {
      const xMax = contentSize.x - containerMeasurements.width;
      if (currentScroll.x < xMax) {
        xNew = Math.min(currentScroll.x + jump.x, xMax);
      }
    } else if (autoScrollState.x === AutoScrollDirection.Back) {
      if (currentScroll.x > 0) {
        xNew = Math.max(currentScroll.x - jump.x, 0);
      }
    }
    if (autoScrollState.y === AutoScrollDirection.Forward) {
      const yMax = contentSize.y - containerMeasurements.height;
      if (currentScroll.y < yMax) {
        yNew = Math.min(currentScroll.y + jump.y, yMax);
      }
    } else if (autoScrollState.y === AutoScrollDirection.Back) {
      if (currentScroll.y > 0) {
        yNew = Math.max(currentScroll.y - jump.y, 0);
      }
    }
    if (xNew !== undefined || yNew !== undefined) {
      // @ts-expect-error Reanimated's type augmentation hides scrollTo, but it exists at runtime
      scroll.scrollTo({
        x: xNew ?? currentScroll.x,
        y: yNew ?? currentScroll.y,
      });
      if (
        'flashScrollIndicators' in scroll &&
        typeof scroll.flashScrollIndicators === 'function'
      ) {
        scroll.flashScrollIndicators();
      }
    }
  };

  const { freeze: freezeScroll, unfreeze: unfreezeScroll } = useWebScrollFreeze(scrollRef);

  // Clear auto-scroll direction and stop the auto-scrolling interval.
  const resetScroll = () => {
    const autoScrollState = autoScrollStateRef.current;
    autoScrollState.x = AutoScrollDirection.None;
    autoScrollState.y = AutoScrollDirection.None;
    stopScroll();
    unfreezeScroll();
  };

  // Monitor drag-over events to react with auto-scrolling.
  const onMonitorDragOver = (event: DraxMonitorEventData) => {
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
  };

  const scrollViewParent = { id, viewRef: scrollRef, isScrollContainer: true };

  return (
    <DraxView
      id={id}
      style={style}
      scrollPosition={scrollPosition}
      onMeasure={onMeasureContainer}
      onMonitorDragStart={freezeScroll}
      onMonitorDragOver={onMonitorDragOver}
      onMonitorDragExit={resetScroll}
      onMonitorDragEnd={resetScroll}
      onMonitorDragDrop={resetScroll}
    >
      <DraxSubprovider parent={scrollViewParent}>
        <Reanimated.ScrollView
          {...scrollViewProps}
          // @ts-expect-error — callback ref bridges AnimatedRef + external ref; runtime-compatible
          ref={setScrollRefs}
          onContentSizeChange={onContentSizeChange}
          scrollEventThrottle={scrollEventThrottle}
          onScroll={onScroll}
        >
          {children}
        </Reanimated.ScrollView>
      </DraxSubprovider>
    </DraxView>
  );
};
