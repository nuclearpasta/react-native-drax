// TEMPORARY harness screen for #345 S3 (edm bank/card: far receiver vs padding receiver). Never merge.
// A narrow vertical "bank" list on the left plus cards that receive dropped rows:
// - far keep / far remove: a FAR_GAP (150) pt gap to the right of the list, beyond the list's
//   100 pt monitor hit-test padding (MONITOR_HIT_TEST_PADDING, src/math.ts). The list's monitor
//   exits before the drop, so the list must restore its order and NOT call onReorder.
// - near card: 10 pt under the list, INSIDE the padding (the list is still a monitor at release).
//   `near remove` removes the row, `near keep` only logs (toggle). Expect no onReorder either way.
// Every row is mounted (12 rows, initialNumToRender = n), so own reorder is not hit by the
// unmeasured-row bail-out. Uses only props that exist on main and on #345's head.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DraxList, DraxProvider, DraxView } from 'react-native-drax';
import type { DraxDragWithReceiverEventData } from 'react-native-drax';

const TAG = '[L345b]';
const ROW_H = 50;
const LIST_W = 120;
const FAR_GAP = 150;
const NEAR_GAP = 10;
const ROWS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i)); // A..L

/** Letter of a dropped list row (DraxList item payloads carry the item). */
const droppedItem = (payload: unknown) =>
  typeof payload === 'object' && payload !== null && 'item' in payload && typeof payload.item === 'string'
    ? payload.item
    : undefined;

type CardKind = 'far-keep' | 'far-remove' | 'near';

export default function Live345b() {
  const [data, setData] = useState(ROWS);
  const [nearRemoves, setNearRemoves] = useState(true);
  const [last, setLast] = useState('none');
  const [listKey, setListKey] = useState(0);
  const [got, setGot] = useState<Record<CardKind, string>>({ 'far-keep': '-', 'far-remove': '-', near: '-' });

  const reset = () => {
    setData(ROWS);
    setLast('none');
    setGot({ 'far-keep': '-', 'far-remove': '-', near: '-' });
    setListKey((k) => k + 1);
    console.log(`${TAG} reset t=${Date.now()}`);
  };

  const receive = (kind: CardKind, removes: boolean) => (e: DraxDragWithReceiverEventData) => {
    const item = droppedItem(e.dragged.payload);
    console.log(`${TAG} card ${kind} onReceiveDragDrop t=${Date.now()} item=${item} removes=${removes}`);
    setGot((g) => ({ ...g, [kind]: item ?? '?' }));
    setLast(`${kind} got ${item}`);
    if (removes && item !== undefined) setData((d) => d.filter((x) => x !== item));
  };

  const card = (kind: CardKind, label: string, removes: boolean, style: object) => (
    <DraxView
      key={kind}
      accessibilityLabel={`card ${kind}`}
      style={[styles.card, removes ? styles.cardRemove : styles.cardKeep, style]}
      receivingStyle={styles.cardReceiving}
      onReceiveDragEnter={() => console.log(`${TAG} card ${kind} enter t=${Date.now()}`)}
      onReceiveDragExit={() => console.log(`${TAG} card ${kind} exit t=${Date.now()}`)}
      onReceiveDragDrop={receive(kind, removes)}
    >
      <Text style={styles.cardText}>{label}</Text>
      <Text style={styles.cardText}>{`got ${got[kind]}`}</Text>
    </DraxView>
  );

  return (
    <DraxProvider>
      <View style={styles.flex}>
        <View style={styles.bar}>
          <Btn label={nearRemoves ? 'near remove' : 'near keep'} onPress={() => setNearRemoves((v) => !v)} />
          <Btn label="l345b-reset" text="reset" onPress={reset} />
        </View>
        <Text accessibilityLabel={`last ${last}`} style={styles.status}>{`last ${last}`}</Text>
        <Text accessibilityLabel={`order ${data.join('')}`} style={styles.status}>{`order ${data.join('')}`}</Text>
        <View style={styles.body}>
          <View style={styles.left}>
            <DraxList
              key={listKey}
              data={data}
              keyExtractor={(item: string) => item}
              initialNumToRender={data.length}
              windowSize={1000}
              onReorder={({ data: next, fromIndex, toIndex }) => {
                console.log(`${TAG} onReorder t=${Date.now()} from=${fromIndex} toIndex=${toIndex} data=${next.join('')}`);
                setLast(`reorder ${fromIndex}->${toIndex}`);
                setData(next);
              }}
              onDragStart={(e) => console.log(`${TAG} onDragStart t=${Date.now()} index=${e.index} item=${e.item}`)}
              onDragPositionChange={(e) => console.log(`${TAG} onDragPositionChange t=${Date.now()} toIndex=${e.toIndex} prev=${e.previousIndex}`)}
              onDragEnd={(e) => console.log(`${TAG} onDragEnd t=${Date.now()} index=${e.index} toIndex=${e.toIndex} cancelled=${e.cancelled}`)}
              containerDraxViewProps={{
                accessibilityLabel: 'l345b-list',
                onMonitorDragExit: () => console.log(`${TAG} list monitor exit t=${Date.now()}`),
                onMonitorDragEnd: () => console.log(`${TAG} list monitor end t=${Date.now()}`),
                onMonitorDragDrop: () => console.log(`${TAG} list monitor drop t=${Date.now()}`),
              }}
              containerStyle={styles.list}
              style={styles.list}
              scrollEventThrottle={16}
              renderItem={({ item }: { item: string }) => (
                <View accessibilityLabel={`row ${item}`} style={styles.row}>
                  <Text style={styles.rowText}>{item}</Text>
                </View>
              )}
            />
            {card('near', nearRemoves ? 'near (removes)' : 'near (keeps)', nearRemoves, styles.nearCard)}
          </View>
          <View style={styles.farColumn}>
            {card('far-keep', 'far keep', false, styles.farCard)}
            {card('far-remove', 'far remove', true, styles.farCard)}
          </View>
        </View>
      </View>
    </DraxProvider>
  );
}

function Btn({ label, text, onPress }: { label: string; text?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={styles.btn}>
      <Text style={styles.btnText}>{text ?? label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center' },
  btn: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  btnText: { color: 'white', fontSize: 14 },
  status: { fontSize: 13, paddingHorizontal: 6 },
  body: { flex: 1, flexDirection: 'row', paddingLeft: 6 },
  left: { width: LIST_W },
  list: { flex: 1, backgroundColor: '#f1f5f9' },
  row: { height: ROW_H, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#e8eefc' },
  rowText: { fontSize: 20, fontFamily: 'Menlo' },
  farColumn: { flex: 1, marginLeft: FAR_GAP, justifyContent: 'center', gap: 24, paddingRight: 6 },
  card: { borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 6 },
  cardKeep: { borderColor: '#3b82f6', backgroundColor: '#dbeafe' },
  cardRemove: { borderColor: '#ef4444', backgroundColor: '#fee2e2' },
  cardReceiving: { borderColor: '#16a34a', borderWidth: 4 },
  cardText: { fontSize: 12 },
  nearCard: { marginTop: NEAR_GAP, height: 70, marginBottom: 12 },
  farCard: { height: 90 },
});
