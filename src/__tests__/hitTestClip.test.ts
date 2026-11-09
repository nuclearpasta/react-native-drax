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
