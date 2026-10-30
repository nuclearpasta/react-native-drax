import { StyleSheet, Text, View } from 'react-native';

export const DEMO_H1 = 'react-native-drax live demo';
export const DEMO_INTRO =
  'Interactive examples of the react-native-drax drag-and-drop library: sortable lists and grids, cross-container reorder, drag handles, and collision modes.';

type DemoIntroProps = {
  color: string;
  muted: string;
};

/**
 * Web export renders role="heading" as <h1> and role="paragraph" as <p>.
 * The same tree is used for the static placeholder and the home screen, so
 * the first client render matches the server HTML.
 */
export function DemoIntro({ color, muted }: DemoIntroProps) {
  return (
    <View style={styles.wrap}>
      <Text role="heading" style={[styles.heading, { color }]}>
        {DEMO_H1}
      </Text>
      <Text
        role={'paragraph' as 'note'}
        style={[styles.intro, { color: muted }]}
      >
        {DEMO_INTRO}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  intro: {
    fontSize: 16,
    lineHeight: 22,
  },
});
