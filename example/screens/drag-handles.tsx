import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  DraxProvider,
  DraxHandle,
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';

const COLORS = ['#ffcccc', '#ccffcc', '#ccccff', '#ffffcc', '#ffccff', '#ccffff'];

const ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

export default function DragHandles() {
  const [data, setData] = useState(ITEMS);
  const listRef = useRef<FlatList<(typeof ITEMS)[0]>>(null);
  const insets = useSafeAreaInsets();

  const sortable = useSortableList({
    data,
    keyExtractor: (item) => item.id,
    onReorder: ({ data: newData }) => setData(newData),
  });

  return (
    <DraxProvider>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerText}>
            Only the grip icon on the left starts a drag. Tapping or swiping
            the item content scrolls normally.
          </Text>
        </View>
        <SortableContainer
          sortable={sortable}
          scrollRef={listRef}
          style={styles.container}
          draxViewProps={{ testID: 'drag-handles-container' }}
        >
          <FlatList
            ref={listRef}
            data={sortable.data}
            keyExtractor={sortable.stableKeyExtractor}
            onScroll={sortable.onScroll}
            onContentSizeChange={sortable.onContentSizeChange}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <SortableItem
                sortable={sortable}
                index={index}
                testID={`handle-item-${item.id}`}
                style={[
                  styles.item,
                  { backgroundColor: item.color },
                ]}
                dragHandle
              >
                <DraxHandle style={styles.handle}>
                  <Icon name="drag" size={24} color="#666" />
                </DraxHandle>
                <Text style={styles.itemText}>{item.label}</Text>
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
    textAlign: 'center',
    color: '#666',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 3,
    borderRadius: 8,
    height: 56,
  },
  handle: {
    width: 44,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 16,
    flex: 1,
  },
  dragging: {
    opacity: 0,
  },
});
