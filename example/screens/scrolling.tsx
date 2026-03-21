import { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DraxProvider,
  DraxScrollView,
  DraxView,
  DraxSnapbackTargetPreset,
} from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';

export default function Scrolling() {
  const [sum, setSum] = useState(0);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <DraxProvider>
      <View testID="scrolling-screen" style={[styles.container, { paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: theme.bg }]}>
        <DraxScrollView horizontal style={styles.scrollView}>
          <DraxView
            testID="scroll-item-1"
            accessibilityLabel="Draggable number 1"
            accessibilityHint="Long press and drag to the sum bucket"
            accessibilityRole="button"
            style={[styles.item, styles.item1]}
            dragPayload={1}
            onDragStart={() => console.log('[scrolling:item1] dragStart')}
            onDragEnd={() => console.log('[scrolling:item1] dragEnd')}
          >
            <Text style={styles.scrollItemText}>1</Text>
          </DraxView>
          <DraxView
            testID="scroll-item-2"
            accessibilityLabel="Draggable number 2"
            accessibilityHint="Long press and drag to the sum bucket"
            accessibilityRole="button"
            style={[styles.item, styles.item2]}
            dragPayload={2}
            onDragStart={() => console.log('[scrolling:item2] dragStart')}
            onDragEnd={() => console.log('[scrolling:item2] dragEnd')}
          >
            <Text style={styles.scrollItemText}>2</Text>
          </DraxView>
          <DraxView
            testID="scroll-item-3"
            accessibilityLabel="Draggable number 3"
            accessibilityHint="Long press and drag to the sum bucket"
            accessibilityRole="button"
            style={[styles.item, styles.item3]}
            dragPayload={3}
            onDragStart={() => console.log('[scrolling:item3] dragStart')}
            onDragEnd={() => console.log('[scrolling:item3] dragEnd')}
          >
            <Text style={styles.scrollItemText}>3</Text>
          </DraxView>
          <DraxView
            testID="scroll-item-4"
            accessibilityLabel="Draggable number 4"
            accessibilityHint="Long press and drag to the sum bucket"
            accessibilityRole="button"
            style={[styles.item, styles.item4]}
            dragPayload={4}
            onDragStart={() => console.log('[scrolling:item4] dragStart')}
            onDragEnd={() => console.log('[scrolling:item4] dragEnd')}
          >
            <Text style={styles.scrollItemText}>4</Text>
          </DraxView>
        </DraxScrollView>
        <View style={[styles.footer, { borderTopColor: theme.line }]}>
          <Text style={[styles.description, { color: theme.muted }]}>
            The area above is a horizontal DraxScrollView containing 4 draggable
            number items. The number items can be dragged into the sum bucket
            below. Dragging an item near the edge of the scroll view will
            auto-scroll.
          </Text>
          <DraxView
            testID="sum-bucket"
            accessibilityLabel={`Sum bucket, current value: ${sum}`}
            accessibilityHint="Drop number items here to add to the sum"
            style={[styles.bucket, { backgroundColor: theme.surface, borderColor: theme.text }]}
            receivingStyle={styles.bucketReceiving}
            onReceiveDragDrop={(event) => {
              const payload = event.dragged.payload;
              console.log(`[scrolling:bucket] receiveDragDrop payload=${payload}`);
              if (typeof payload === 'number') {
                setSum((s) => s + payload);
              }
              return DraxSnapbackTargetPreset.None;
            }}
          >
            <Text style={[styles.bucketText, { color: theme.text }]}>{`Sum: ${sum}`}</Text>
          </DraxView>
        </View>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  item: {
    padding: 12,
    margin: 24,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#606060',
    justifyContent: 'center',
    alignItems: 'center',
  },
  item1: {
    width: 200,
    height: 100,
    backgroundColor: '#8080ff',
  },
  item2: {
    width: 100,
    height: 250,
    marginTop: 50,
    backgroundColor: '#80ff80',
  },
  item3: {
    width: 120,
    height: 120,
    marginTop: 120,
    backgroundColor: '#ff8080',
  },
  item4: {
    width: 80,
    height: 120,
    marginLeft: 80,
    backgroundColor: '#ff80ff',
  },
  scrollItemText: {
    fontSize: 32,
    color: '#111',
  },
  bucketText: {
    fontSize: 32,
  },
  footer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    padding: 20,
  },
  description: {
    fontSize: 16,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  bucket: {
    width: 180,
    height: 120,
    borderWidth: 3,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bucketReceiving: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderColor: '#22c55e',
  },
});
