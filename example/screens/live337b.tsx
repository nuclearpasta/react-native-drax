// TEMPORARY harness screen for #337 A3 (board transfer still auto-scrolls the target column). Never merge.
// useSortableBoard + SortableBoardContainer like cross-list.tsx, but 2 FlatList columns of 40
// cards each (50 pt) in a fixed-height board (BOARD_H), so both columns overflow and can auto-scroll.
// The stock cross-list board has 4/2/1 cards, too short to scroll.
// A3: drag a card from column 1 into column 2's bottom (or top) edge band and hold: column 2 must
// auto-scroll (the board-transfer exception), then release -> onTransfer toIndex.
// `first c2=` logs the first visible card of column 2 (viewability), as a cheap scroll proxy.
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import Reanimated from 'react-native-reanimated';
import {
  DraxProvider,
  SortableBoardContainer,
  SortableContainer,
  SortableItem,
  useSortableBoard,
  useSortableList,
} from 'react-native-drax';

const TAG = '[L337b]';
const CARD_H = 50;
const BOARD_H = 480;
const N = 40;

interface Card {
  id: string;
}
type ColId = 'c1' | 'c2';
const isColId = (id: string): id is ColId => id === 'c1' || id === 'c2';
const make = (p: string) => Array.from({ length: N }, (_, i) => ({ id: `${p}${String(i).padStart(2, '0')}` }));
const initial = () => ({ c1: make('P'), c2: make('Q') });
const keyOf = (c: Card) => c.id;

function Column({ id, cards, onReorder }: { id: ColId; cards: Card[]; onReorder: (d: Card[]) => void }) {
  const listRef = useRef<FlatList<Card>>(null);
  const [first, setFirst] = useState('-');
  const sortable = useSortableList({
    id,
    data: cards,
    keyExtractor: keyOf,
    onReorder: ({ data, fromIndex, toIndex }) => {
      console.log(`${TAG} onReorder t=${Date.now()} col=${id} from=${fromIndex} toIndex=${toIndex}`);
      onReorder(data);
    },
    onDragEnd: (e) => console.log(`${TAG} onDragEnd t=${Date.now()} col=${id} index=${e.index} toIndex=${e.toIndex} cancelled=${e.cancelled}`),
    longPressDelay: 150,
    animationConfig: 'snappy',
  });
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const top = viewableItems[0]?.index;
    const label = top === undefined || top === null ? '-' : String(top);
    console.log(`${TAG} first ${id}=${label} t=${Date.now()}`);
    setFirst(label);
  }).current;

  return (
    <View style={styles.column}>
      <Text accessibilityLabel={`${id} count ${cards.length} first ${first}`} style={styles.header}>
        {`${id} n=${cards.length} first=${first}`}
      </Text>
      <SortableContainer sortable={sortable} scrollRef={listRef} style={styles.flex} draxViewProps={{ accessibilityLabel: `l337b-${id}` }}>
        <Reanimated.FlatList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          initialNumToRender={cards.length}
          windowSize={100}
          maxToRenderPerBatch={cards.length}
          removeClippedSubviews={false}
          renderItem={(info: ListRenderItemInfo<Card>) => (
            <SortableItem sortable={sortable} index={info.index} snapDelay={0} snapDuration={200}>
              <View accessibilityLabel={`card ${info.item.id}`} style={[styles.card, id === 'c1' ? styles.c1 : styles.c2]}>
                <Text style={styles.cardText}>{info.item.id}</Text>
              </View>
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

export default function Live337b() {
  const [cols, setCols] = useState(initial);
  const [boardKey, setBoardKey] = useState(0);
  const board = useSortableBoard<Card>({
    keyExtractor: keyOf,
    onTransfer: ({ item, fromContainerId, fromIndex, toContainerId, toIndex }) => {
      console.log(`${TAG} onTransfer t=${Date.now()} item=${item.id} from=${fromContainerId}:${fromIndex} to=${toContainerId} toIndex=${toIndex}`);
      if (!isColId(fromContainerId) || !isColId(toContainerId)) return;
      setCols((prev) => {
        const next = { ...prev };
        next[fromContainerId] = prev[fromContainerId].filter((c) => c.id !== item.id);
        const target = [...prev[toContainerId]];
        target.splice(toIndex, 0, item);
        next[toContainerId] = target;
        return next;
      });
    },
  });

  return (
    <DraxProvider>
      <View style={styles.flex}>
        <View style={styles.bar}>
          <Pressable
            accessibilityLabel="l337b-reset"
            style={styles.btn}
            onPress={() => {
              setCols(initial());
              setBoardKey((k) => k + 1);
              console.log(`${TAG} reset t=${Date.now()}`);
            }}
          >
            <Text style={styles.btnText}>reset</Text>
          </Pressable>
        </View>
        <SortableBoardContainer key={boardKey} board={board} style={styles.board}>
          <Column id="c1" cards={cols.c1} onReorder={(d) => setCols((p) => ({ ...p, c1: d }))} />
          <Column id="c2" cards={cols.c2} onReorder={(d) => setCols((p) => ({ ...p, c2: d }))} />
        </SortableBoardContainer>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 4 },
  btn: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  btnText: { color: 'white', fontSize: 14 },
  board: { height: BOARD_H, flexDirection: 'row', gap: 8, paddingHorizontal: 8 },
  column: { flex: 1, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 8, padding: 4 },
  header: { fontSize: 13, textAlign: 'center', marginBottom: 4 },
  card: { height: CARD_H - 4, marginBottom: 4, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  c1: { backgroundColor: '#fcd9b8' },
  c2: { backgroundColor: '#e8eefc' },
  cardText: { fontSize: 14, fontFamily: 'Menlo' },
});
