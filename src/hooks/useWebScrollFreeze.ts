import type { RefObject } from 'react';
import { useRef } from 'react';
import { Platform } from 'react-native';

/** Minimal structural type for a DOM node with style.overflow (no DOM lib needed). */
interface WebScrollNode {
  style: { overflow: string };
}

/** Structural type for list refs that expose getScrollableNode() on web. */
interface ScrollableListRef {
  getScrollableNode?: () => WebScrollNode | null;
  _listRef?: { getScrollableNode?: () => WebScrollNode | null };
}

/**
 * On mobile web, RNGH sets touch-action:none on gesture views which blocks
 * native scroll. We set touch-action:pan-y (via gesture config) to allow
 * scroll before long-press. When drag activates, this hook freezes the
 * scroll container (overflow:hidden) so scroll stops. On drag end, unfreeze.
 *
 * On native, this is a no-op.
 */
export function useWebScrollFreeze(scrollRef: RefObject<object | null>) {
  const frozenRef = useRef(false);

  const getScrollNode = (): WebScrollNode | null => {
    if (Platform.OS !== 'web') return null;
    // Narrow cast: web scroll methods aren't in RN type defs but exist at runtime
    const list = scrollRef.current as ScrollableListRef | null;
    if (!list) return null;
    // FlatList.getScrollableNode() returns the underlying DOM scroll element.
    // Some list components (FlashList) expose it on _listRef instead.
    return (
      list.getScrollableNode?.() ?? list._listRef?.getScrollableNode?.() ?? null
    );
  };

  const freeze = () => {
    if (frozenRef.current) return;
    const node = getScrollNode();
    if (node?.style) {
      node.style.overflow = 'hidden';
      frozenRef.current = true;
    }
  };

  const unfreeze = () => {
    if (!frozenRef.current) return;
    const node = getScrollNode();
    if (node?.style) {
      node.style.overflow = 'auto';
      frozenRef.current = false;
    }
  };

  return { freeze, unfreeze };
}
