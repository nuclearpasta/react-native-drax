// TEMPORARY harness screen for #337 B6 (finger jitter gate, FINGER_JITTER_THRESHOLD = 5 px,
// measured at the finger as |dx| + |dy|). Never merge.
// Rows are thin (default 6 pt, no gap) so a 4 px move WOULD cross a slot boundary without the
// gate: the hover centre only needs half a row (3 pt) to reach the next slot. Rows are full width,
// so grabbing near the left edge is an off-centre grab (~150 pt from the hover centre in x).
// The stock Reorderable List can't fail B6: its rows are 58-88 pt, so <5 px never reorders anyway.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DraxList, DraxProvider } from 'react-native-drax';

const TAG = '[L337j]';
const ROWS = Array.from({ length: 40 }, (_, i) => `J${String(i).padStart(2, '0')}`);
const HEIGHTS = [6, 10, 50] as const;

export default function Live337j() {
  const [data, setData] = useState(ROWS);
  const [h, setH] = useState<number>(6);
  const [last, setLast] = useState('none');
  const [listKey, setListKey] = useState(0);

  const reset = (nextH: number) => {
    setH(nextH);
    setData(ROWS);
    setLast('none');
    setListKey((k) => k + 1);
    console.log(`${TAG} reset t=${Date.now()} rowH=${nextH}`);
  };
  const nextH = HEIGHTS[(HEIGHTS.indexOf(h as (typeof HEIGHTS)[number]) + 1) % HEIGHTS.length] ?? 6;

  return (
    <DraxProvider>
      <View style={styles.flex}>
        <View style={styles.bar}>
          <Btn label={`rowh ${h}`} onPress={() => reset(nextH)} />
          <Btn label="l337j-reset" text="reset" onPress={() => reset(h)} />
          <Text accessibilityLabel={`last ${last}`} style={styles.status}>{`last ${last}`}</Text>
        </View>
        <DraxList
          key={listKey}
          data={data}
          keyExtractor={(item: string) => item}
          initialNumToRender={data.length}
          windowSize={1000}
          onReorder={({ data: next, fromIndex, toIndex }) => {
            console.log(`${TAG} onReorder t=${Date.now()} from=${fromIndex} toIndex=${toIndex}`);
            setLast(`reorder ${fromIndex}->${toIndex}`);
            setData(next);
          }}
          onDragStart={(e) => console.log(`${TAG} onDragStart t=${Date.now()} index=${e.index} rowH=${h}`)}
          onDragPositionChange={(e) => console.log(`${TAG} onDragPositionChange t=${Date.now()} toIndex=${e.toIndex} prev=${e.previousIndex}`)}
          onDragEnd={(e) => console.log(`${TAG} onDragEnd t=${Date.now()} toIndex=${e.toIndex} cancelled=${e.cancelled}`)}
          containerDraxViewProps={{ accessibilityLabel: 'l337j-list' }}
          containerStyle={styles.flex}
          style={styles.flex}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: string }) => (
            <View accessibilityLabel={`row ${item}`} style={[styles.row, { height: h }, Number(item.slice(1)) % 2 ? styles.rowOdd : styles.rowEven]}>
              <Text style={[styles.rowText, { fontSize: Math.max(4, Math.min(16, h - 2)) }]}>{item}</Text>
            </View>
          )}
        />
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
  status: { fontSize: 14, flex: 1 },
  row: { justifyContent: 'center', paddingLeft: 16 },
  rowOdd: { backgroundColor: '#e8eefc' },
  rowEven: { backgroundColor: '#fcd9b8' },
  rowText: { fontFamily: 'Menlo' },
});
