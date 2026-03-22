import { useEffect } from 'react';
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

  // Expo's web reset sets body { overflow: hidden } which blocks the browser's
  // native pull-to-refresh on mobile. Override overflow-y to 'auto' — the app
  // content is exactly 100% height so no scrollbar appears, but the body is now
  // considered "scrollable" by the browser. This lets the overscroll gesture
  // (pull-to-refresh) trigger when the user swipes down from the top.
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.overflowY = 'auto';
    }
  }, []);

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
