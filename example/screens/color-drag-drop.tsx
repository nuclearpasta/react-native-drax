import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { DraxProvider, DraxView, DraxViewDragStatus, snapToAlignment } from 'react-native-drax';
import { useTheme } from '../components/ThemeContext';
import { ExampleLinks } from '../components/ExampleLinks';

const MAX_RECEIVING_ITEMS = 4;

interface ColorWeights {
  red: number;
  green: number;
  blue: number;
}

interface ColorBlockProps {
  name: string;
  weights: ColorWeights;
}

interface ColorPayload {
  weights: ColorWeights;
  text: string;
}

const getStyleForWeights = (
  { red, green, blue }: ColorWeights,
  isDark = false,
) => {
  const total = red + green + blue;
  if (total === 0) {
    return { backgroundColor: isDark ? '#28282c' : '#dddddd' };
  }
  const base = isDark ? 30 : 128;
  const range = isDark ? 80 : 127;
  const r = Math.ceil(base + range * (red / total));
  const g = Math.ceil(base + range * (green / total));
  const b = Math.ceil(base + range * (blue / total));
  return { backgroundColor: `rgb(${r}, ${g}, ${b})` };
};

const getEmptyWeights = (): ColorWeights => ({ red: 0, green: 0, blue: 0 });

const isColorPayload = (value: unknown): value is ColorPayload =>
  typeof value === 'object' &&
  value !== null &&
  'weights' in value &&
  'text' in value;

const ColorBlock = ({ name, weights }: ColorBlockProps) => {
  const { isDark } = useTheme();
  return (
  <DraxView
    testID={`color-block-${name.toLowerCase()}`}
    accessibilityLabel={`Draggable ${name} color block`}
    accessibilityHint="Long press and drag to a drop zone"
    accessibilityRole="button"
    style={[
      styles.centeredContent,
      styles.colorBlock,
      getStyleForWeights(weights, isDark),
    ]}
    draggingStyle={styles.dragging}
    dragReleasedStyle={styles.dragging}
    hoverStyle={styles.hoverBase}
    hoverDraggingStyle={styles.hoverDragging}
    hoverDraggingWithReceiverStyle={styles.hoverOverReceiver}
    hoverDraggingWithoutReceiverStyle={styles.hoverNoReceiver}
    hoverDragReleasedStyle={styles.hoverReleased}
    snapDelay={0}
    snapDuration={300}
    dragPayload={{ weights, text: name[0] }}
  >
    <Text>{name}</Text>
  </DraxView>
  );
};

