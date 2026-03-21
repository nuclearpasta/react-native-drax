import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider } from '../components/ThemeContext';

// Lazy import to avoid crashing during static render pass (SSG).
// GestureHandler v3 beta has circular dependency issues when loaded server-side.
const GestureHandlerRootView =
  Platform.OS === 'web' && typeof window === 'undefined'
    ? View
    : require('react-native-gesture-handler').GestureHandlerRootView;

export default function RootLayout() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={styles.container}>
        <Stack screenOptions={{ headerShown: false }} />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
