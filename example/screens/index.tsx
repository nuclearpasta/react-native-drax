import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../components/ThemeContext';

const DOCS_EXAMPLES_BASE =
  'https://nuclearpasta.com/react-native-drax/examples';
const GITHUB_BASE =
  'https://github.com/nuclearpasta/react-native-drax/blob/main/example/screens';

interface Example {
  route: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  sourceFile: string;
  docsSlug: string;
}

const EXAMPLES: Example[] = [
  {
    route: '/reorderable-list',
    title: 'Reorderable List (5000)',
    subtitle: '5000 items with cell recycling + reorder',
    icon: 'format-list-bulleted',
    sourceFile: 'reorderable-list.tsx',
    docsSlug: 'reorderable-list',
  },
  {
    route: '/reorderable-grid',
    title: 'Reorderable Grid',
    subtitle: '3-column grid with drag-and-drop',
    icon: 'view-grid',
    sourceFile: 'reorderable-grid.tsx',
    docsSlug: 'reorderable-grid',
  },
  {
    route: '/mixed-grid',
    title: 'Mixed-Size Grid',
    subtitle: 'Items with different spans (1×1, 2×2, etc.)',
    icon: 'view-dashboard',
    sourceFile: 'mixed-grid.tsx',
    docsSlug: 'mixed-grid',
  },
  {
    route: '/drag-handles',
    title: 'Drag Handles',
    subtitle: 'Only the grip icon starts a drag',
    icon: 'drag',
    sourceFile: 'drag-handles.tsx',
    docsSlug: 'drag-handles',
  },
  {
    route: '/cross-list',
    title: 'Cross-List Reorder',
    subtitle: 'Drag items between two columns',
    icon: 'view-column',
    sourceFile: 'cross-list.tsx',
    docsSlug: 'cross-list',
  },
  {
    route: '/color-drag-drop',
    title: 'Color Drag & Drop',
    subtitle: 'Drop acceptance, hover styles, snap alignment',
    icon: 'water',
    sourceFile: 'color-drag-drop.tsx',
    docsSlug: 'color-drag-drop',
  },
  {
    route: '/bounded-drag',
    title: 'Drag Bounds',
    subtitle: 'Constrain drag within a view',
    icon: 'selection',
    sourceFile: 'bounded-drag.tsx',
    docsSlug: 'drag-bounds',
  },
  {
    route: '/collision-modes',
    title: 'Collision Modes',
    subtitle: 'Center vs Intersect vs Contain',
    icon: 'vector-intersection',
    sourceFile: 'collision-modes.tsx',
    docsSlug: 'collision-modes',
  },
  {
    route: '/knight-moves',
    title: 'Knight Moves',
    subtitle: 'Chess knight drag puzzle',
    icon: 'chess-knight',
    sourceFile: 'knight-moves.tsx',
    docsSlug: 'knight-moves',
  },
  {
    route: '/scrolling',
    title: 'Scrolling',
    subtitle: 'Drag from scroll view to drop zone',
    icon: 'arrow-left-right',
    sourceFile: 'scrolling.tsx',
    docsSlug: 'scrolling',
  },
];

function ExampleCard({ example }: { example: Example }) {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <Pressable
      testID={`example-${example.route.slice(1)}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surfaceStrong,
          shadowColor: theme.cardShadowColor,
          shadowOpacity: theme.cardShadowOpacity,
          borderColor: theme.line,
        },
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(example.route as any)}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: theme.logoTileBg }]}
      >
        <Icon name={example.icon} size={22} color="#cf5f34" />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.title, { color: theme.text }]}>
          {example.title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          {example.subtitle}
        </Text>
        <View style={styles.linkRow}>
          <Pressable
            style={styles.linkButton}
            onPress={() =>
              Linking.openURL(`${GITHUB_BASE}/${example.sourceFile}`)
            }
            hitSlop={4}
          >
            <Icon name="github" size={13} color={theme.muted} />
            <Text style={[styles.linkText, { color: theme.muted }]}>
              Source
            </Text>
          </Pressable>
          <Pressable
            style={styles.linkButton}
            onPress={() =>
              Linking.openURL(`${DOCS_EXAMPLES_BASE}/${example.docsSlug}`)
            }
            hitSlop={4}
          >
            <Icon name="book-open-variant" size={13} color={theme.muted} />
            <Text style={[styles.linkText, { color: theme.muted }]}>Docs</Text>
          </Pressable>
        </View>
      </View>
      <Icon name="chevron-right" size={24} color={theme.muted} />
    </Pressable>
  );
}

export default function ExamplesList() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.heading, { color: theme.text }]}>Examples</Text>
      <FlatList
        data={EXAMPLES}
        keyExtractor={(item) => item.route}
        renderItem={({ item }) => <ExampleCard example={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginVertical: 4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
