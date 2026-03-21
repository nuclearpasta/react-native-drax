import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DraxProvider,
  DraxView,
  type CollisionAlgorithm,
} from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';

function DraggableBlock() {
  return (
    <DraxView
      testID="collision-draggable"
      style={styles.draggable}
      draggingStyle={styles.dragging}
      hoverDraggingStyle={styles.hoverDragging}
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

  return (
    <DraxView
      testID={testID}
      style={[
        styles.dropZone,
        isReceiving && styles.dropZoneActive,
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
      <Text style={styles.dropLabel}>{label}</Text>
      <Text style={styles.dropAlgorithm}>{algorithm}</Text>
      <Text style={styles.dropCount}>Drops: {count}</Text>
    </DraxView>
  );
}

export default function CollisionModes() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <DraxProvider>
      <View
        testID="collision-modes-screen"
        style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.bg }]}
      >
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Each drop zone uses a different collision algorithm. Notice how
            "intersect" activates as soon as any edge overlaps, "center"
            requires the dragged item's center to be inside, and "contain"
            needs the entire item inside.
          </Text>
        </View>

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
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
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
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  dropZoneActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  receiving: {
    borderColor: '#22c55e',
    borderStyle: 'solid',
  },
  dropLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  dropAlgorithm: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  dropCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginTop: 8,
  },
});
