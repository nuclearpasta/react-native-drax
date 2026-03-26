/**
 * Cross-List — Three DraxLists inside SortableBoardContainer.
 * Two vertical columns + one horizontal row at the bottom.
 * Fully custom per-item dimensions — items keep their exact size in any list.
 * Single renderItem for all lists. Zero React state in the library.
 */
import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  DraxProvider,
  DraxList,
  SortableBoardContainer,
  useSortableBoard,
} from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS_A = ['#ff6b6b', '#ffa06b', '#ffd96b', '#a8e06b', '#6be0a8', '#6bd4e0', '#6b9fe0', '#8b6be0'];
const COLORS_B = ['#d46be0', '#e06ba8', '#ff8888', '#ffbb88', '#ffee88', '#bbee88', '#88eebb', '#88e0ee'];
const COLORS_C = ['#88b4ee', '#a488ee', '#e088ee', '#ee88bb', '#ffaaaa', '#ffd0aa', '#ffffaa', '#d0ffaa'];

interface CardItem {
  id: string;
  label: string;
  color: string;
  /** Fixed visual width in pixels */
  w: number;
  /** Fixed visual height in pixels */
  h: number;
}

/** Vertical column items: varying width AND height */
const getVWidth = (i: number) => {
  if (i % 5 === 0) return 140;
  if (i % 3 === 0) return 120;
  return 160;
};
const makeVertical = (prefix: string, colors: string[], count: number): CardItem[] =>
  Array.from({ length: count }, (_, i) => {
    const h = i % 5 === 0 ? 72 : i % 3 === 0 ? 60 : 48;
    return {
      id: `${prefix}-${i}`,
      label: `${prefix.toUpperCase()}${i + 1}`,
      color: colors[i % colors.length]!,
      w: getVWidth(i),
      h,
    };
  });

/** Horizontal row items: varying width, 48px tall */
const makeHorizontal = (prefix: string, colors: string[], count: number): CardItem[] =>
  Array.from({ length: count }, (_, i) => {
    const w = i % 4 === 0 ? 100 : i % 3 === 0 ? 88 : 72;
    return {
      id: `${prefix}-${i}`,
      label: `${prefix.toUpperCase()}${i + 1}`,
      color: colors[i % colors.length]!,
      w,
      h: 48,
    };
  });

export default function CrossList() {
  const [colA, setColA] = useState(() => makeVertical('a', COLORS_A, 25));
  const [colB, setColB] = useState(() => makeVertical('b', COLORS_B, 25));
  const [colC, setColC] = useState(() => makeHorizontal('c', COLORS_C, 20));
  const { theme, isDark } = useTheme();

  const board = useSortableBoard<CardItem>({
    onTransfer: ({ item, fromContainerId, toContainerId, toIndex }) => {
      console.log(`[transfer] ${item.label} from ${fromContainerId} to ${toContainerId} at ${toIndex}`);
      const remove = (prev: CardItem[]) => prev.filter(c => c.id !== item.id);
      const insert = (prev: CardItem[]) => [...prev.slice(0, toIndex), item, ...prev.slice(toIndex)];

      if (fromContainerId === 'col-a') setColA(remove);
      else if (fromContainerId === 'col-b') setColB(remove);
      else setColC(remove);

      if (toContainerId === 'col-a') setColA(insert);
      else if (toContainerId === 'col-b') setColB(insert);
      else setColC(insert);
    },
  });

  // Single render for ALL lists — item keeps its exact size everywhere
  // w=0 means stretch to fill cell (vertical items fill column width)
  const renderCard = (item: CardItem) => (
    <View style={[styles.card, {
      width: item.w || undefined,
      height: item.h,
      backgroundColor: itemColor(item.color, isDark),
    }]}>
      <Text style={[styles.cardText, { color: isDark ? '#e0e0e0' : '#333' }]}>
        {item.label}
      </Text>
    </View>
  );

  // Single ghost for ALL lists (w=0 → use indicator width from cell measurement)
  const renderGhost = ({ item, width }: { item: CardItem; index: number; width: number; height: number }) => (
    <View style={[styles.card, {
      width: item.w || width,
      height: item.h,
      backgroundColor: itemColor(item.color, isDark),
      opacity: 0.3,
    }]}>
      <Text style={[styles.cardText, { color: isDark ? '#e0e0e0' : '#333' }]}>
        {item.label}
      </Text>
    </View>
  );

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Cross-container — custom dimensions per item
          </Text>
          <Text style={[styles.hintText, { color: theme.muted }]}>
            Long press to drag
          </Text>
        </View>
        <SortableBoardContainer board={board} style={styles.board}>
          <View style={styles.hRow}>
            <Text style={[styles.colTitle, { color: theme.text }]}>Horizontal ({colC.length})</Text>
            <DraxList<CardItem>
              id="col-c"
              data={colC}
              keyExtractor={(item) => item.id}
              estimatedItemSize={80}
              horizontal
              longPressDelay={200}
              animationConfig="snappy"
              onReorder={({ data }) => setColC(data)}
              renderItem={({ item }) => renderCard(item)}
              renderDropIndicator={renderGhost}
              style={styles.hList}
            />
          </View>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={[styles.colTitle, { color: theme.text }]}>A ({colA.length})</Text>
              <DraxList<CardItem>
                id="col-a"
                data={colA}
                keyExtractor={(item) => item.id}
                estimatedItemSize={56}
                longPressDelay={200}
                animationConfig="snappy"
                onReorder={({ data }) => setColA(data)}
                renderItem={({ item }) => renderCard(item)}
                renderDropIndicator={renderGhost}
                contentContainerStyle={{ alignItems: 'center' }}
                style={styles.list}
              />
            </View>
            <View style={styles.column}>
              <Text style={[styles.colTitle, { color: theme.text }]}>B ({colB.length})</Text>
              <DraxList<CardItem>
                id="col-b"
                data={colB}
                keyExtractor={(item) => item.id}
                estimatedItemSize={56}
                longPressDelay={200}
                animationConfig="snappy"
                onReorder={({ data }) => setColB(data)}
                renderItem={({ item }) => renderCard(item)}
                renderDropIndicator={renderGhost}
                contentContainerStyle={{ alignItems: 'center' }}
                style={styles.list}
              />
            </View>
          </View>
        </SortableBoardContainer>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, alignItems: 'center' },
  headerText: { fontSize: 14, fontStyle: 'italic' },
  hintText: { fontSize: 12, marginTop: 2 },
  board: { flex: 1 },
  columns: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 8 },
  column: { flex: 1 },
  colTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  list: { flex: 1 },
  hRow: { height: 120, paddingHorizontal: 8, paddingBottom: 8 },
  hList: { flex: 1 },
  card: {
    margin: 3,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: { fontSize: 13, fontWeight: '600' },
});
