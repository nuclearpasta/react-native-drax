import { Linking, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeContext';

function DocsButton() {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() =>
        Linking.openURL('https://nuclearpasta.com/react-native-drax')
      }
      hitSlop={8}
      style={{ marginRight: 4 }}
    >
      <Icon name="book-open-variant" size={20} color={theme.muted} />
    </Pressable>
  );
}

export default function ExamplesLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Examples',
        headerStyle: { backgroundColor: theme.surfaceStrong },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontWeight: '600' },
        headerRight: () => <DocsButton />,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
