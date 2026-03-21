import { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraxProvider, DraxList } from 'react-native-drax';
import type { SortableAnimationPreset } from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';

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
    useState<SortableAnimationPreset>('default');
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <DraxProvider>
      <View
        testID="reorderable-list-screen"
        style={[
          styles.container,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
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
        </View>
        <DraxList
          data={alphaData}
          keyExtractor={(item) => item}
          animationConfig={animPreset}
          containerStyle={styles.container}
          style={styles.list}
          containerDraxViewProps={{
            testID: 'sortable-list-container',
            accessibilityLabel: 'Reorderable list of letters A through Z',
          }}
          scrollEventThrottle={16}
          onReorder={({ data, fromIndex, fromItem, toIndex, toItem }) => {
            console.log(
              `[reorderableList:onReorder] from=${fromIndex} (${fromItem}) to=${toIndex} (${toItem})`
            );
            setAlphaData(data);
          }}
          onDragStart={({ index, item }) => {
            console.log(
              `[reorderableList:onDragStart] index=${index} item=${item}`
            );
          }}
          onDragPositionChange={({
            index,
            item,
            toIndex,
            previousIndex,
          }) => {
            console.log(
              `[reorderableList:onDragPositionChange] index=${index} item=${item} toIndex=${toIndex} previousIndex=${previousIndex}`
            );
          }}
          onDragEnd={({ index, item, toIndex, cancelled }) => {
            console.log(
              `[reorderableList:onDragEnd] index=${index} item=${item} toIndex=${toIndex} cancelled=${cancelled}`
            );
          }}
          renderItem={({ item }) => (
            <View
              testID={`sortable-item-${item}`}
              style={[styles.alphaItem, getItemStyleTweaks(item)]}
            >
              <Text style={styles.alphaText}>{item}</Text>
            </View>
          )}
        />
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
});
