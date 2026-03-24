import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList, useWindowDimensions } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { LegendList } from '@legendapp/list';
import type { LegendListRef } from '@legendapp/list';
import {
  DraxProvider,
  SortableBoardContainer,
  SortableContainer,
  SortableItem,
  useSortableBoard,
  useSortableList,
} from 'react-native-drax';
import type { DropIndicatorProps } from 'react-native-drax';
import Reanimated from 'react-native-reanimated';
import { useTheme, itemColor } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

interface Card {
  id: string;
  title: string;
  color: string;
}

type ColumnId = 'flashlist' | 'legendlist' | 'flatlist';

function isColumnId(id: string): id is ColumnId {
  return id === 'flashlist' || id === 'legendlist' || id === 'flatlist';
}

interface Columns {
  flashlist: Card[];
  legendlist: Card[];
  flatlist: Card[];
}

const INITIAL_COLUMNS: Columns = {
  flashlist: [
    { id: '1', title: 'Design mockups', color: '#fecaca' },
    { id: '2', title: 'Write tests', color: '#fed7aa' },
    { id: '3', title: 'API integration', color: '#fef08a' },
    { id: '4', title: 'Fix login bug', color: '#bbf7d0' },
  ],
  legendlist: [
    { id: '5', title: 'User auth flow', color: '#bfdbfe' },
    { id: '6', title: 'Dashboard UI', color: '#c7d2fe' },
  ],
  flatlist: [
    { id: '7', title: 'Setup project', color: '#d9f99d' },
  ],
};

const cardKeyExtractor = (card: Card) => card.id;

function CardItem({ card, width }: { card: Card; width: number }) {
  const { isDark } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: itemColor(card.color, isDark), width }]}>
      <Text style={[styles.cardTitle, isDark && { color: '#e0e0e0' }]}>{card.title}</Text>
    </View>
  );
}

function DropIndicator(_props: DropIndicatorProps): ReactNode {
  // Container is sized to the target column's item measurement.
  // Ghost fills 100% — the SortableItem wrapper's margin creates natural gaps.
  return <View style={styles.ghostItem} />;
}

// Shared hover/snap props — defined as a function to avoid referencing
// `styles` before its declaration (StyleSheet.create is at bottom of file).
function sortableItemProps() {
  return {
    hoverStyle: styles.hoverCardBase,
    hoverDraggingStyle: styles.hoverCard,
    hoverDragReleasedStyle: styles.hoverCardReleased,
    snapDelay: 0 as const,
    snapDuration: 200 as const,
  };
}

// ── FlashList Column (horizontal) ────────────────────────────────────

