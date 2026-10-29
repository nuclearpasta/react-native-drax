import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { AppHeader } from '../../components/AppHeader';
import { useTheme } from '../../components/ThemeContext';

// +html.tsx sets this for the static document, but Expo Router's Head provider
// emits an empty <title data-rh> that wins after hydration. Keep the same title
// on the focused layout so the tab does not go blank (or fall back to the route name).
const DOCUMENT_TITLE = 'react-native-drax — Live Demo';

export default function ExamplesLayout() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{DOCUMENT_TITLE}</title>
        </Head>
      ) : null}
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
          title: DOCUMENT_TITLE,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
    </View>
  );
}
