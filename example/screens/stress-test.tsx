import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS = [
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a7f3d0',
  '#bfdbfe', '#c7d2fe', '#ddd6fe', '#fbcfe8', '#fce7f3',
];

const ITEM_COUNT = 5000;

const INITIAL_DATA = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  id: `stress-${i}`,
  label: `Item ${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

type StressItem = (typeof INITIAL_DATA)[number];

export default function StressTest() {
  const [data, setData] = useState(INITIAL_DATA);
  const { theme, isDark } = useTheme();

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            {ITEM_COUNT} items — cell recycling + reorder
          </Text>
        </View>
        <DraxList<StressItem>
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={48}
          drawDistance={500}
          longPressDelay={200}
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item }) => (
            <View style={[styles.item, { backgroundColor: itemColor(item.color, isDark) }]}>
              <Text style={[styles.itemText, { color: isDark ? '#e0e0e0' : '#333' }]}>
                {item.label}
              </Text>
            </View>
          )}
          style={styles.list}
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
  item: {
    height: 44,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  itemText: { fontSize: 14, fontWeight: '500' },
});
