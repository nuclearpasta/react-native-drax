import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

interface Example {
  route: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Icon>['name'];
}

const EXAMPLES: Example[] = [
  {
    route: '/color-drag-drop',
    title: 'Color Drag & Drop',
    subtitle: 'Drop acceptance, hover styles, snap alignment',
    icon: 'water',
  },
  {
    route: '/reorderable-list',
    title: 'Reorderable List',
    subtitle: 'Animation presets, auto-scroll, drop indicator',
    icon: 'format-list-bulleted',
  },
  {
    route: '/reorderable-grid',
    title: 'Reorderable Grid',
    subtitle: 'Sortable grid with multi-column layout',
    icon: 'view-grid',
  },
  {
    route: '/drag-handles',
    title: 'Drag Handles',
    subtitle: 'Only the grip icon starts a drag',
    icon: 'drag',
  },
  {
    route: '/bounded-drag',
    title: 'Drag Bounds',
    subtitle: 'Constrain drag within a view',
    icon: 'selection',
  },
  {
    route: '/collision-modes',
    title: 'Collision Modes',
    subtitle: 'Center vs Intersect vs Contain',
    icon: 'vector-intersection',
  },
  {
    route: '/kanban-board',
    title: 'Kanban Board',
    subtitle: 'Drag cards between columns',
    icon: 'view-column',
  },
  {
    route: '/knight-moves',
    title: 'Knight Moves',
    subtitle: 'Chess knight drag puzzle',
    icon: 'chess-knight',
  },
  {
    route: '/scrolling',
    title: 'Scrolling',
    subtitle: 'Drag from scroll view to drop zone',
    icon: 'arrow-left-right',
  },
  {
    route: '/stress-test',
    title: 'Stress Test',
    subtitle: '100 items in a sortable list',
    icon: 'speedometer',
  },
];

function ExampleCard({ example }: { example: Example }) {
  const router = useRouter();

  return (
    <Pressable
      testID={`example-${example.route.slice(1)}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(example.route as any)}
    >
      <Icon name={example.icon} size={28} color="#333" style={styles.icon} />
      <View style={styles.cardText}>
        <Text style={styles.title}>{example.title}</Text>
        <Text style={styles.subtitle}>{example.subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={24} color="#999" />
    </Pressable>
  );
}

export default function ExamplesList() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.heading}>Drax Examples</Text>
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
    backgroundColor: '#f5f5f5',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  icon: {
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#222',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
});
