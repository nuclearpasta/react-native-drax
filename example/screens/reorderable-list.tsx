import { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraxProvider, DraxList, DraxView } from 'react-native-drax';
import type { SortableAnimationPreset } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const PRESETS: { key: SortableAnimationPreset; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'spring', label: 'Spring' },
  { key: 'gentle', label: 'Gentle' },
  { key: 'snappy', label: 'Snappy' },
  { key: 'none', label: 'None' },
];

const getBackgroundColor = (alphaIndex: number) => {
  switch (alphaIndex % 6) {
    case 0:
      return '#ffaaaa';
    case 1:
      return '#aaffaa';
    case 2:
      return '#aaaaff';
    case 3:
      return '#ffffaa';
    case 4:
      return '#ffaaff';
    case 5:
      return '#aaffff';
    default:
      return '#aaaaaa';
  }
};

const getHeight = (alphaIndex: number) => {
  let height = 50;
  if (alphaIndex % 2 === 0) {
    height += 10;
  }
  if (alphaIndex % 3 === 0) {
    height += 20;
  }
  return height;
};

/** Letter of a dropped list row (DraxList item payloads carry the item). */
const getDroppedItem = (payload: unknown) =>
  typeof payload === 'object' && payload !== null && 'item' in payload
    && typeof payload.item === 'string'
    ? payload.item
    : undefined;

const getItemStyleTweaks = (alphaItem: string) => {
  const alphaIndex = alphabet.indexOf(alphaItem);
  return {
    backgroundColor: getBackgroundColor(alphaIndex),
    height: getHeight(alphaIndex),
  };
};

export default function ReorderableList() {
  const [alphaData, setAlphaData] = useState(alphabet);
  const [animPreset, setAnimPreset] =
    useState<SortableAnimationPreset>('spring');
  const [showFarZone, setShowFarZone] = useState(false);
  const [farZoneItem, setFarZoneItem] = useState<string>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  return (
    <DraxProvider>
      <View
        testID="reorderable-list-screen"
        style={[
          styles.container,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: theme.bg,
          },
        ]}
      >
        <View style={[styles.presetBar, { backgroundColor: theme.surface, borderBottomColor: theme.line }]}>
          <Text style={[styles.presetLabel, { color: theme.muted }]}>Animation:</Text>
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              testID={`preset-${p.key}`}
              onPress={() => setAnimPreset(p.key)}
              style={[
                styles.presetButton,
                { backgroundColor: theme.lineStrong },
                animPreset === p.key && styles.presetButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.presetButtonText,
                  { color: theme.muted },
                  animPreset === p.key && styles.presetButtonTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            testID="toggle-far-zone"
            onPress={() => setShowFarZone((v) => !v)}
            style={[
              styles.presetButton,
              { backgroundColor: theme.lineStrong },
              showFarZone && styles.presetButtonActive,
            ]}
          >
            <Text
              style={[
                styles.presetButtonText,
                { color: theme.muted },
                showFarZone && styles.presetButtonTextActive,
              ]}
            >
              Far zone
            </Text>
          </Pressable>
        </View>
        <ExampleLinks slug="reorderable-list" />
        <DraxList
          data={alphaData}
          keyExtractor={(item) => item}
          animationConfig={animPreset}
          inactiveItemStyle={{ opacity: 0.5 }}
          hoverDraggingStyle={{
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            transform: [{ scale: 1.03 }],
          }}
          hoverDragReleasedStyle={{
            opacity: 0.6,
            transform: [{ scale: 0.97 }],
            shadowOpacity: 0.08,
          }}
          snapDelay={0}
          snapDuration={200}
          containerStyle={styles.container}
          style={styles.list}
          containerDraxViewProps={{
            testID: 'sortable-list-container',
            accessibilityLabel: 'Reorderable list of letters A through Z',
          }}
          scrollEventThrottle={16}
          onReorder={({ data }) => {
            setAlphaData(data);
          }}
          renderItem={({ item }) => {
            const tweaks = getItemStyleTweaks(item);
            return (
            <View
              testID={`sortable-item-${item}`}
              style={[
                styles.alphaItem,
                tweaks,
                { backgroundColor: itemColor(tweaks.backgroundColor, isDark) },
              ]}
            >
              <Text style={[styles.alphaText, { color: isDark ? '#e0e0e0' : '#333' }]}>{item}</Text>
            </View>
            );
          }}
        />
        <DraxView
          testID="remove-zone"
          style={[
            styles.removeZone,
            {
              borderColor: theme.lineStrong,
              backgroundColor: theme.surface,
              marginBottom: showFarZone ? 8 : insets.bottom + 8,
            },
          ]}
          receivingStyle={styles.removeZoneReceiving}
          onReceiveDragDrop={({ dragged }) => {
            const item = getDroppedItem(dragged.payload);
            if (item === undefined) return;
            setAlphaData((data) => data.filter((d) => d !== item));
          }}
        >
          <Text style={[styles.removeZoneText, { color: theme.muted }]}>Drop here to remove</Text>
        </DraxView>
        {showFarZone && (
          // A second receiver more than 100 pt below the list (beyond the
          // list's monitor hit-test padding, MONITOR_HIT_TEST_PADDING in
          // src/math.ts). A drop here leaves the list order unchanged.
          <DraxView
            testID="far-zone"
            style={[
              styles.removeZone,
              styles.farZone,
              {
                borderColor: theme.lineStrong,
                backgroundColor: theme.surface,
                marginBottom: insets.bottom + 8,
              },
            ]}
            receivingStyle={styles.farZoneReceiving}
            onReceiveDragDrop={({ dragged }) => {
              setFarZoneItem(getDroppedItem(dragged.payload));
            }}
          >
            <Text style={[styles.removeZoneText, { color: theme.muted }]}>
              {farZoneItem === undefined
                ? 'Far zone (keeps the order)'
                : `Far zone received ${farZoneItem}`}
            </Text>
          </DraxView>
        )}
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  presetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  presetButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginHorizontal: 3,
  },
  presetButtonActive: {
    backgroundColor: '#3b82f6',
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  presetButtonTextActive: {
    color: '#fff',
  },
  alphaItem: {
    backgroundColor: '#aaaaff',
    borderRadius: 8,
    margin: 4,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alphaText: {
    fontSize: 28,
  },
  removeZone: {
    margin: 8,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  removeZoneReceiving: {
    borderColor: '#ef4444',
  },
  farZone: {
    // The remove zone plus its margins is about 70 pt tall, so this puts the
    // far zone's top edge about 125 pt below the list.
    marginTop: 56,
  },
  farZoneReceiving: {
    borderColor: '#3b82f6',
  },
  removeZoneText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
