// TEMPORARY harness screen for #333/#337 real-touch runs. Never merge.
// 200-row DraxList that reorders itself AND takes foreign drops from the palette.
// mode full: every row mounted, so every row is measured (own-list reorder works).
// mode virt: stock FlatList windowing (what the old L333 screen had; own reorder bails).
// mode small: real 50 pt rows (getItemLayout matches), windowSize 1 and 1-row batches, so only the viewport's rows
//   stay mounted for the whole drag (rows below never measure; no timing dependence).
// mode hole: getItemLayout claims 200 pt rows (real rows are 50 pt) and windowSize 1, so
//   only rows 0-3 mount; the rest of the viewport is blank with no mounted row (scenario 9).
// onExternalDrop is passed through DraxList's open props so this file also typechecks on main.
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DraxList, DraxProvider, DraxView } from 'react-native-drax';

const TAG = '[L333v]';
const ROW_H = 50;
const HOLE_H = 200;
const ROWS = Array.from({ length: 200 }, (_, i) => `R${String(i).padStart(3, '0')}`);
const MODES = ['full', 'virt', 'small', 'hole'] as const;
type Mode = (typeof MODES)[number];

interface ExternalDrop {
  toIndex: number;
  payload: unknown;
}

const modeProps = (mode: Mode, count: number) => {
  if (mode === 'full') return { initialNumToRender: count, windowSize: 1000 };
  if (mode === 'small') {
    // getItemLayout (true 50 pt rows) lets jump reach row 150; rows stay unmounted.
    return {
      initialNumToRender: 12,
      windowSize: 1,
      maxToRenderPerBatch: 1,
      getItemLayout: (_: unknown, index: number) => ({ length: ROW_H, offset: ROW_H * index, index }),
    };
  }
  if (mode === 'hole') {
    return {
      initialNumToRender: 4,
      windowSize: 1,
      maxToRenderPerBatch: 1,
      getItemLayout: (_: unknown, index: number) => ({
        length: HOLE_H,
        offset: HOLE_H * index,
        index,
      }),
    };
  }
  return {};
};

