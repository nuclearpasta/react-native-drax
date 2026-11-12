// TEMPORARY harness screen for #333 scenario 11 (foreign drop into a grid or horizontal list).
// Never merge. Every cell is mounted (initialNumToRender = data length), so every cell is measured.
// onExternalDrop is passed through DraxList's open props so this file also typechecks on main.
// 'foot 1' (default) adds a blank list footer so a drop below the last row can be touched.
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DraxList, DraxProvider, DraxView } from 'react-native-drax';

const TAG = '[L333g]';
const CELLS = Array.from({ length: 30 }, (_, i) => `C${String(i).padStart(2, '0')}`);
type Layout = 'grid' | 'horiz';

interface ExternalDrop {
  toIndex: number;
  payload: unknown;
}

export default function Live333g() {
  const [data, setData] = useState(CELLS);
  const [layout, setLayout] = useState<Layout>('grid');
  const [ext, setExt] = useState(true);
  const [foot, setFoot] = useState(true);
  const [last, setLast] = useState('none');
  const [listKey, setListKey] = useState(0);
  const nextId = useRef(0);

  const onExternalDrop = useCallback((e: ExternalDrop) => {
    nextId.current += 1;
    const item = `X${String(nextId.current).padStart(2, '0')}`;
    console.log(`${TAG} onExternalDrop t=${Date.now()} toIndex=${e.toIndex} payload=${String(e.payload)} insert=${item}`);
    setLast(`ext ${e.toIndex}`);
    setData((d) => [...d.slice(0, e.toIndex), item, ...d.slice(e.toIndex)]);
  }, []);

  const remount = (next: Layout) => {
    setLayout(next);
    setData(CELLS);
    setLast('none');
    nextId.current = 0;
    setListKey((k) => k + 1);
    console.log(`${TAG} reset t=${Date.now()} layout=${next}`);
  };

  const grid = layout === 'grid';
  const extProps = ext ? { onExternalDrop } : {};

  return (
    <DraxProvider>
      <View style={styles.flex}>
        <View style={styles.bar}>
          <Btn label={`layout ${layout}`} onPress={() => remount(grid ? 'horiz' : 'grid')} />
          <Btn label={`ext ${ext ? 1 : 0}`} onPress={() => setExt((v) => !v)} />
          <Btn label={`foot ${foot ? 1 : 0}`} onPress={() => setFoot((v) => !v)} />
          <Btn label="l333g-reset" text="reset" onPress={() => remount(layout)} />
        </View>
        <View style={styles.bar}>
          <DraxView
            accessibilityLabel="palette"
            payload="P"
            longPressDelay={250}
            style={styles.palette}
            hoverDraggingStyle={styles.paletteHover}
            onDragStart={() => console.log(`${TAG} palette onDragStart t=${Date.now()} ext=${ext} layout=${layout}`)}
            onDragEnd={(e) => console.log(`${TAG} palette onDragEnd t=${Date.now()} cancelled=${String(e.cancelled)}`)}
          >
            <Text style={styles.paletteText}>P</Text>
          </DraxView>
          <Text accessibilityLabel={`last ${last}`} style={styles.status}>{`last ${last} n=${data.length}`}</Text>
        </View>
        <View style={grid ? styles.flex : styles.horizBox}>
          <DraxList
            key={listKey}
            data={data}
            keyExtractor={(item: string) => item}
            numColumns={grid ? 3 : 1}
            horizontal={!grid}
            initialNumToRender={data.length}
            windowSize={1000}
            {...extProps}
            onReorder={({ data: next, fromIndex, toIndex, isExternalDrag }) => {
              console.log(`${TAG} onReorder t=${Date.now()} from=${fromIndex} toIndex=${toIndex} external=${isExternalDrag}`);
              setLast(`reorder ${fromIndex}->${toIndex}`);
              setData(next);
            }}
            onDragPositionChange={(e) => console.log(`${TAG} onDragPositionChange t=${Date.now()} toIndex=${e.toIndex} prev=${e.previousIndex}`)}
            onDragEnd={(e) => console.log(`${TAG} onDragEnd t=${Date.now()} toIndex=${e.toIndex} cancelled=${e.cancelled}`)}
            containerDraxViewProps={{ accessibilityLabel: `l333g-list ${layout}` }}
            containerStyle={styles.flex}
            style={styles.flex}
            scrollEventThrottle={16}
            ListFooterComponent={
              foot ? <View accessibilityLabel="l333g-footer" style={grid ? styles.footer : styles.horizFooter} /> : null
            }
            renderItem={({ item }: { item: string }) => (
              <View accessibilityLabel={`cell ${item}`} style={[grid ? styles.cell : styles.horizCell, item.startsWith('X') ? styles.cellNew : styles.cellOld]}>
                <Text style={styles.cellText}>{item}</Text>
              </View>
            )}
          />
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
  horizBox: { height: 120 },
  bar: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center' },
  btn: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  btnText: { color: 'white', fontSize: 14 },
  status: { fontSize: 14, flex: 1 },
  palette: { width: 60, height: 44, borderRadius: 8, backgroundColor: 'tomato', justifyContent: 'center', alignItems: 'center' },
  paletteHover: { opacity: 0.8 },
  paletteText: { color: 'white', fontWeight: '700', fontSize: 20 },
  cell: { flex: 1, height: 90, margin: 4, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  footer: { height: 240 },
  horizFooter: { width: 240 },
  horizCell: { width: 90, height: 100, margin: 4, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  cellOld: { backgroundColor: '#e8eefc' },
  cellNew: { backgroundColor: '#c8f7c5' },
  cellText: { fontSize: 18, fontFamily: 'Menlo' },
});
