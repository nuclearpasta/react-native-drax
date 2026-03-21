import { createContext, useCallback, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';

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

const light: Theme = {
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

const dark: Theme = {
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
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  const isDark =
    mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = isDark ? dark : light;

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      if (prev === 'system') return isDark ? 'light' : 'dark';
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, [isDark]);

  return (
    <ThemeContext value={{ theme, isDark, mode, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
