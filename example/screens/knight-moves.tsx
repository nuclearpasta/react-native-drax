import type { ReactElement } from 'react';
import { useState } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraxProvider, DraxView } from 'react-native-drax';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

interface BoardPosition {
  row: number;
  column: number;
}

interface ChessSquareProps {
  width: number;
  position: BoardPosition;
  receptive: boolean;
}

interface KnightPayload {
  setKnightPos: (pos: BoardPosition) => void;
}

const isKnightPayload = (value: unknown): value is KnightPayload =>
  typeof value === 'object' &&
  value !== null &&
  'setKnightPos' in value &&
  typeof value.setKnightPos === 'function';

const ChessSquare = ({ width, position, receptive }: ChessSquareProps) => {
  const { row, column } = position;
  const colorStyle = row % 2 === column % 2 ? styles.light : styles.dark;
  const file = String.fromCharCode(97 + column); // a-h
  const rank = 8 - row; // 1-8 from bottom
  const squareName = `${file}${rank}`;
  const colorName = row % 2 === column % 2 ? 'light' : 'dark';
  return (
    <DraxView
      testID={`chess-square-${squareName}`}
      accessibilityLabel={
        receptive
          ? `Square ${squareName}, ${colorName}, valid move target`
          : `Square ${squareName}, ${colorName}`
      }
      style={[
        styles.square,
        colorStyle,
        receptive ? styles.receptive : undefined,
        { width },
      ]}
      receivingStyle={styles.receiving}
      receptive={receptive}
      onReceiveDragDrop={({ dragged: { payload } }) => {
        if (isKnightPayload(payload)) {
          payload.setKnightPos(position);
        }
      }}
    />
  );
};

export default function KnightMoves() {
  const [knightPos, setKnightPos] = useState<BoardPosition>({
    row: 5,
    column: 5,
  });
  const [moving, setMoving] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const boardWidth = Math.min(width, height) * 0.75;
  const squareWidth = boardWidth / 8;
  const knightSquareName = `${String.fromCharCode(97 + knightPos.column)}${8 - knightPos.row}`;
  const rowViews: ReactElement[] = [];

  for (let row = 0; row < 8; row += 1) {
    const squareViews: ReactElement[] = [];
    for (let column = 0; column < 8; column += 1) {
      const rowOffset = Math.abs(row - knightPos.row);
      const columnOffset = Math.abs(column - knightPos.column);
      const receptive =
        moving &&
        ((rowOffset === 2 && columnOffset === 1) ||
          (rowOffset === 1 && columnOffset === 2));
      squareViews.push(
        <ChessSquare
          width={squareWidth}
          key={`r${row}c${column}`}
          position={{ row, column }}
          receptive={receptive}
        />
      );
    }
    rowViews.push(
      <View key={`r${row}`} style={styles.row}>
        {squareViews}
      </View>
    );
  }

  return (
    <DraxProvider>
      <View testID="knight-moves-screen" style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={styles.containerRow}>
          <View testID="chess-board" accessibilityLabel="Chess board, 8 by 8 grid" style={styles.board}>
            {rowViews}
            <DraxView
              testID="chess-knight"
              accessibilityLabel={`Knight at ${knightSquareName}`}
              accessibilityHint="Long press and drag to a highlighted square to move"
              accessibilityRole="image"
              style={[
                styles.knight,
                {
                  width: squareWidth,
                  height: squareWidth,
                  top: knightPos.row * squareWidth,
                  left: knightPos.column * squareWidth,
                },
              ]}
              draggingStyle={styles.dragging}
              dragReleasedStyle={styles.dragging}
              dragPayload={{ setKnightPos }}
              renderHoverContent={() => (
                <View
                  style={{
                    width: squareWidth,
                    height: squareWidth,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Icon
                    name="chess-knight"
                    size={squareWidth * 0.8}
                    color="black"
                  />
                </View>
              )}
              onDragStart={() => {
                setMoving(true);
              }}
              onDragEnd={() => {
                setMoving(false);
              }}
              onDragDrop={() => {
                setMoving(false);
              }}
            >
              <Icon
                name="chess-knight"
                size={squareWidth * 0.8}
                color="black"
              />
            </DraxView>
          </View>
          <View style={{ width: boardWidth }}>
            <Text style={styles.instructionText}>
              Start dragging the knight, and the legal move positions will be
              highlighted with blue borders. When dragging the knight over one
              of those positions, the square will be highlighted with a magenta
              border instead. Release the drag in a legal position to move the
              knight; release it anywhere else, and it will snap back to its
              original position.
            </Text>
          </View>
        </View>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  board: {
    borderColor: 'black',
    borderWidth: 3,
  },
  row: {
    flexDirection: 'row',
  },
  dark: {
    backgroundColor: '#999999',
  },
  light: {
    backgroundColor: '#dddddd',
  },
  square: {
    aspectRatio: 1,
  },
  receptive: {
    borderColor: '#0000ff',
    borderWidth: 2,
  },
  receiving: {
    borderColor: '#ff00ff',
    borderWidth: 2,
  },
  knight: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragging: {
    opacity: 0.2,
  },
  instructionText: {
    margin: 12,
    fontSize: 16,
    fontStyle: 'italic',
  },
});
