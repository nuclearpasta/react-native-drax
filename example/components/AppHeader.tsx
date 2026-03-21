import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { LogoMark } from './LogoMark';
import { useTheme } from './ThemeContext';

const DOCS_URL = 'https://nuclearpasta.com/react-native-drax';
const GITHUB_URL = 'https://github.com/nuclearpasta/react-native-drax';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/' || pathname === '';

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 4,
          backgroundColor: theme.surfaceStrong,
          borderBottomColor: theme.line,
        },
      ]}
    >
      {!isHome && (
        <Pressable
          onPress={() => router.navigate('/' as any)}
          hitSlop={8}
          style={styles.homeButton}
        >
          <Icon name="chevron-left" size={26} color={theme.text} />
        </Pressable>
      )}
      <Pressable
        style={styles.brand}
        onPress={() => (isHome ? Linking.openURL(DOCS_URL) : router.navigate('/' as any))}
      >
        <LogoMark size={32} showTile />
        <View>
          <Text style={[styles.brandName, { color: theme.text }]}>Drax</Text>
          <Text style={[styles.brandSub, { color: theme.muted }]}>
            react-native-drax
          </Text>
        </View>
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable onPress={() => Linking.openURL(DOCS_URL)} hitSlop={8}>
          <Icon name="book-open-variant" size={18} color={theme.muted} />
        </Pressable>
        <Pressable onPress={() => Linking.openURL(GITHUB_URL)} hitSlop={8}>
          <Icon name="github" size={20} color={theme.muted} />
        </Pressable>
        <View style={styles.themeToggle}>
          <Icon
            name={isDark ? 'weather-night' : 'white-balance-sunny'}
            size={16}
            color={isDark ? '#f2b15a' : '#cf5f34'}
          />
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{
              false: 'rgba(17,17,17,0.12)',
              true: 'rgba(245,245,240,0.24)',
            }}
            thumbColor={isDark ? '#f5f5f0' : '#111111'}
            style={styles.switch}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  homeButton: {
    marginRight: 2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  brandName: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 20,
  },
  brandSub: {
    fontSize: 10,
    lineHeight: 13,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
});
