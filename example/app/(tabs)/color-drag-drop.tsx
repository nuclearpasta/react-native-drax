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
import { DraxProvider, DraxView, DraxViewDragStatus } from 'react-native-drax';

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

const getStyleForWeights = ({ red, green, blue }: ColorWeights) => {
  const total = red + green + blue;
  let backgroundColor = '#dddddd';
  if (total > 0) {
    const r = Math.ceil(128 + 127 * (red / total));
    const g = Math.ceil(128 + 127 * (green / total));
    const b = Math.ceil(128 + 127 * (blue / total));
    backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
  return { backgroundColor };
};

const getEmptyWeights = (): ColorWeights => ({ red: 0, green: 0, blue: 0 });

const isColorPayload = (value: unknown): value is ColorPayload =>
  typeof value === 'object' &&
  value !== null &&
  'weights' in value &&
  'text' in value;

const ColorBlock = ({ name, weights }: ColorBlockProps) => (
  <DraxView
    testID={`color-block-${name.toLowerCase()}`}
    accessibilityLabel={`Draggable ${name} color block`}
    accessibilityHint="Long press and drag to a drop zone"
    accessibilityRole="button"
    style={[
      styles.centeredContent,
      styles.colorBlock,
      getStyleForWeights(weights),
    ]}
    draggingStyle={styles.dragging}
    dragReleasedStyle={styles.dragging}
    hoverDraggingStyle={styles.hoverDragging}
    dragPayload={{ weights, text: name[0] }}
  >
    <Text>{name}</Text>
  </DraxView>
);

export default function ColorDragDrop() {
  const [receivedWeights, setReceivedWeights] = useState(getEmptyWeights());
  const [receivedText, setReceivedText] = useState<string[]>([]);
  const [stagedWeights, setStagedWeights] = useState(getEmptyWeights());
  const [stagedText, setStagedText] = useState<string[]>([]);
  const insets = useSafeAreaInsets();

  return (
    <DraxProvider>
      <View testID="color-drag-drop-screen" style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <DraxView
          testID="receiving-zone"
          accessibilityLabel={
            receivedText.length > 0
              ? `Receiving Zone, contains: ${receivedText.join(' ')}`
              : 'Receiving Zone, empty'
          }
          accessibilityHint="Drop dragged colors here to collect them"
          animateSnap
          style={[
            styles.centeredContent,
            styles.receivingZone,
            getStyleForWeights(receivedWeights),
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
                <Text style={styles.incomingText}>
                  {incomingPayload?.text ?? '-'}
                </Text>
                {receivedText.length > 0 ? (
                  <Text style={styles.received}>{receivedText.join(' ')}</Text>
                ) : (
                  <Text style={styles.instruction}>Drag colors here</Text>
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
            transform: [{ rotate: '10deg' }],
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
              getStyleForWeights(stagedWeights),
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
              getStyleForWeights(stagedWeights),
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
    borderColor: '#ffffff',
    borderWidth: 2,
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
    borderColor: 'red',
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
  hoverDragging: {
    borderColor: 'magenta',
    borderWidth: 2,
  },
  stagingLayout: {
    flex: 3,
    margin: 8,
  },
  stagingZone: {
    flex: 1,
    borderRadius: 10,
    borderColor: '#ffffff',
    borderWidth: 2,
  },
  stagedCount: {
    fontSize: 18,
  },
});
