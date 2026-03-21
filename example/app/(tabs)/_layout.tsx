import { Stack } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';

export default function ExamplesLayout() {
  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader />,
      }}
    />
  );
}
