import { useState } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

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

type Tile = (typeof initialData)[number];

export default function ReorderableGrid() {
  const [data, setData] = useState(initialData);
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const tileSize = (screenWidth - 16 * 2) / NUM_COLUMNS - 8;

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Grid — {NUM_COLUMNS} columns, {data.length} tiles
          </Text>
        </View>
        <DraxList<Tile>
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={tileSize + 8}
          numColumns={NUM_COLUMNS}
          drawDistance={300}
          animationConfig="spring"
          longPressDelay={200}
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item }) => (
            <View style={[styles.tile, {
              height: tileSize,
              backgroundColor: itemColor(item.color, isDark),
            }]}>
              <Text style={[styles.tileText, { color: isDark ? '#e0e0e0' : '#333' }]}>
                {item.label}
              </Text>
            </View>
          )}
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, alignItems: 'center' },
  headerText: { fontSize: 14, fontStyle: 'italic' },
  list: { flex: 1 },
  tile: {
    margin: 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileText: { fontSize: 20, fontWeight: '700' },
});
