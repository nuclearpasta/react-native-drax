import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { act, create } from 'react-test-renderer';

import { useSpatialIndex } from '../useSpatialIndex';

// A DraxView's drag gesture reads the view's index in the spatial index from its own SharedValue. When a view
// unregisters, the registry removes its entry and moves every later entry up by one. With a stable context nothing
// makes the views re-read their index, so the registry has to update each view's copy itself.
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    useSharedValue: <T,>(value: T) =>
      useStateMock(() => ({
        value,
        modify(modifier: (current: T) => T) {
          this.value = modifier(this.value);
        },
      }))[0],
  };
});

type SpatialIndex = ReturnType<typeof useSpatialIndex>;

let spatialIndex: SpatialIndex | undefined;

function Registry(): ReactNode {
  spatialIndex = useSpatialIndex();
  return null;
}

/** A view's own copy of its index, as DraxView holds it */
const viewIndex = () => ({ value: -1 }) as unknown as SharedValue<number>;

const register = (id: string, spatialIndexSV: SharedValue<number>) => {
  spatialIndex?.registerView({ id, props: { draggable: true }, spatialIndexSV });
};

/** unregisterView removes the entry in a microtask, so that an immediate re-registration can cancel it */
const unregister = async (id: string) => {
  await act(async () => {
    spatialIndex?.unregisterView(id);
    await Promise.resolve();
  });
};

describe('useSpatialIndex view index', () => {
  beforeEach(async () => {
    spatialIndex = undefined;
    await act(async () => {
      create(<Registry />);
    });
  });

  it('gives each view its index when it registers', () => {
    const a = viewIndex();
    const b = viewIndex();
    register('a', a);
    register('b', b);

    expect(a.value).toBe(0);
    expect(b.value).toBe(1);
  });

  it('moves the copy of every later view up when an earlier view unregisters', async () => {
    const a = viewIndex();
    const b = viewIndex();
    const c = viewIndex();
    register('a', a);
    register('b', b);
    register('c', c);

    await unregister('a');

    expect(b.value).toBe(0);
    expect(c.value).toBe(1);
    // The copies point at the views' own entries
    const entries = spatialIndex?.spatialIndexSV.value ?? [];
    expect(entries[b.value]?.id).toBe('b');
    expect(entries[c.value]?.id).toBe('c');
  });

  it('leaves the copy of an earlier view alone', async () => {
    const a = viewIndex();
    const b = viewIndex();
    register('a', a);
    register('b', b);

    await unregister('b');

    expect(a.value).toBe(0);
  });

  it('keeps the copy when a view registers again with the same id', async () => {
    const a = viewIndex();
    const b = viewIndex();
    register('a', a);
    register('b', b);
    await unregister('a');

    register('b', b);

    expect(b.value).toBe(0);
  });
});
