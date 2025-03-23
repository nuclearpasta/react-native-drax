import React, { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { SharedValue } from 'react-native-reanimated';

import { useDraxContext } from './hooks';
import { useContent } from './hooks/useContent';
import { TReanimatedHoverViewProps, DraxViewDragStatus, Position } from './types';

export const HoverView = ({
    children,
    hoverPosition,
    renderHoverContent,
    renderContent,
    scrollPosition,
    ...props
}: Omit<PropsWithChildren<TReanimatedHoverViewProps>, 'internalProps'> & {
    id: string;
    hoverPosition: SharedValue<Position>;
    scrollPositionOffset?: Position;
}) => {
    const { updateHoverViewMeasurements } = useDraxContext();
    const { combinedStyle, animatedHoverStyle, renderedChildren, dragStatus } = useContent({
        draxViewProps: {
            children,
            hoverPosition,
            renderHoverContent,
            renderContent,
            scrollPosition,
            ...props,
        },
    });

    if (!(props.draggable && !props.noHover)) {
        return null;
    }

    if (dragStatus === DraxViewDragStatus.Inactive || typeof dragStatus === 'undefined') {
        return null;
    }

    return (
        <Reanimated.View style={[StyleSheet.absoluteFill, animatedHoverStyle]} pointerEvents="none">
            {/**
             * 🪲 BUG: Reanimated measuring issue,
             * that's why we need another View to correctly measure the hover content :(
             */}
            <View
                pointerEvents="none"
                onLayout={measurements => {
                    !props?.disableHoverViewMeasurementsOnLayout &&
                        updateHoverViewMeasurements({
                            id: props.id,
                            measurements: { ...measurements.nativeEvent.layout },
                        });
                }}
                style={[StyleSheet.absoluteFill, combinedStyle]}
            >
                {renderedChildren}
            </View>
        </Reanimated.View>
    );
};
