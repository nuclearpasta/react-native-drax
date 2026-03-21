import { StyleSheet, View } from 'react-native';
import { useTheme } from './ThemeContext';

const CIRCLE_COLORS = {
  center: '#cf5f34',
  side: '#e67e3d',
  pole: '#f2b15a',
} as const;

interface LogoMarkProps {
  size?: number;
  showTile?: boolean;
}

export function LogoMark({ size = 40, showTile = false }: LogoMarkProps) {
  const { theme } = useTheme();
  const circleSize = size * 0.15;
  const gap = size * 0.2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
        },
        showTile && {
          backgroundColor: theme.logoTileBg,
          borderWidth: 1,
          borderColor: theme.logoTileBorder,
        },
      ]}
    >
      {/* Top circle (pole) */}
      <View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: CIRCLE_COLORS.pole,
            top: size * 0.22,
            left: (size - circleSize) / 2,
          },
        ]}
      />
      {/* Left circle (side) */}
      <View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: CIRCLE_COLORS.side,
            top: size * 0.22 + gap,
            left: (size - circleSize) / 2 - gap,
          },
        ]}
      />
      {/* Center circle (core) */}
      <View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: CIRCLE_COLORS.center,
            top: size * 0.22 + gap,
            left: (size - circleSize) / 2,
          },
        ]}
      />
      {/* Right circle (side) */}
      <View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: CIRCLE_COLORS.side,
            top: size * 0.22 + gap,
            left: (size - circleSize) / 2 + gap,
          },
        ]}
      />
      {/* Bottom circle (pole) */}
      <View
        style={[
          styles.circle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
            backgroundColor: CIRCLE_COLORS.pole,
            top: size * 0.22 + gap * 2,
            left: (size - circleSize) / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  circle: {
    position: 'absolute',
  },
});