export default function ColorDragDrop() {
  const [receivedWeights, setReceivedWeights] = useState(getEmptyWeights());
  const [receivedText, setReceivedText] = useState<string[]>([]);
  const [stagedWeights, setStagedWeights] = useState(getEmptyWeights());
  const [stagedText, setStagedText] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const receivingFull = receivedText.length >= MAX_RECEIVING_ITEMS;

  return (
    <DraxProvider>
      <View testID="color-drag-drop-screen" style={[styles.container, { paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: theme.bg }]}>
        <ExampleLinks slug="color-drag-drop" />
        <DraxView
          testID="receiving-zone"
          accessibilityLabel={
            receivedText.length > 0
              ? `Receiving Zone, contains: ${receivedText.join(' ')}, ${MAX_RECEIVING_ITEMS - receivedText.length} slots remaining`
              : 'Receiving Zone, empty'
          }
          accessibilityHint="Drop dragged colors here to collect them"
          animateSnap
          snapDelay={0}
          snapDuration={200}
          acceptsDrag={() => !receivingFull}
          style={[
            styles.centeredContent,
            styles.receivingZone,
            getStyleForWeights(receivedWeights, isDark),
            receivingFull && styles.zoneFull,
          ]}
          receivingStyle={styles.receiving}
          renderContent={({ viewState }) => {
            const receivingDrag = viewState?.receivingDrag;
            const incomingPayload = isColorPayload(receivingDrag?.payload)
              ? receivingDrag.payload
              : undefined;
            return (
              <>
                <Text>Receiving Zone</Text>
                <Text style={styles.capacityText}>
                  {receivedText.length}/{MAX_RECEIVING_ITEMS}
                </Text>
                <Text style={styles.incomingText}>
                  {incomingPayload?.text ?? '-'}
                </Text>
                {receivedText.length > 0 ? (
                  <Text style={styles.received}>{receivedText.join(' ')}</Text>
                ) : (
                  <Text style={styles.instruction}>Drag colors here</Text>
                )}
                {receivingFull && (
                  <Text style={styles.fullText}>Full!</Text>
                )}
                {receivedText.length > 0 && (
                  <View style={styles.overlay}>
                    <Pressable
                      testID="receiving-zone-clear-button"
                      accessibilityLabel="Clear received colors"
                      accessibilityHint="Tap to remove all received colors"
                      accessibilityRole="button"
                      onPress={() => {
                        setReceivedText([]);
                        setReceivedWeights(getEmptyWeights());
                      }}
                      style={({ pressed }) => [
                        styles.trashButton,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Icon size={20} name="delete" color="#333333" />
                    </Pressable>
                  </View>
                )}
              </>
            );
          }}
          onReceiveDragDrop={(event) => {
            const payload = isColorPayload(event.dragged.payload)
              ? event.dragged.payload
              : { text: '?', weights: getEmptyWeights() };
            setReceivedText([...receivedText, payload.text]);
            setReceivedWeights({
              red: receivedWeights.red + payload.weights.red,
              green: receivedWeights.green + payload.weights.green,
              blue: receivedWeights.blue + payload.weights.blue,
            });

            // Snap the hover to top-left of the receiver with 8px padding
            return snapToAlignment(
              event.receiver.measurements!,
              event.dragged.measurements,
              'top-left',
              { x: 8, y: 8 },
            );
          }}
        />
        <View testID="color-palette" accessibilityLabel="Color palette" style={styles.palette}>
          <View testID="color-palette-row-1" accessibilityLabel="Top row: Red, Green, Blue" style={styles.paletteRow}>
            <ColorBlock name="Red" weights={{ red: 1, green: 0, blue: 0 }} />
            <ColorBlock name="Green" weights={{ red: 0, green: 1, blue: 0 }} />
            <ColorBlock name="Blue" weights={{ red: 0, green: 0, blue: 1 }} />
          </View>
          <View testID="color-palette-row-2" accessibilityLabel="Bottom row: Cyan, Magenta, Yellow" style={styles.paletteRow}>
            <ColorBlock name="Cyan" weights={{ red: 0, green: 1, blue: 1 }} />
            <ColorBlock
              name="Magenta"
              weights={{ red: 1, green: 0, blue: 1 }}
            />
            <ColorBlock name="Yellow" weights={{ red: 1, green: 1, blue: 0 }} />
          </View>
        </View>
        <DraxView
          testID="staging-zone"
          accessibilityLabel={
            stagedText.length > 0
              ? `Staging Zone, contains: ${stagedText.join(' ')}, draggable`
              : 'Staging Zone, empty'
          }
          accessibilityHint={
            stagedText.length > 0
              ? 'Long press and drag to send staged colors to receiving zone'
              : 'Drop colors here to stage them'
          }
          dragPayload={{
            weights: stagedWeights,
            text: stagedText.join(' '),
          }}
          draggable={stagedText.length > 0}
          style={styles.stagingLayout}
          receivingStyle={styles.receiving}
          hoverDraggingStyle={{
            transform: [{ rotate: '5deg' }, { scale: 1.05 }],
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
          }}
          renderContent={({ viewState }) => {
            const receivingDrag = viewState?.receivingDrag;
            const incomingPayload = isColorPayload(receivingDrag?.payload)
              ? receivingDrag.payload
              : undefined;
            const active =
              viewState?.dragStatus != null &&
              viewState.dragStatus !== DraxViewDragStatus.Inactive;
            const combinedStyles: ViewStyle[] = [
              styles.centeredContent,
              styles.stagingZone,
              getStyleForWeights(stagedWeights, isDark),
            ];
            if (active) {
              combinedStyles.push({ opacity: 0.2 });
            } else if (receivingDrag) {
              combinedStyles.push(styles.receiving);
            }
            return (
              <View style={combinedStyles}>
                <Text>Staging Zone</Text>
                <Text style={styles.incomingText}>
                  {incomingPayload?.text ?? '-'}
                </Text>
                {stagedText.length > 0 ? (
                  <Text style={styles.received}>{stagedText.join(' ')}</Text>
                ) : (
                  <Text style={styles.instruction}>
                    Drag colors here, then drag this to receiving zone
                  </Text>
                )}
                {stagedText.length > 0 && (
                  <View style={styles.overlay}>
                    <Pressable
                      testID="staging-zone-clear-button"
                      accessibilityLabel="Clear staged colors"
                      accessibilityHint="Tap to remove all staged colors"
                      accessibilityRole="button"
                      onPress={() => {
                        setStagedText([]);
                        setStagedWeights(getEmptyWeights());
                      }}
                      style={({ pressed }) => [
                        styles.trashButton,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Icon size={20} name="delete" color="#333333" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
          renderHoverContent={({ viewState }) => {
            const combinedStyles: ViewStyle[] = [
              styles.centeredContent,
              styles.colorBlock,
              getStyleForWeights(stagedWeights, isDark),
            ];
            if (viewState?.grabOffset) {
              combinedStyles.push({
                marginLeft: viewState.grabOffset.x - 40,
                marginTop: viewState.grabOffset.y - 30,
              });
            }
            if (viewState?.dragStatus === DraxViewDragStatus.Dragging) {
              combinedStyles.push(styles.hoverDragging);
            }
            return (
              <View style={combinedStyles}>
                <Text style={styles.stagedCount}>{stagedText.length}</Text>
              </View>
            );
          }}
          onReceiveDragDrop={(event) => {
            const payload = isColorPayload(event.dragged.payload)
              ? event.dragged.payload
              : { text: '?', weights: getEmptyWeights() };
            setStagedText([...stagedText, payload.text]);
            setStagedWeights({
              red: stagedWeights.red + payload.weights.red,
              green: stagedWeights.green + payload.weights.green,
              blue: stagedWeights.blue + payload.weights.blue,
            });
          }}
          onDragDrop={() => {
            setStagedText([]);
            setStagedWeights(getEmptyWeights());
          }}
          longPressDelay={200}
        />
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  receivingZone: {
    flex: 3,
    borderRadius: 10,
    margin: 8,
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
  },
  zoneFull: {
    borderColor: '#ff6666',
    borderStyle: 'dashed',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  trashButton: {
    width: 30,
    height: 30,
    backgroundColor: '#999999',
    borderRadius: 15,
    margin: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiving: {
    borderColor: '#22c55e',
    borderWidth: 2,
    shadowColor: '#22c55e',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  incomingText: {
    marginTop: 10,
    fontSize: 24,
  },
  received: {
    marginTop: 10,
    fontSize: 18,
  },
  instruction: {
    marginTop: 10,
    fontSize: 12,
    fontStyle: 'italic',
  },
  capacityText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  fullText: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#cc0000',
  },
  palette: {
    justifyContent: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 8,
  },
  colorBlock: {
    width: 80,
    height: 60,
    borderRadius: 10,
    marginHorizontal: 8,
  },
  dragging: {
    opacity: 0.2,
  },
  hoverBase: {
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  hoverDragging: {
    borderColor: 'rgba(168,85,247,0.6)',
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  hoverOverReceiver: {
    borderColor: '#22c55e',
    borderWidth: 3,
    transform: [{ scale: 1.12 }],
    shadowColor: '#22c55e',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  hoverNoReceiver: {
    borderColor: 'rgba(150,150,150,0.4)',
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
    opacity: 0.85,
  },
  hoverReleased: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  stagingLayout: {
    flex: 3,
    margin: 8,
  },
  stagingZone: {
    flex: 1,
    borderRadius: 10,
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
  },
  stagedCount: {
    fontSize: 18,
  },
});
