import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import {
  DraxProvider,
  DraxHandle,
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

const COLORS = ['#ffcccc', '#ccffcc', '#ccccff', '#ffffcc', '#ffccff', '#ccffff'];

const ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

export default function DragHandles() {
  const [data, setData] = useState(ITEMS);
  const listRef = useRef<FlatList<(typeof ITEMS)[0]>>(null);
  const { theme, isDark } = useTheme();

  const sortable = useSortableList({
    data,
    keyExtractor: (item) => item.id,
    onReorder: ({ data: newData }) => setData(newData),
    animationConfig: 'spring',
  });

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Only the grip icon on the left starts a drag. Tapping or swiping
            the item content scrolls normally.
          </Text>
        </View>
        <ExampleLinks slug="drag-handles" />
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
                  { backgroundColor: itemColor(item.color, isDark) },
                ]}
                hoverDraggingStyle={styles.hoverItem}
                hoverDragReleasedStyle={styles.hoverItemReleased}
                snapDelay={0}
                snapDuration={200}
                dragHandle
              >
                <DraxHandle style={styles.handle}>
                  <Icon name="drag" size={24} color={theme.muted} />
                </DraxHandle>
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
    textAlign: 'center',
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
  hoverItem: {
    transform: [{ scale: 1.03 }],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  hoverItemReleased: {
    opacity: 0.6,
    transform: [{ scale: 0.97 }],
    shadowOpacity: 0.05,
  },
});