function FlashListColumn({
  cards,
  onReorder,
  cardWidth,
}: {
  cards: Card[];
  onReorder: (data: Card[]) => void;
  cardWidth: number;
}) {
  const listRef = useRef<FlashListRef<Card>>(null);
  const { theme } = useTheme();

  const sortable = useSortableList({
    id: 'flashlist',
    data: cards,
    keyExtractor: cardKeyExtractor,
    onReorder: ({ data }) => onReorder(data),
    horizontal: true,
    longPressDelay: 150,
    animationConfig: 'snappy',
  });

  return (
    <View style={[styles.flashlistSection, { backgroundColor: theme.surface, borderColor: theme.lineStrong }]}>
      <View style={styles.flashlistHeader}>
        <Text style={[styles.columnHeader, { color: theme.text }]}>FlashList</Text>
        <Text style={[styles.columnCount, { color: theme.muted }]}>{cards.length}</Text>
      </View>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={styles.flashlistContent}
        renderDropIndicator={DropIndicator}
        draxViewProps={{
          testID: 'cross-list-column-flashlist',
        }}
      >
        <FlashList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }: { item: Card; index: number }) => (
            <SortableItem
              sortable={sortable}
              index={index}
              testID={`cross-list-card-${item.id}`}
              style={styles.flashlistItem}
              {...sortableItemProps()}
            >
              <CardItem card={item} width={cardWidth} />
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

// ── LegendList Column (vertical) ─────────────────────────────────────

function LegendListColumn({
  cards,
  onReorder,
  cardWidth,
}: {
  cards: Card[];
  onReorder: (data: Card[]) => void;
  cardWidth: number;
}) {
  // LegendListRef has scrollToOffset + getScrollableNode which is all
  // SortableContainer needs. The generic ref type is wider, so cast.
  const listRef = useRef<LegendListRef>(null) as RefObject<any>;
  const { theme } = useTheme();

  const sortable = useSortableList({
    id: 'legendlist',
    data: cards,
    keyExtractor: cardKeyExtractor,
    onReorder: ({ data }) => onReorder(data),
    longPressDelay: 150,
    animationConfig: 'snappy',
  });

  return (
    <View style={[styles.column, { backgroundColor: theme.surface, borderColor: theme.lineStrong }]}>
      <Text style={[styles.columnHeader, { color: theme.text }]}>LegendList</Text>
      <Text style={[styles.columnCount, { color: theme.muted }]}>{cards.length}</Text>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={styles.columnContent}
        renderDropIndicator={DropIndicator}
        draxViewProps={{
          testID: 'cross-list-column-legendlist',
        }}
      >
        <LegendList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={52}
          renderItem={({ item, index }: { item: Card; index: number }) => (
            <SortableItem
              sortable={sortable}
              index={index}
              testID={`cross-list-card-${item.id}`}
              {...sortableItemProps()}
            >
              <CardItem card={item} width={cardWidth} />
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

// ── FlatList Column (vertical) ───────────────────────────────────────

function FlatListColumn({
  cards,
  onReorder,
  cardWidth,
}: {
  cards: Card[];
  onReorder: (data: Card[]) => void;
  cardWidth: number;
}) {
  const listRef = useRef<FlatList>(null);
  const { theme } = useTheme();

  const sortable = useSortableList({
    id: 'flatlist',
    data: cards,
    keyExtractor: cardKeyExtractor,
    onReorder: ({ data }) => onReorder(data),
    longPressDelay: 150,
    animationConfig: 'snappy',
  });

  return (
    <View style={[styles.column, { backgroundColor: theme.surface, borderColor: theme.lineStrong }]}>
      <Text style={[styles.columnHeader, { color: theme.text }]}>FlatList</Text>
      <Text style={[styles.columnCount, { color: theme.muted }]}>{cards.length}</Text>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={styles.columnContent}
        renderDropIndicator={DropIndicator}
        draxViewProps={{
          testID: 'cross-list-column-flatlist',
        }}
      >
        <Reanimated.FlatList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          showsVerticalScrollIndicator={false}
          initialNumToRender={cards.length}
          windowSize={100}
          maxToRenderPerBatch={cards.length}
          removeClippedSubviews={false}
          renderItem={(info: ListRenderItemInfo<Card>) => (
            <SortableItem
              sortable={sortable}
              index={info.index}
              testID={`cross-list-card-${info.item.id}`}
              {...sortableItemProps()}
            >
              <CardItem card={info.item} width={cardWidth} />
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

// ── Board ─────────────────────────────────────────────────────────────

export default function CrossListReorder() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();

  // Consistent card width across all columns — prevents size jump on transfer.
  const cardWidth = (screenWidth - 16 - 8) / 2 - 16;

  const board = useSortableBoard<Card>({
    keyExtractor: cardKeyExtractor,
    onTransfer: ({ item, fromContainerId, toContainerId, toIndex }) => {
      if (!isColumnId(fromContainerId) || !isColumnId(toContainerId)) return;
      setColumns((prev) => {
        const next = { ...prev };
        next[fromContainerId] = prev[fromContainerId].filter(
          (c) => c.id !== item.id
        );
        const targetCards = [...prev[toContainerId]];
        targetCards.splice(toIndex, 0, item);
        next[toContainerId] = targetCards;
        return next;
      });
    },
  });

  return (
    <DraxProvider>
      <View
        testID="cross-list-screen"
        style={[styles.container, { backgroundColor: theme.bg }]}
      >
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Cross-list drag between FlashList, LegendList, and FlatList.
          </Text>
        </View>
        <ExampleLinks slug="cross-list" />
        <SortableBoardContainer board={board} style={styles.board}>
          <FlashListColumn
            cards={columns.flashlist}
            cardWidth={cardWidth}
            onReorder={(data) =>
              setColumns((prev) => ({ ...prev, flashlist: data }))
            }
          />
          <View style={styles.verticalColumns}>
            <LegendListColumn
              cards={columns.legendlist}
              cardWidth={cardWidth}
              onReorder={(data) =>
                setColumns((prev) => ({ ...prev, legendlist: data }))
              }
            />
            <FlatListColumn
              cards={columns.flatlist}
              cardWidth={cardWidth}
              onReorder={(data) =>
                setColumns((prev) => ({ ...prev, flatlist: data }))
              }
            />
          </View>
        </SortableBoardContainer>
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
  board: {
    flex: 1,
    paddingHorizontal: 8,
  },
  flashlistSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    marginBottom: 8,
  },
  flashlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  flashlistContent: {
    minHeight: 60,
  },
  flashlistItem: {
    marginRight: 6,
  },
  verticalColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
  },
  columnContent: {
    flex: 1,
  },
  columnHeader: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  columnCount: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  hoverCardBase: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  hoverCard: {
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    transform: [{ rotate: '-2deg' }, { scale: 1.06 }],
  },
  hoverCardReleased: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
  },
  ghostItem: {
    flex: 1,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderStyle: 'dashed',
  },
});
