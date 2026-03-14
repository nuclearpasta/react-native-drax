import { useState } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraxProvider, DraxView } from 'react-native-drax';

interface Card {
  id: string;
  title: string;
  color: string;
}

type ColumnId = 'todo' | 'progress' | 'done';

interface Columns {
  todo: Card[];
  progress: Card[];
  done: Card[];
}

const INITIAL_COLUMNS: Columns = {
  todo: [
    { id: '1', title: 'Design mockups', color: '#fecaca' },
    { id: '2', title: 'Write tests', color: '#fed7aa' },
    { id: '3', title: 'API integration', color: '#fef08a' },
    { id: '4', title: 'Fix login bug', color: '#bbf7d0' },
  ],
  progress: [
    { id: '5', title: 'User auth flow', color: '#bfdbfe' },
    { id: '6', title: 'Dashboard UI', color: '#c7d2fe' },
  ],
  done: [
    { id: '7', title: 'Setup project', color: '#d9f99d' },
  ],
};

const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: 'To Do',
  progress: 'In Progress',
  done: 'Done',
};

interface CardPayload {
  card: Card;
  fromColumn: ColumnId;
}

const isCardPayload = (value: unknown): value is CardPayload =>
  typeof value === 'object' &&
  value !== null &&
  'card' in value &&
  'fromColumn' in value;

function KanbanCard({ card, column }: { card: Card; column: ColumnId }) {
  return (
    <DraxView
      testID={`kanban-card-${card.id}`}
      style={[styles.card, { backgroundColor: card.color }]}
      draggingStyle={styles.dragging}
      hoverDraggingStyle={styles.hoverCard}
      dragPayload={{ card, fromColumn: column } satisfies CardPayload}
      longPressDelay={150}
    >
      <Text style={styles.cardTitle}>{card.title}</Text>
    </DraxView>
  );
}

function KanbanColumn({
  columnId,
  cards,
  onReceive,
}: {
  columnId: ColumnId;
  cards: Card[];
  onReceive: (payload: CardPayload) => void;
}) {
  return (
    <DraxView
      testID={`kanban-column-${columnId}`}
      style={styles.column}
      receivingStyle={styles.columnReceiving}
      onReceiveDragDrop={(event) => {
        if (isCardPayload(event.dragged.payload)) {
          onReceive(event.dragged.payload);
        }
      }}
    >
      <Text style={styles.columnHeader}>{COLUMN_LABELS[columnId]}</Text>
      <Text style={styles.columnCount}>{cards.length}</Text>
      <ScrollView style={styles.columnScroll} showsVerticalScrollIndicator={false}>
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} column={columnId} />
        ))}
      </ScrollView>
    </DraxView>
  );
}

export default function KanbanBoard() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const insets = useSafeAreaInsets();

  const handleReceive = (targetColumn: ColumnId, payload: CardPayload) => {
    if (payload.fromColumn === targetColumn) return;

    setColumns((prev) => {
      const sourceCards = prev[payload.fromColumn].filter(
        (c) => c.id !== payload.card.id
      );
      const targetCards = [...prev[targetColumn], payload.card];
      return {
        ...prev,
        [payload.fromColumn]: sourceCards,
        [targetColumn]: targetCards,
      };
    });
  };

  return (
    <DraxProvider>
      <View
        testID="kanban-board-screen"
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <Text style={styles.headerText}>
            Drag cards between columns. Demonstrates cross-container DnD.
          </Text>
        </View>
        <View style={styles.board}>
          {(Object.keys(COLUMN_LABELS) as ColumnId[]).map((colId) => (
            <KanbanColumn
              key={colId}
              columnId={colId}
              cards={columns[colId]}
              onReceive={(payload) => handleReceive(colId, payload)}
            />
          ))}
        </View>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  header: {
    padding: 12,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
  },
  board: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 6,
    gap: 8,
  },
  column: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  columnReceiving: {
    borderColor: '#3b82f6',
    backgroundColor: '#dbeafe',
  },
  columnHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  columnCount: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 8,
  },
  columnScroll: {
    flex: 1,
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
  dragging: {
    opacity: 0.2,
  },
  hoverCard: {
    shadowOpacity: 0.25,
    shadowRadius: 8,
    transform: [{ rotate: '-3deg' }, { scale: 1.05 }],
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
  },
});
