import { useSpatialIndex } from '../useSpatialIndex';

// useSpatialIndex only needs useRef and useSharedValue: run it as a plain
// function with both stubbed.
jest.mock('react', () => ({
  useRef: <T,>(current: T) => ({ current }),
}));
jest.mock('react-native-reanimated', () => ({
  useSharedValue: <T,>(value: T) => ({
    value,
    modify(fn: (v: T) => T) {
      this.value = fn(this.value);
    },
  }),
}));

describe('useSpatialIndex unregister (#363)', () => {
  it('calls onBeforeUnregister while the entry can still be read', async () => {
    const seen: (string | undefined)[] = [];
    const ref = { current: (id: string) => seen.push(index.getViewEntry(id)?.id) };
    const index = useSpatialIndex(ref);
    index.registerView({ id: 'row', props: { draggable: true } });

    index.unregisterView('row');
    expect(seen).toEqual([]); // deferred: a re-register can still cancel it
    await Promise.resolve();
    expect(seen).toEqual(['row']);
    expect(index.getViewEntry('row')).toBeUndefined();
  });

  it('does not call it when the view re-registers (effect cleanup → re-run)', async () => {
    const onBefore = jest.fn();
    const index = useSpatialIndex({ current: onBefore });
    index.registerView({ id: 'row', props: { draggable: true } });

    index.unregisterView('row');
    index.registerView({ id: 'row', props: { draggable: true } });
    await Promise.resolve();
    expect(onBefore).not.toHaveBeenCalled();
    expect(index.getViewEntry('row')).toBeDefined();
  });
});
