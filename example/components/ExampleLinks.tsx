import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from './ThemeContext';

const EXAMPLES_DOCS_URL = 'https://nuclearpasta.com/react-native-drax/examples';
const GITHUB_SCREENS_URL =
  'https://github.com/nuclearpasta/react-native-drax/tree/main/example/screens';

interface ExampleLinksProps {
  slug: string;
  sourceFile?: string;
}

export function ExampleLinks({ slug, sourceFile }: ExampleLinksProps) {
  const { theme } = useTheme();
  const file = sourceFile ?? `${slug}.tsx`;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.link}
        onPress={() => Linking.openURL(`${GITHUB_SCREENS_URL}/${file}`)}
        hitSlop={4}
      >
        <Icon name="code-tags" size={14} color={theme.muted} />
        <Text style={[styles.linkText, { color: theme.muted }]}>Source</Text>
      </Pressable>
      <Text style={[styles.separator, { color: theme.line }]}>|</Text>
      <Pressable
        style={styles.link}
        onPress={() => Linking.openURL(`${EXAMPLES_DOCS_URL}/${slug}`)}
        hitSlop={4}
      >
        <Icon name="book-open-variant" size={14} color={theme.muted} />
        <Text style={[styles.linkText, { color: theme.muted }]}>Docs</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '500',
  },
  separator: {
    fontSize: 12,
  },
});
