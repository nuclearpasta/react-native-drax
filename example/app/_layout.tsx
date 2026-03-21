import { Platform, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider, useTheme } from '../components/ThemeContext';

// Lazy import to avoid crashing during static render pass (SSG).
// GestureHandler v3 beta has circular dependency issues when loaded server-side.
const GestureHandlerRootView =
  Platform.OS === 'web' && typeof window === 'undefined'
    ? require('react-native').View
    : require('react-native-gesture-handler').GestureHandlerRootView;

function ThemedRoot() {
  const { theme } = useTheme();
  return (
    <GestureHandlerRootView
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
