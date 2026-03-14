import type { ReactNode, Ref } from 'react';
import { useRef } from 'react';
import type {
  FlatListProps,
  ListRenderItemInfo,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { FlatList } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { useSortableList } from './hooks/useSortableList';
import { SortableContainer } from './SortableContainer';
import { SortableItem } from './SortableItem';
import type {
  DraxViewProps,
  SortableDragEndEvent,
  SortableDragPositionChangeEvent,
  SortableDragStartEvent,
  SortableReorderEvent,
  SortableReorderStrategy,
} from './types';

export interface DraxSortableListProps<T>
  extends Omit<FlatListProps<T>, 'data' | 'renderItem'> {
  ref?: Ref<FlatList<T>>;
  /** Optional explicit DraxView id for the container */
  id?: string;
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (event: SortableReorderEvent<T>) => void;
  renderItem: (info: ListRenderItemInfo<T>) => ReactNode;
  /** Reorder strategy. @default 'insert' */
  reorderStrategy?: SortableReorderStrategy;
  /** Long press delay before drag starts in ms. @default 250 */
  longPressDelay?: number;
  /** Lock item drags to the list's main axis. @default false */
  lockToMainAxis?: boolean;
  /** DraxView props to apply to each item */
  itemDraxViewProps?: Partial<DraxViewProps>;
  /** DraxView props for the container */
  containerDraxViewProps?: Partial<DraxViewProps>;
  /** Style for the container */
  containerStyle?: StyleProp<ViewStyle>;
  /** Callback when drag starts */
  onDragStart?: (event: SortableDragStartEvent<T>) => void;
  /** Callback when drag position changes */
  onDragPositionChange?: (event: SortableDragPositionChangeEvent<T>) => void;
  /** Callback when drag ends */
  onDragEnd?: (event: SortableDragEndEvent<T>) => void;
}

export const DraxSortableList = <T,>({
  ref,
  id,
  data,
  keyExtractor,
  onReorder,
  renderItem,
  reorderStrategy,
  longPressDelay,
  lockToMainAxis,
  itemDraxViewProps,
  containerDraxViewProps,
  containerStyle,
  onDragStart,
  onDragPositionChange,
  onDragEnd,
  style,
  ...flatListProps
}: DraxSortableListProps<T>): ReactNode => {
  const horizontal = flatListProps.horizontal ?? false;
  const numColumns = flatListProps.numColumns ?? 1;

  const sortable = useSortableList({
    id,
    data,
    keyExtractor,
    onReorder,
    horizontal,
    numColumns,
    reorderStrategy,
    longPressDelay,
    lockToMainAxis,
    onDragStart,
    onDragPositionChange,
    onDragEnd,
  });

  const listRef = useRef<FlatList<T>>(null);

  // Forward external ref
  const setRef = (instance: FlatList<T> | null) => {
    (listRef as any).current = instance;
    if (ref) {
      if (typeof ref === 'function') {
        ref(instance);
      } else {
        (ref as any).current = instance;
      }
    }
  };

  return (
    <SortableContainer
      sortable={sortable}
      scrollRef={listRef}
      style={containerStyle}
      draxViewProps={containerDraxViewProps}
    >
      {/* Assertion needed: Reanimated.FlatList wraps FlatListProps with AnimatedStyle,
          making generic T incompatible at the type level. Runtime value is always correct. */}
      <Reanimated.FlatList
        {...(flatListProps as any)}
        style={style}
        ref={setRef as any}
        keyExtractor={sortable.stableKeyExtractor}
        numColumns={numColumns}
        data={sortable.data}
        onScroll={sortable.onScroll}
        onContentSizeChange={sortable.onContentSizeChange}
        // Prevent FlatList from unmounting cells during data reorder.
        // Without these, VirtualizedList recalculates its render window
        // when data changes and may unmount cells for several frames.
        initialNumToRender={data.length}
        windowSize={100}
        maxToRenderPerBatch={data.length}
        removeClippedSubviews={false}
        renderItem={(info: ListRenderItemInfo<T>) => (
          <SortableItem
            sortable={sortable}
            index={info.index}
            {...itemDraxViewProps}
          >
            {renderItem(info)}
          </SortableItem>
        )}
      />
    </SortableContainer>
  );
};
