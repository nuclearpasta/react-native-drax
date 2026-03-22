import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList, useWindowDimensions } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
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

type ColumnId = 'backlog' | 'todo' | 'done';

function isColumnId(id: string): id is ColumnId {
  return id === 'backlog' || id === 'todo' || id === 'done';
}

interface Columns {
  backlog: Card[];
  todo: Card[];
  done: Card[];
}

const INITIAL_COLUMNS: Columns = {
  backlog: [
    { id: '1', title: 'Design mockups', color: '#fecaca' },
    { id: '2', title: 'Write tests', color: '#fed7aa' },
    { id: '3', title: 'API integration', color: '#fef08a' },
    { id: '4', title: 'Fix login bug', color: '#bbf7d0' },
  ],
  todo: [
    { id: '5', title: 'User auth flow', color: '#bfdbfe' },
    { id: '6', title: 'Dashboard UI', color: '#c7d2fe' },
  ],
  done: [
    { id: '7', title: 'Setup project', color: '#d9f99d' },
  ],
};

const cardKeyExtractor = (card: Card) => card.id;

function KanbanCard({ card, width }: { card: Card; width: number }) {
  const { isDark } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: itemColor(card.color, isDark), width }]}>
      <Text style={[styles.cardTitle, isDark && { color: '#e0e0e0' }]}>{card.title}</Text>
    </View>
  );
}

function DropIndicator({ horizontal }: DropIndicatorProps): ReactNode {
  return (
    <View
      style={horizontal ? styles.dropIndicatorH : styles.dropIndicatorV}
    />
  );
}

// ── Horizontal Backlog Column ─────────────────────────────────────────

function BacklogColumn({
  cards,
  onReorder,
  cardWidth,
}: {
  cards: Card[];
  onReorder: (data: Card[]) => void;
  cardWidth: number;
}) {
  // Typed as FlatList (not Reanimated.FlatList) — Reanimated's generic types
  // are incompatible with React's RefObject. The ref is only used for
  // scrollToOffset/flashScrollIndicators which both types share.
  const listRef = useRef<FlatList>(null);
  const { theme } = useTheme();

  const sortable = useSortableList({
    id: 'backlog',
    data: cards,
    keyExtractor: cardKeyExtractor,
    onReorder: ({ data }) => onReorder(data),
    horizontal: true,
    longPressDelay: 150,
    animationConfig: 'snappy',
  });

  return (
    <View style={[styles.backlogSection, { backgroundColor: theme.surface, borderColor: theme.lineStrong }]}>
      <View style={styles.backlogHeader}>
        <Text style={[styles.columnHeader, { color: theme.text }]}>Backlog</Text>
        <Text style={[styles.columnCount, { color: theme.muted }]}>{cards.length}</Text>
      </View>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={styles.backlogContent}
        renderDropIndicator={DropIndicator}
        draxViewProps={{
          testID: 'kanban-column-backlog',
        }}
      >
        <Reanimated.FlatList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.backlogListContent}
          initialNumToRender={cards.length}
          windowSize={100}
          maxToRenderPerBatch={cards.length}
          removeClippedSubviews={false}
          renderItem={(info: ListRenderItemInfo<Card>) => (
            <SortableItem
              sortable={sortable}
              index={info.index}
              testID={`kanban-card-${info.item.id}`}
              hoverStyle={styles.hoverCardBase}
              hoverDraggingStyle={styles.hoverCard}
              hoverDragReleasedStyle={styles.hoverCardReleased}
              snapDelay={0}
              snapDuration={200}
            >
              <KanbanCard card={info.item} width={cardWidth} />
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

// ── Vertical Column ───────────────────────────────────────────────────

function VerticalColumn({
  columnId,
  label,
  cards,
  onReorder,
  cardWidth,
}: {
  columnId: ColumnId;
  label: string;
  cards: Card[];
  onReorder: (data: Card[]) => void;
  cardWidth: number;
}) {
  const listRef = useRef<FlatList>(null);
  const { theme } = useTheme();

  const sortable = useSortableList({
    id: columnId,
    data: cards,
    keyExtractor: cardKeyExtractor,
    onReorder: ({ data }) => onReorder(data),
    longPressDelay: 150,
    animationConfig: 'snappy',
  });

  return (
    <View style={[styles.column, { backgroundColor: theme.surface, borderColor: theme.lineStrong }]}>
      <Text style={[styles.columnHeader, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.columnCount, { color: theme.muted }]}>{cards.length}</Text>
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef}
        style={styles.columnContent}
        renderDropIndicator={DropIndicator}
        draxViewProps={{
          testID: `kanban-column-${columnId}`,
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
              testID={`kanban-card-${info.item.id}`}
              hoverStyle={styles.hoverCardBase}
              hoverDraggingStyle={styles.hoverCard}
              hoverDragReleasedStyle={styles.hoverCardReleased}
              snapDelay={0}
              snapDuration={200}
            >
              <KanbanCard card={info.item} width={cardWidth} />
            </SortableItem>
          )}
        />
      </SortableContainer>
    </View>
  );
}

// ── Board ─────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const { width: screenWidth } = useWindowDimensions();
  const { theme } = useTheme();

  // Consistent card width across all columns — prevents size jump on transfer.
  // Matches the vertical column's inner width: (screen - board padding - column gap) / 2 - column padding.
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
        testID="kanban-board-screen"
        style={[styles.container, { backgroundColor: theme.bg }]}
      >
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Drag cards within and between columns. Backlog scrolls horizontally.
          </Text>
        </View>
        <ExampleLinks slug="kanban-board" />
        <SortableBoardContainer board={board} style={styles.board}>
          <BacklogColumn
            cards={columns.backlog}
            cardWidth={cardWidth}
            onReorder={(data) =>
              setColumns((prev) => ({ ...prev, backlog: data }))
            }
          />
          <View style={styles.verticalColumns}>
            <VerticalColumn
              columnId="todo"
              label="To Do"
              cards={columns.todo}
              cardWidth={cardWidth}
              onReorder={(data) =>
                setColumns((prev) => ({ ...prev, todo: data }))
              }
            />
            <VerticalColumn
              columnId="done"
              label="Done"
              cards={columns.done}
              cardWidth={cardWidth}
              onReorder={(data) =>
                setColumns((prev) => ({ ...prev, done: data }))
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
  backlogSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    marginBottom: 8,
  },
  backlogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  backlogContent: {
    minHeight: 60,
  },
  backlogListContent: {
    gap: 6,
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
    color: '#1e293b', // card text stays dark since cards have light pastel backgrounds
  },
  dropIndicatorV: {
    width: '80%',
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#3b82f6',
    alignSelf: 'center',
  },
  dropIndicatorH: {
    width: 3,
    height: '80%',
    borderRadius: 1.5,
    backgroundColor: '#3b82f6',
    alignSelf: 'center',
  },
});
