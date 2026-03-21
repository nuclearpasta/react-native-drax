import { Stack } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';
import { useTheme } from '../../components/ThemeContext';

export default function ExamplesLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader />,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  );
}
