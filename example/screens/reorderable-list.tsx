import { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS = [
  '#ff6b6b', '#ffa06b', '#ffd96b', '#a8e06b', '#6be0a8',
  '#6bd4e0', '#6b9fe0', '#8b6be0', '#d46be0', '#e06ba8',
];

const getHeight = (i: number) => {
  const base = 48;
  if (i % 3 === 0) return base + 24;
  if (i % 2 === 0) return base + 12;
  return base;
};

const makeData = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i + 1}`,
    color: COLORS[i % COLORS.length]!,
    height: getHeight(i),
  }));

type Item = ReturnType<typeof makeData>[number];

export default function ReorderableList() {
  const [data, setData] = useState(() => makeData(30));
  const { theme, isDark } = useTheme();
  let nextId = data.length;

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            DraxList — {data.length} items
          </Text>
          <View style={styles.buttons}>
            <Pressable
              onPress={() => {
                const id = `item-${Date.now()}-${nextId++}`;
                const h = getHeight(Math.floor(Math.random() * 6));
                setData(prev => [
                  { id, label: `New ${prev.length + 1}`, color: COLORS[prev.length % COLORS.length]!, height: h },
                  ...prev,
                ]);
              }}
              style={styles.btn}
            >
              <Text style={styles.btnText}>+ Add Top</Text>
            </Pressable>
            <Pressable
              onPress={() => data.length > 0 && setData(prev => prev.slice(1))}
              style={styles.btn}
            >
              <Text style={styles.btnText}>- Remove Top</Text>
            </Pressable>
          </View>
        </View>
        <DraxList<Item>
          data={data}
          keyExtractor={(item) => item.id}
          estimatedItemSize={60}
          drawDistance={300}
          animationConfig="spring"
          longPressDelay={200}
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item, index }) => {
            if (index < 3) console.log(`[renderItem] ${item.label} height=${item.height} type=${typeof item.height}`);
            return (
              <View style={[styles.item, {
                height: item.height,
                backgroundColor: itemColor(item.color, isDark),
              }]}>
                <Text style={[styles.itemText, { color: isDark ? '#e0e0e0' : '#333' }]}>
                  {item.label}
                </Text>
                <Text style={[styles.indexText, { color: isDark ? '#999' : '#666' }]}>
                  #{index} · {item.height}px
                </Text>
              </View>
            );
          }}
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
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { backgroundColor: '#4a90d9', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
  list: { flex: 1 },
  item: {
    marginVertical: 2,
    marginHorizontal: 8,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemText: { fontSize: 16, fontWeight: '600' },
  indexText: { fontSize: 12 },
});
