import type { ComponentType } from 'react';
import { lazy, Suspense } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';

const isSSR = Platform.OS === 'web' && typeof window === 'undefined';

function Placeholder({ name }: { name: string }) {
  const isDark = useColorScheme() === 'dark';
  const color = isDark ? '#e0e0e0' : '#000';
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color }}>{name}</Text>
      <Text style={{ textAlign: 'center', opacity: 0.6, color }}>
        Interactive drag-and-drop example. Loading...
      </Text>
    </View>
  );
}

/**
 * Wraps a dynamic import so the component is never loaded during SSR.
 * During static rendering, returns an SEO placeholder.
 * On the client, lazily loads and renders the real component.
 */
export function clientScreen(
  importFn: () => Promise<{ default: ComponentType }>,
  name: string,
): ComponentType {
  if (isSSR) {
    return () => <Placeholder name={name} />;
  }
  const LazyComponent = lazy(importFn);
  return () => (
    <Suspense fallback={<Placeholder name={name} />}>
      <LazyComponent />
    </Suspense>
  );
}
