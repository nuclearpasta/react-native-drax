import { View } from 'react-native';
import { Stack } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';
import { useTheme } from '../../components/ThemeContext';

export default function ExamplesLayout() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
    </View>
  );
}
