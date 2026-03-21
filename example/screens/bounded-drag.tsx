import { useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraxProvider, DraxView, DraxSnapbackTargetPreset } from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';

export default function BoundedDrag() {
  const insets = useSafeAreaInsets();
  const boundsRef = useRef(null);
  const { theme, isDark } = useTheme();

  return (
    <DraxProvider>
      <View
        testID="bounded-drag-screen"
        style={[
          styles.container,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: theme.bg,
          },
        ]}
      >
        <Text style={[styles.heading, { color: theme.text }]}>Drag Bounds</Text>
        <Text style={[styles.description, { color: theme.muted }]}>
          The blue square stays within the dashed boundary.
          The red square can go anywhere.
        </Text>

        <View
          ref={boundsRef}
          testID="drag-bounds-area"
          style={[
            styles.boundsArea,
            { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff' },
          ]}
          collapsable={false}
        >
          <Text style={[styles.boundsLabel, { color: theme.muted }]}>Bounded Area</Text>
          <View style={styles.blockCenter}>
            <DraxView
              testID="bounded-draggable"
              style={styles.boundedBlock}
              dragBoundsRef={boundsRef}
              hoverDraggingStyle={styles.hoverActive}
              draggingStyle={styles.draggingPlaceholder}
              onDragEnd={() => DraxSnapbackTargetPreset.Default}
              longPressDelay={100}
            >
              <Text style={styles.blockText}>Bounded</Text>
            </DraxView>
          </View>
        </View>

        <View
          style={[
            styles.freeArea,
            { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2' },
          ]}
        >
          <Text style={[styles.boundsLabel, { color: theme.muted }]}>Free Area</Text>
          <View style={styles.blockCenter}>
            <DraxView
              testID="free-draggable"
              style={styles.freeBlock}
              hoverDraggingStyle={styles.hoverActive}
              draggingStyle={styles.draggingPlaceholder}
              onDragEnd={() => DraxSnapbackTargetPreset.Default}
              longPressDelay={100}
            >
              <Text style={styles.blockText}>Free</Text>
            </DraxView>
          </View>
        </View>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  boundsArea: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  freeArea: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ef4444',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  boundsLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  blockCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boundedBlock: {
    width: 80,
    height: 80,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  freeBlock: {
    width: 80,
    height: 80,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  blockText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  hoverActive: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  draggingPlaceholder: {
    opacity: 0.3,
  },
});
