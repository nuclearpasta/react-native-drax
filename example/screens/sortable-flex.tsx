import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';
import { useTheme, itemColor } from '../components/ThemeContext';

const COLORS = [
  '#ff6b6b', '#ffa06b', '#ffd96b', '#a8e06b', '#6be0a8',
  '#6bd4e0', '#6b9fe0', '#8b6be0', '#d46be0', '#e06ba8',
  '#ff8888', '#ffbb88', '#ffee88', '#bbee88', '#88eebb',
  '#88e0ee', '#88b4ee', '#a488ee', '#e088ee', '#ee88bb',
];

interface Tag {
  id: string;
  label: string;
  color: string;
}

const TAG_HEIGHT = 36;
const TAG_PADDING_H = 14;
const CHAR_WIDTH = 8.5; // Approximate monospace-ish width per character
const GAP = 8;

function estimateTagWidth(label: string): number {
  return label.length * CHAR_WIDTH + TAG_PADDING_H * 2;
}

const initialData: Tag[] = [
  'React Native', 'TypeScript', 'Reanimated', 'Gesture Handler',
  'Drax', 'Drag & Drop', 'Tags', 'Flex Wrap', 'Sortable',
  'iOS', 'Android', 'Web', 'Expo', 'Metro', 'Fabric',
  'JSI', 'Hermes', 'Worklets', 'UI Thread', 'SharedValue',
  'Spring', 'Timing', 'Layout', 'Animation',
].map((label, i) => ({
  id: `tag-${i}`,
  label,
  color: COLORS[i % COLORS.length]!,
}));

export default function SortableFlex() {
  const [data, setData] = useState(initialData);
  const { theme, isDark } = useTheme();
  const padding = 16;

  return (
    <DraxProvider>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: theme.muted }]}>
            Flex-wrap tags — drag to reorder
          </Text>
        </View>
        <DraxList<Tag>
          data={data}
          keyExtractor={(tag) => tag.id}
          flexWrap
          getItemSize={(tag) => ({
            width: estimateTagWidth(tag.label),
            height: TAG_HEIGHT,
          })}
          gridGap={GAP}
          estimatedItemSize={TAG_HEIGHT}
          drawDistance={300}
          animationConfig="spring"
          longPressDelay={200}
          onReorder={({ data: newData }) => setData(newData)}
          renderItem={({ item }) => (
            <View
              testID={`flex-tag-${item.id}`}
              style={[styles.tag, {
                backgroundColor: itemColor(item.color, isDark),
              }]}
            >
              <Text style={[styles.tagText, { color: isDark ? '#e0e0e0' : '#333' }]}>
                {item.label}
              </Text>
            </View>
          )}
          style={[styles.list, { paddingHorizontal: padding }]}
        />
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, alignItems: 'center' },
  headerText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1 },
  tag: {
    height: TAG_HEIGHT,
    borderRadius: TAG_HEIGHT / 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: TAG_PADDING_H,
  },
  tagText: { fontSize: 14, fontWeight: '600' },
});
