import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  DraxProvider,
  DraxView,
  type CollisionAlgorithm,
} from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

function DraggableBlock() {
  return (
    <DraxView
      testID="collision-draggable"
      style={styles.draggable}
      draggingStyle={styles.dragging}
      hoverDraggingStyle={styles.hoverDragging}
      hoverDraggingWithReceiverStyle={styles.hoverOverZone}
      hoverDragReleasedStyle={styles.hoverReleased}
      snapDuration={250}
      dragPayload="block"
    >
      <Text style={styles.draggableText}>Drag me</Text>
    </DraxView>
  );
}

function DropZone({
  algorithm,
  label,
  testID,
}: {
  algorithm: CollisionAlgorithm;
  label: string;
  testID: string;
}) {
  const [count, setCount] = useState(0);
  const [isReceiving, setIsReceiving] = useState(false);
  const { theme, isDark } = useTheme();

  return (
    <DraxView
      testID={testID}
      style={[
        styles.dropZone,
        { backgroundColor: theme.surface, borderColor: theme.lineStrong },
        isReceiving && {
          backgroundColor: isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7',
          borderColor: '#22c55e',
        },
      ]}
      collisionAlgorithm={algorithm}
      onReceiveDragEnter={() => setIsReceiving(true)}
      onReceiveDragExit={() => setIsReceiving(false)}
      onReceiveDragDrop={() => {
        setCount((c) => c + 1);
        setIsReceiving(false);
      }}
      receivingStyle={styles.receiving}
    >
      <Text style={[styles.dropLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.dropAlgorithm, { color: theme.muted }]}>{algorithm}</Text>
      <Text style={styles.dropCount}>Drops: {count}</Text>
    </DraxView>
  );
}

export default function CollisionModes() {
  const { theme } = useTheme();

  return (
    <DraxProvider>
      <View
        testID="collision-modes-screen"
        style={[styles.container, { backgroundColor: theme.bg }]}
      >
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Each drop zone uses a different collision algorithm. Notice how
            "intersect" activates as soon as any edge overlaps, "center"
            requires the dragged item's center to be inside, and "contain"
            needs the entire item inside.
          </Text>
        </View>
        <ExampleLinks slug="collision-modes" />

        <View style={styles.draggableRow}>
          <DraggableBlock />
        </View>

        <View style={styles.zonesRow}>
          <DropZone
            testID="zone-center"
            algorithm="center"
            label="Center"
          />
          <DropZone
            testID="zone-intersect"
            algorithm="intersect"
            label="Intersect"
          />
          <DropZone
            testID="zone-contain"
            algorithm="contain"
            label="Contain"
          />
        </View>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
  },
  headerText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  draggableRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  draggable: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  draggableText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  dragging: {
    opacity: 0.3,
  },
  hoverDragging: {
    transform: [{ scale: 1.06 }],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  hoverOverZone: {
    transform: [{ scale: 1.1 }],
    shadowColor: '#22c55e',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  hoverReleased: {
    opacity: 0.5,
    transform: [{ scale: 0.95 }],
    shadowOpacity: 0.05,
  },
  zonesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
    flex: 1,
  },
  dropZone: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  dropZoneActive: {},
  receiving: {
    borderColor: '#22c55e',
    borderStyle: 'solid',
  },
  dropLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  dropAlgorithm: {
    fontSize: 13,
    marginTop: 4,
  },
  dropCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginTop: 8,
  },
});
