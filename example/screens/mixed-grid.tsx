import { useState } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';
import type { GridItemSpan } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS = [
  '#ff6b6b', '#6b9fe0', '#a8e06b', '#ffd96b', '#d46be0',
  '#6be0a8', '#ffa06b', '#6bd4e0', '#8b6be0', '#e06ba8',
  '#ffbb88', '#88eebb', '#88b4ee', '#ffee88', '#a488ee',
  '#ee88bb',
];

interface GridItem {
  id: string;
  label: string;
  color: string;
  colSpan: number;
  rowSpan: number;
}

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
  { id: 'health',   label: 'Health',   color: COLORS[3]!,  colSpan: 2, rowSpan: 2 },
  { id: 'stocks',   label: 'Stocks',   color: COLORS[7]!,  colSpan: 1, rowSpan: 1 },
  { id: 'tips',     label: 'Tips',     color: COLORS[9]!,  colSpan: 1, rowSpan: 1 },
  { id: 'podcasts', label: 'Podcasts', color: COLORS[4]!,  colSpan: 2, rowSpan: 1 },
  { id: 'home',     label: 'Home',     color: COLORS[6]!,  colSpan: 1, rowSpan: 2 },
  { id: 'files',    label: 'Files',    color: COLORS[2]!,  colSpan: 1, rowSpan: 1 },
  { id: 'reminders',label: 'Reminders',color: COLORS[11]!, colSpan: 1, rowSpan: 1 },
  { id: 'contacts', label: 'Contacts', color: COLORS[0]!,  colSpan: 1, rowSpan: 1 },
  { id: 'tv',       label: 'TV',       color: COLORS[8]!,  colSpan: 2, rowSpan: 2 },
  { id: 'translate',label: 'Translate', color: COLORS[5]!, colSpan: 1, rowSpan: 1 },
  { id: 'compass',  label: 'Compass',  color: COLORS[10]!, colSpan: 1, rowSpan: 1 },
  { id: 'measure',  label: 'Measure',  color: COLORS[12]!, colSpan: 2, rowSpan: 1 },
  { id: 'voice',    label: 'Voice',    color: COLORS[14]!, colSpan: 1, rowSpan: 1 },
];

const NUM_COLUMNS = 4;
const GAP = 8;

function getSpan(item: GridItem, _index: number): GridItemSpan {
  return { colSpan: item.colSpan, rowSpan: item.rowSpan };
}

export default function MixedGrid() {
  const [data, setData] = useState(initialData);
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // cellSize is computed from available width after padding.
  // DraxList wraps in a View with padding, so containerWidth = screenWidth - padding.
  const padding = 16;
  const availableWidth = screenWidth - padding * 2;
  const cellSize = (availableWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Mixed-size grid — {NUM_COLUMNS} columns, 1×1 / 2×1 / 1×2 / 2×2 items
          </Text>
        </View>
        <DraxList<GridItem>
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={cellSize}
          numColumns={NUM_COLUMNS}
          getItemSpan={getSpan}
          gridGap={GAP}
          drawDistance={300}
          animationConfig="spring"
          longPressDelay={200}
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item }) => (
            <View style={[styles.tile, {
              backgroundColor: itemColor(item.color, isDark),
            }]}>
              <Text style={[styles.tileText, { color: isDark ? '#e0e0e0' : '#333' }]}>
                {item.label}
              </Text>
              <Text style={[styles.spanText, { color: isDark ? '#aaa' : '#666' }]}>
                {item.colSpan}×{item.rowSpan}
              </Text>
            </View>
          )}
          style={[styles.list, { paddingHorizontal: padding }]}
        />
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, alignItems: 'center' },
  headerText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1 },
  tile: {
    flex: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  tileText: { fontSize: 16, fontWeight: '700' },
  spanText: { fontSize: 11, marginTop: 2 },
});