export default function Live333v() {
  const [data, setData] = useState(ROWS);
  const [mode, setMode] = useState<Mode>('full');
  const [ext, setExt] = useState(true);
  const [last, setLast] = useState('none');
  const [listKey, setListKey] = useState(0);
  const [jumped, setJumped] = useState(false);
  const nextId = useRef(0);
  const listRef = useRef<FlatList<string>>(null);

  const onExternalDrop = useCallback((e: ExternalDrop) => {
    nextId.current += 1;
    const item = `X${String(nextId.current).padStart(2, '0')}`;
    console.log(`${TAG} onExternalDrop t=${Date.now()} toIndex=${e.toIndex} payload=${String(e.payload)} insert=${item}`);
    setLast(`ext ${e.toIndex}`);
    setData((d) => [...d.slice(0, e.toIndex), item, ...d.slice(e.toIndex)]);
  }, []);

  const remount = (nextMode: Mode) => {
    setMode(nextMode);
    setData(ROWS);
    setLast('none');
    setJumped(false);
    nextId.current = 0;
    setListKey((k) => k + 1);
    console.log(`${TAG} reset t=${Date.now()} mode=${nextMode}`);
  };

  // scrollToOffset alone stops at the rendered content's end in windowed modes, so
  // jump by index and retry until FlatList has rendered far enough.
  const retries = useRef(0);
  const jump = () => {
    retries.current = 0;
    const index = jumped ? 0 : 150;
    listRef.current?.scrollToIndex({ index, animated: false });
    setJumped(!jumped);
    console.log(`${TAG} jump t=${Date.now()} index=${index}`);
  };
  const onScrollToIndexFailed = (info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    retries.current += 1;
    console.log(`${TAG} jump retry ${retries.current} t=${Date.now()} index=${info.index}`);
    if (retries.current >= 10) return;
    setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }), 50);
  };

  const nextMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'full';
  const extProps = ext ? { onExternalDrop } : {};

  return (
    <DraxProvider>
      <View style={styles.flex}>
        <View style={styles.bar}>
          <Btn label={`mode ${mode}`} onPress={() => remount(nextMode)} />
          <Btn label={`ext ${ext ? 1 : 0}`} onPress={() => setExt((v) => !v)} />
          <Btn label={jumped ? 'top' : 'jump'} onPress={jump} />
          <Btn label="l333v-reset" text="reset" onPress={() => remount(mode)} />
        </View>
        <View style={styles.bar}>
          <DraxView
            accessibilityLabel="palette"
            payload="P"
            longPressDelay={250}
            style={styles.palette}
            hoverDraggingStyle={styles.paletteHover}
            onDragStart={() => console.log(`${TAG} palette onDragStart t=${Date.now()} ext=${ext} mode=${mode}`)}
            onDragEnd={(e) => console.log(`${TAG} palette onDragEnd t=${Date.now()} cancelled=${String(e.cancelled)}`)}
          >
            <Text style={styles.paletteText}>P</Text>
          </DraxView>
          <Text accessibilityLabel={`last ${last}`} style={styles.status}>{`last ${last} n=${data.length}`}</Text>
        </View>
        <DraxList
          key={listKey}
          ref={listRef}
          data={data}
          keyExtractor={(item: string) => item}
          {...modeProps(mode, data.length)}
          {...extProps}
          onReorder={({ data: next, fromIndex, toIndex, isExternalDrag }) => {
            console.log(`${TAG} onReorder t=${Date.now()} from=${fromIndex} toIndex=${toIndex} external=${isExternalDrag}`);
            setLast(`reorder ${fromIndex}->${toIndex}`);
            setData(next);
          }}
          onDragStart={(e) => console.log(`${TAG} onDragStart t=${Date.now()} index=${e.index}`)}
          onDragPositionChange={(e) => console.log(`${TAG} onDragPositionChange t=${Date.now()} toIndex=${e.toIndex} prev=${e.previousIndex}`)}
          onDragEnd={(e) => console.log(`${TAG} onDragEnd t=${Date.now()} toIndex=${e.toIndex} cancelled=${e.cancelled}`)}
          onMomentumScrollEnd={(e: { nativeEvent: { contentOffset: { y: number } } }) =>
            console.log(`${TAG} scroll y=${Math.round(e.nativeEvent.contentOffset.y)} first~${Math.floor(e.nativeEvent.contentOffset.y / ROW_H)}`)
          }
          containerDraxViewProps={{ accessibilityLabel: 'l333v-list' }}
          containerStyle={styles.flex}
          style={styles.flex}
          scrollEventThrottle={16}
          onScrollToIndexFailed={onScrollToIndexFailed}
          renderItem={({ item }: { item: string }) => (
            <View accessibilityLabel={`row ${item}`} style={[styles.row, item.startsWith('X') ? styles.rowNew : Number(item.slice(1)) % 2 ? styles.rowOdd : styles.rowEven]}>
              <Text style={styles.rowText}>{item}</Text>
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
  btn: { backgroundColor: '#333', borderRadius: 6, paddingVertical: 8, width: 100, alignItems: 'center' },
  btnText: { color: 'white', fontSize: 14 },
  status: { fontSize: 14, flex: 1 },
  palette: { width: 60, height: 44, borderRadius: 8, backgroundColor: 'tomato', justifyContent: 'center', alignItems: 'center' },
  paletteHover: { opacity: 0.8 },
  paletteText: { color: 'white', fontWeight: '700', fontSize: 20 },
  row: { height: ROW_H, justifyContent: 'center', paddingLeft: 16 },
  rowOdd: { backgroundColor: '#e8eefc' },
  rowEven: { backgroundColor: '#fcf3e8' },
  rowNew: { backgroundColor: '#c8f7c5' },
  rowText: { fontSize: 18, fontFamily: 'Menlo' },
});
