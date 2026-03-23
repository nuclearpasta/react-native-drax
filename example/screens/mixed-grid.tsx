import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DraxProvider,
  SortableContainer,
  SortableItem,
  useSortableList,
  packGrid,
} from 'react-native-drax';
import type { GridItemSpan } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

// ── Data ───────────────────────────────────────────────────────────────

interface GridItem {
  id: string;
  label: string;
  color: string;
  colSpan: number;
  rowSpan: number;
}

const COLORS = [
  '#ff6b6b', '#6b9fe0', '#a8e06b', '#ffd96b', '#d46be0',
  '#6be0a8', '#ffa06b', '#6bd4e0', '#8b6be0', '#e06ba8',
  '#ffbb88', '#88eebb', '#88b4ee', '#ffee88', '#a488ee',
  '#ee88bb', '#d0ffaa', '#aacfff', '#ffaaff', '#aaffff',
];

const initialData: GridItem[] = [
  { id: 'weather',  label: 'Weather',  color: COLORS[1]!,  colSpan: 2, rowSpan: 2 },
  { id: 'mail',     label: 'Mail',     color: COLORS[0]!,  colSpan: 1, rowSpan: 1 },
  { id: 'camera',   label: 'Camera',   color: COLORS[2]!,  colSpan: 1, rowSpan: 1 },
  { id: 'photos',   label: 'Photos',   color: COLORS[3]!,  colSpan: 1, rowSpan: 1 },
  { id: 'clock',    label: 'Clock',    color: COLORS[4]!,  colSpan: 1, rowSpan: 1 },
  { id: 'notes',    label: 'Notes',    color: COLORS[5]!,  colSpan: 2, rowSpan: 1 },
  { id: 'calendar', label: 'Calendar', color: COLORS[6]!,  colSpan: 1, rowSpan: 1 },
  { id: 'music',    label: 'Music',    color: COLORS[7]!,  colSpan: 1, rowSpan: 2 },
  { id: 'maps',     label: 'Maps',     color: COLORS[8]!,  colSpan: 1, rowSpan: 1 },
  { id: 'settings', label: 'Settings', color: COLORS[9]!,  colSpan: 1, rowSpan: 1 },
  { id: 'news',     label: 'News',     color: COLORS[10]!, colSpan: 2, rowSpan: 2 },
  { id: 'phone',    label: 'Phone',    color: COLORS[11]!, colSpan: 1, rowSpan: 1 },
  { id: 'safari',   label: 'Safari',   color: COLORS[12]!, colSpan: 1, rowSpan: 1 },
  { id: 'fitness',  label: 'Fitness',  color: COLORS[13]!, colSpan: 2, rowSpan: 1 },
  { id: 'wallet',   label: 'Wallet',   color: COLORS[14]!, colSpan: 1, rowSpan: 1 },
  { id: 'books',    label: 'Books',    color: COLORS[15]!, colSpan: 1, rowSpan: 1 },
];

const NUM_COLUMNS = 4;
const GAP = 8;

// ── Helpers ────────────────────────────────────────────────────────────

function getItemSpan(item: GridItem, _index: number): GridItemSpan {
  return { colSpan: item.colSpan, rowSpan: item.rowSpan };
}

function computeGridLayout(
  data: GridItem[],
  cellSize: number,
) {
  const packing = packGrid(data.length, NUM_COLUMNS, (i) => ({
    colSpan: data[i]!.colSpan,
    rowSpan: data[i]!.rowSpan,
  }));

  const positions = packing.positions.map((pos, i) => {
    const item = data[i]!;
    return {
      x: pos.col * (cellSize + GAP),
      y: pos.row * (cellSize + GAP),
      width: item.colSpan * cellSize + (item.colSpan - 1) * GAP,
      height: item.rowSpan * cellSize + (item.rowSpan - 1) * GAP,
    };
  });

  const totalHeight = packing.totalRows * (cellSize + GAP) - GAP;

  return { positions, totalHeight };
}

// ── Component ──────────────────────────────────────────────────────────

export default function MixedGrid() {
  const [data, setData] = useState(initialData);
  const scrollRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { theme, isDark } = useTheme();

  const gridWidth = screenWidth - insets.left - insets.right - 16 * 2;
  const cellSize = (gridWidth - (NUM_COLUMNS - 1) * GAP) / NUM_COLUMNS;

  const sortable = useSortableList({
    data,
    numColumns: NUM_COLUMNS,
    keyExtractor: (item) => item.id,
    getItemSpan,
    animationConfig: 'spring',
    onReorder: ({ data: newData, fromIndex, fromItem, toIndex, toItem }) => {
      console.log(
        `Item dragged from ${fromIndex} (${fromItem.label}) to ${toIndex} (${toItem.label})`
      );
      setData(newData);
    },
    onDragStart: ({ index, item }) => {
      console.log(`Item #${index} (${item.label}) drag start`);
    },
    onDragEnd: ({ index, item, toIndex }) => {
      console.log(`Item #${index} (${item.label}) drag ended at ${toIndex}`);
    },
  });

  const layout = useMemo(
    () => computeGridLayout(sortable.data, cellSize),
    [sortable.data, cellSize],
  );

  return (
    <DraxProvider>
      <View
        testID="mixed-grid-screen"
        style={[
          styles.container,
          {
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
            backgroundColor: theme.bg,
          },
        ]}
      >
        <ExampleLinks slug="mixed-grid" />
        <SortableContainer
          sortable={sortable}
          scrollRef={scrollRef}
          style={styles.container}
          draxViewProps={{
            testID: 'mixed-grid-container',
            accessibilityLabel: 'Mixed-size sortable grid',
          }}
        >
          <ScrollView
            ref={scrollRef}
            onScroll={sortable.onScroll}
            onContentSizeChange={sortable.onContentSizeChange}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scrollContent}
          >
            <View testID="grid-header" style={styles.header}>
              <Text style={[styles.headerText, { color: theme.muted }]}>
                Long-press any tile to drag. Items have different sizes (1×1, 2×1, 1×2, 2×2).
              </Text>
            </View>
            <View style={{ height: layout.totalHeight }}>
              {sortable.data.map((item, index) => {
                const pos = layout.positions[index];
                if (!pos) return null;
                return (
                  <SortableItem
                    key={sortable.stableKeyExtractor(item, index)}
                    sortable={sortable}
                    index={index}
                    testID={`mixed-tile-${item.id}`}
                    accessibilityLabel={`${item.label}, ${item.colSpan}×${item.rowSpan}`}
                    accessibilityHint="Long press and drag to reorder"
                    accessibilityRole="button"
                    style={[
                      styles.tile,
                      {
                        position: 'absolute',
                        left: pos.x,
                        top: pos.y,
                        width: pos.width,
                        height: pos.height,
                        backgroundColor: itemColor(item.color, isDark),
                      },
                    ]}
                    hoverDraggingStyle={styles.hoverTile}
                    hoverDragReleasedStyle={styles.hoverTileReleased}
                    snapDelay={0}
                    snapDuration={180}
                  >
                    <Text style={[styles.tileLabel, { color: isDark ? '#e0e0e0' : '#333' }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.tileSpan, { color: isDark ? '#aaa' : '#888' }]}>
                      {item.colSpan}×{item.rowSpan}
                    </Text>
                  </SortableItem>
                );
              })}
            </View>
          </ScrollView>
        </SortableContainer>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  tile: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tileSpan: {
    fontSize: 12,
    marginTop: 2,
  },
  hoverTile: {
    transform: [{ scale: 1.05 }, { rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  hoverTileReleased: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
    shadowOpacity: 0.05,
  },
});
