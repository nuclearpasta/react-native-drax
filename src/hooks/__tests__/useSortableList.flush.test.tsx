import { act, create } from 'react-test-renderer';

import type { SortableListHandle } from '../../types';
import { useSortableList } from '../useSortableList';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: <V,>(init: V) => useRef({ value: init }).current,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUI:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) =>
      fn(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface Item {
  key: string;
  v: number;
}

const items = (keys: string, v = 0): Item[] =>
  keys.split('').map((key) => ({ key, v }));
const keysOf = (data: readonly Item[]) => data.map((i) => i.key).join('');

const keyExtractor = (item: Item) => item.key;
const noop = () => {};

let handle: SortableListHandle<Item>;
const Harness = ({ data }: { data: Item[] }) => {
  handle = useSortableList({
    data,
    keyExtractor,
    onReorder: noop,
  });
  return null;
};

const render = (data: Item[]) => {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(<Harness data={data} />);
  });
  return (next: Item[]) =>
    act(() => {
      root.update(<Harness data={next} />);
    });
};

/** Start a drag: what SortableContainer.handleMonitorDragStart does. */
const startDrag = () => act(() => handle._internal.initPendingOrder());

/**
 * Drop with `order` (indexes into the current stableData): the sequence
 * SortableContainer.finalizeDrag runs. Returns the onReorder data.
 */
const drop = (order: number[]) => {
  const internal = handle._internal;
  const data = order.map((i) => internal.rawData[i]!);
  act(() => {
    internal.pendingOrderRef.current = order;
    internal.commitVisualOrder();
    internal.pendingOrderRef.current = [];
    internal.flushVisualOrder();
  });
  return data;
};

describe('useSortableList flushVisualOrder', () => {
  it('flushes on echo, then applies a same-order data update', () => {
    const update = render(items('ABC'));
    const echoed = drop([2, 1, 0]);
    expect(keysOf(handle.data)).toBe('ABC'); // permanent shifts until echo

    update(echoed);
    expect(handle.data).toBe(echoed);
    expect(handle._internal.committedOrderRef.current).toEqual([]);
    expect(handle._internal.shiftsRef.value).toEqual({});

    const edited = items('CBA', 1);
    update(edited);
    expect(handle.data).toBe(edited);
  });

  it('does not swap data under a drag started before the echo', () => {
    const update = render(items('ABCDEF'));
    const echoed = drop([5, 4, 3, 2, 1, 0]); // F E D C B A

    startDrag();
    expect(handle._internal.pendingOrderRef.current).toEqual([5, 4, 3, 2, 1, 0]);
    update(echoed);
    // Pending order still indexes into the pre-echo data.
    expect(keysOf(handle.data)).toBe('ABCDEF');

    // Swap C and D: indexes refer to the unflushed ABCDEF data.
    const second = drop([5, 4, 2, 3, 1, 0]);
    expect(keysOf(second)).toBe('FECDBA');
    update(second);
    expect(handle.data).toBe(second);
    expect(handle._internal.committedOrderRef.current).toEqual([]);
  });

  it('keeps the committed order when the parent does not store data', () => {
    const data = items('ABC');
    const update = render(data);
    drop([2, 1, 0]);

    update(data); // uncontrolled parent re-renders with the same array
    expect(handle.data).toBe(data);
    expect(handle._internal.committedOrderRef.current).toEqual([2, 1, 0]);

    // The next drag starts from what the user sees, not from identity.
    startDrag();
    expect(handle._internal.pendingOrderRef.current).toEqual([2, 1, 0]);
  });
});
