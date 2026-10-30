import type { ComponentType } from 'react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';
import { DemoIntro } from './DemoIntro';

const isWeb = Platform.OS === 'web';
// True only in the static-render bundle. The browser bundle evaluates this
// with window defined, so the two bundles must still produce the same first
// render or React hydration fails (error #418).
const isSSR = isWeb && typeof window === 'undefined';

function Placeholder({ name, intro }: { name: string; intro?: boolean }) {
  const isDark = useColorScheme() === 'dark';
  const color = isDark ? '#f5f5f0' : '#111111';
  const muted = isDark ? '#afafa8' : '#5d5d5d';
  if (intro) {
    return (
      <View style={{ flex: 1 }}>
        <DemoIntro color={color} muted={muted} />
      </View>
    );
  }
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
 * Keeps gesture-handler (and the rest of the screen module) out of the static
 * render. The exported HTML is the placeholder. On web, the first client
 * render must be that same placeholder; the lazy screen mounts after hydration.
 * Native renders the lazy screen immediately.
 */
export function clientScreen(
  importFn: () => Promise<{ default: ComponentType }>,
  name: string,
  options?: { intro?: boolean },
): ComponentType {
  const LazyScreen = isSSR ? null : lazy(importFn);

  return function ClientScreen() {
    const [mounted, setMounted] = useState(!isWeb);
    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted || !LazyScreen) {
      return <Placeholder name={name} intro={options?.intro} />;
    }

    return (
      <Suspense fallback={<Placeholder name={name} intro={options?.intro} />}>
        <LazyScreen />
      </Suspense>
    );
  };
}
