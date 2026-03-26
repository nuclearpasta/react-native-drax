import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { DraxProvider, DraxList, DraxHandle } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS = ['#ffcccc', '#ccffcc', '#ccccff', '#ffffcc', '#ffccff', '#ccffff'];

const ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i + 1}`,
  color: COLORS[i % COLORS.length]!,
}));

type Item = (typeof ITEMS)[number];

export default function DragHandles() {
  const [data, setData] = useState(ITEMS);
  const { theme, isDark } = useTheme();

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Only the grip icon starts a drag. Swiping the content scrolls.
          </Text>
        </View>
        <DraxList<Item>
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={56}
          animationConfig="spring"
          longPressDelay={150}
          dragHandle
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item }) => (
            <View style={[styles.item, { backgroundColor: itemColor(item.color, isDark) }]}>
              <DraxHandle style={styles.handle}>
                <Icon name="drag" size={24} color={theme.muted} />
              </DraxHandle>
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
  headerText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    marginVertical: 2,
    marginHorizontal: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  handle: {
    padding: 8,
    marginRight: 8,
  },
  itemText: { fontSize: 16, fontWeight: '600' },
});
