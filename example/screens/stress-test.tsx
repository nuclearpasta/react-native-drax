import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList } from 'react-native';
import {
  DraxProvider,
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const ITEM_COUNT = 100;
const COLORS = [
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a7f3d0',
  '#bfdbfe', '#c7d2fe', '#ddd6fe', '#fbcfe8', '#fce7f3',
];

const INITIAL_DATA = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  id: `stress-${i}`,
  label: `Item ${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

export default function StressTest() {
  const [data, setData] = useState(INITIAL_DATA);
  const listRef = useRef<FlatList<(typeof INITIAL_DATA)[0]>>(null);
  const { theme, isDark } = useTheme();

  const sortable = useSortableList({
    data,
    keyExtractor: (item) => item.id,
    onReorder: ({ data: newData }) => setData(newData),
  });

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            {ITEM_COUNT} items — test scrolling and reorder performance
          </Text>
        </View>
        <SortableContainer
          sortable={sortable}
          scrollRef={listRef}
          style={styles.container}
          draxViewProps={{ testID: 'stress-test-container' }}
        >
          <FlatList
            ref={listRef}
            data={sortable.data}
            keyExtractor={sortable.stableKeyExtractor}
            onScroll={sortable.onScroll}
            onContentSizeChange={sortable.onContentSizeChange}
            scrollEventThrottle={16}
            getItemLayout={(_, index) => ({
              length: 52,
              offset: 52 * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <SortableItem
                sortable={sortable}
                index={index}
                testID={`stress-item-${item.id}`}
                style={[
                  styles.item,
                  { backgroundColor: itemColor(item.color, isDark) },
                ]}
              >
                <Text style={[styles.itemText, { color: isDark ? '#e0e0e0' : '#333' }]}>{item.label}</Text>
              </SortableItem>
            )}
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
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  item: {
    height: 48,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  itemText: {
    fontSize: 15,
  },
  dragging: {
    opacity: 0,
  },
});
