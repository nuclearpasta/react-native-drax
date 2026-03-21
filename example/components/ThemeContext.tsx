import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  bg: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  line: string;
  lineStrong: string;
  cardShadowColor: string;
  cardShadowOpacity: number;
  logoTileBg: string;
  logoTileBorder: string;
}

export const light: Theme = {
  bg: '#f3f3f0',
  surface: '#fcfcfa',
  surfaceStrong: '#ffffff',
  text: '#111111',
  muted: '#5d5d5d',
  line: 'rgba(17, 17, 17, 0.12)',
  lineStrong: 'rgba(17, 17, 17, 0.22)',
  cardShadowColor: '#000',
  cardShadowOpacity: 0.06,
  logoTileBg: '#fff7ef',
  logoTileBorder: 'rgba(17, 17, 17, 0.12)',
};

export const dark: Theme = {
  bg: '#0c0c0e',
  surface: '#17171a',
  surfaceStrong: '#202025',
  text: '#f5f5f0',
  muted: '#afafa8',
  line: 'rgba(245, 245, 240, 0.14)',
  lineStrong: 'rgba(245, 245, 240, 0.24)',
  cardShadowColor: '#000',
  cardShadowOpacity: 0.34,
  logoTileBg: '#17171a',
  logoTileBorder: 'rgba(245, 245, 240, 0.16)',
};

// ── Module-level shared state ────────────────────────────────────────
// Guarantees a single source of truth even if Metro resolves this module
// through multiple paths in a monorepo.

let _mode: ThemeMode = 'system';
const _listeners = new Set<() => void>();

function getSnapshot(): ThemeMode {
  return _mode;
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function setMode(next: ThemeMode) {
  _mode = next;
  _listeners.forEach((cb) => cb());
}

function useSystemScheme(): 'light' | 'dark' {
  const scheme = useSyncExternalStore(
    (cb) => {
      const sub = Appearance.addChangeListener(cb);
      return () => sub.remove();
    },
    () => Appearance.getColorScheme() ?? 'light',
    () => 'light',
  );
  return scheme === 'dark' ? 'dark' : 'light';
}

// ── Context (for convenience, but backed by module state) ────────────

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: light,
  isDark: false,
  mode: 'system',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemScheme();
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => 'system' as ThemeMode);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? dark : light;

  const toggleTheme = useCallback(() => {
    const prev = _mode;
    if (prev === 'system') {
      setMode(systemScheme === 'dark' ? 'light' : 'dark');
    } else {
      setMode(prev === 'dark' ? 'light' : 'dark');
    }
  }, [systemScheme]);

  return (
    <ThemeContext value={{ theme, isDark, mode, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Darken a hex color for dark mode so bright pastels don't burn eyes.
 * Returns the original color in light mode.
 */
export function itemColor(hex: string, isDark: boolean): string {
  if (!isDark) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * 0.3);
  const dg = Math.round(g * 0.3);
  const db = Math.round(b * 0.3);
  return `rgb(${dr}, ${dg}, ${db})`;
}
