import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DraxProvider,
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';

const COLORS = [
  '#ff6b6b', '#ffa06b', '#ffd96b', '#a8e06b', '#6be0a8',
  '#6bd4e0', '#6b9fe0', '#8b6be0', '#d46be0', '#e06ba8',
  '#ff8888', '#ffbb88', '#ffee88', '#bbee88', '#88eebb',
  '#88e0ee', '#88b4ee', '#a488ee', '#e088ee', '#ee88bb',
  '#ffaaaa', '#ffd0aa', '#ffffaa', '#d0ffaa', '#aaffd0',
  '#aaffff', '#aacfff', '#bfaaff', '#ffaaff', '#ffaacf',
];

const NUM_COLUMNS = 3;

const initialData = Array.from({ length: 30 }, (_, i) => ({
  id: `tile-${i}`,
  label: `${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

type TileItem = (typeof initialData)[number];

export default function ReorderableGrid() {
  const [data, setData] = useState(initialData);
  const listRef = useRef<FlatList<TileItem>>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();
  const tileSize = (screenWidth - insets.left - insets.right - 8 * 2) / NUM_COLUMNS - 8;

  const sortable = useSortableList({
    data,
    numColumns: NUM_COLUMNS,
    keyExtractor: (item) => item.id,
    onReorder: ({ data: newData, fromIndex, fromItem, toIndex, toItem }) => {
      console.log(
        `Tile dragged from index ${fromIndex} (${fromItem.label}) to index ${toIndex} (${toItem.label})`
      );
      setData(newData);
    },
    onDragStart: ({ index, item }) => {
      console.log(`Tile #${index} (${item.label}) drag start`);
    },
    onDragEnd: ({ index, item, toIndex }) => {
      console.log(
        `Tile #${index} (${item.label}) drag ended at index ${toIndex}`
      );
    },
  });

  return (
    <DraxProvider>
      <View
        testID="reorderable-grid-screen"
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingLeft: insets.left + 8,
            paddingRight: insets.right + 8,
          },
        ]}
      >
        <SortableContainer
          sortable={sortable}
          scrollRef={listRef}
          style={styles.container}
          draxViewProps={{
            testID: 'sortable-grid-container',
            accessibilityLabel: 'Reorderable grid of 30 numbered tiles',
          }}
        >
          <FlatList
            ref={listRef}
            data={sortable.data}
            numColumns={NUM_COLUMNS}
            keyExtractor={sortable.stableKeyExtractor}
            onScroll={sortable.onScroll}
            onContentSizeChange={sortable.onContentSizeChange}
            scrollEventThrottle={16}
            initialNumToRender={data.length}
            windowSize={100}
            maxToRenderPerBatch={data.length}
            removeClippedSubviews={false}
            ListHeaderComponent={
              <View testID="grid-header" style={styles.header}>
                <Text style={[styles.headerText, { color: theme.muted }]}>
                  Long-press any tile to drag it to a new position in the grid.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              if (index < 3) {
                console.log(`[renderItem] index=${index} label=${item.label} color=${item.color.slice(0,4)}`);
              }
              return (
              <SortableItem
                sortable={sortable}
                index={index}
                testID={`grid-tile-${item.label}`}
                accessibilityLabel={`Tile ${item.label}, position ${index + 1}`}
                accessibilityHint="Long press and drag to reorder"
                accessibilityRole="button"
                style={[
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: item.color,
                  },
                ]}
              >
                <Text style={styles.tileText}>{item.label}</Text>
              </SortableItem>
              );
            }}
          />
        </SortableContainer>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  tile: {
    margin: 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
});
