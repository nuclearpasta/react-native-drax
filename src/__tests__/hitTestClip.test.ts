import { hitTestWorklet } from '../math';
import type { SpatialEntry } from '../types';

// The reorderable-list example: a list (viewport y 100..770) with a remove
// zone right below it (y 770..833), outside the list. Rows sit in the list's
// content; the list scrolls them by its scroll offset.
const entry = (e: Partial<SpatialEntry> & Pick<SpatialEntry, 'id'>): SpatialEntry => ({
  x: 0, y: 0, width: 400, height: 63, parentIndex: -1,
  receptive: false, monitoring: false, draggable: false,
  rejectOwnChildren: false, collisionAlgorithm: 'center', ...e,
});

const list = entry({ id: 'list', y: 100, height: 670, monitoring: true });
const zone = entry({ id: 'zone', y: 770, receptive: true });
// Registered after the zone (a later FlatList batch), so it wins any overlap.
const rowBelow = entry({ id: 'rowBelow', y: 700, parentIndex: 0, receptive: true, draggable: true });
const rowCut = entry({ id: 'rowCut', y: 650, parentIndex: 0, receptive: true, draggable: true });
const dragged = entry({ id: 'dragged', y: 0, parentIndex: 0, receptive: true, draggable: true });
const entries = [list, zone, rowBelow, rowCut, dragged];

const scrolled = (y: number) => [{ x: 0, y }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
const at = (y: number, scrollY: number, views = entries) =>
  hitTestWorklet({ x: 200, y }, views, scrolled(scrollY), 'dragged', { width: 400, height: 63 });

describe('hitTestWorklet clips receivers to their ancestors', () => {
  it('drops on a view below the list, not on a row the list scrolled under it', () => {
    // Scrolled 30: rowBelow is drawn at 770..833, hidden below the viewport.
    expect(at(790, 30).receiverId).toBe('zone');
  });

  it('still hits a row inside the viewport, and a cut-off row only on its visible part', () => {
    // rowCut is drawn at 720..783; only 720..770 shows.
    expect(at(760, 30).receiverId).toBe('rowCut');
    expect(at(775, 30).receiverId).toBe('zone');
  });

  it('keeps padded monitor bounds for the list', () => {
    expect(at(790, 30).monitorIds).toContain('list');
  });

  it("does not let an 'intersect' row hit when it is clipped away", () => {
    const intersect = entries.map((e) =>
      e.id === 'rowBelow' ? { ...e, collisionAlgorithm: 'intersect' as const } : e
    );
    // The hover (768..831) overlaps rowBelow's hidden rect (770..833).
    expect(at(800, 30, intersect).receiverId).toBe('zone');
    // Scrolled 100, rowBelow is drawn at 700..763, inside the viewport.
    expect(at(740, 100, intersect).receiverId).toBe('rowBelow');
  });
});

// Sortable list inside an outer DraxScrollView. Outer is scrolled so the list
// is half off-screen (list abs -150..150 in an outer viewport 0..600).
const outer = entry({ id: 'outer', height: 600, monitoring: true });
const nestedList = entry({ id: 'nestedList', y: 100, height: 300, parentIndex: 0, monitoring: true });
const nestZone = entry({ id: 'nestZone', y: 200, receptive: true });
const rowOuterHidden = entry({
  id: 'rowOuterHidden', y: 50, parentIndex: 1, receptive: true, draggable: true,
});
const rowVisible = entry({
  id: 'rowVisible', y: 200, parentIndex: 1, receptive: true, draggable: true,
});
const rowInnerHidden = entry({
  id: 'rowInnerHidden', y: 400, parentIndex: 1, receptive: true, draggable: true,
});
const nestDragged = entry({ id: 'nestDragged', parentIndex: 1, receptive: true, draggable: true });
const nestEntries = [
  outer, nestedList, nestZone, rowOuterHidden, rowVisible, rowInnerHidden, nestDragged,
];
const nestScroll = (outerY: number, listY: number) => [
  { x: 0, y: outerY }, { x: 0, y: listY },
  { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
];
const nestAt = (y: number, outerY: number, listY: number) =>
  hitTestWorklet(
    { x: 200, y }, nestEntries, nestScroll(outerY, listY), 'nestDragged',
    { width: 400, height: 63 },
  );

describe('hitTestWorklet clips receivers hidden by a grandparent scroll view', () => {
  it('misses a row hidden by the outer scroll, hits a visible row, and still clips inner overflow', () => {
    // Outer scrolled 250: list abs -150..150. rowOuterHidden abs -100..-37 (above outer).
    expect(nestAt(-70, 250, 0).receiverId).toBe('');
    // rowVisible abs 50..113, inside the outer/list overlap.
    expect(nestAt(80, 250, 0).receiverId).toBe('rowVisible');
    // Inner scrolled 50: rowInnerHidden abs 200..263, below the list but inside the outer.
    // Without ancestor clip it would beat nestZone; with clip, nestZone wins.
    expect(nestAt(220, 250, 50).receiverId).toBe('nestZone');
  });
});
