import type { ReactNode } from 'react';
import { use } from 'react';
import { act, create } from 'react-test-renderer';

import type { DraxInternalContextValue } from '../DraxContext';
import { DraxContext } from '../DraxContext';
import { DraxProvider } from '../DraxProvider';

// The provider renders again whenever the hover content is set or cleared (on every drag start and end). Every
// DraxView reads its context, so the context value must stay the same object across those renders, or every DraxView
// in the tree renders again with each drag.
const mockHoverVersions: number[] = [];
jest.mock('../HoverLayer', () => ({
  HoverLayer: ({ hoverVersion }: { hoverVersion: number }) => {
    mockHoverVersions.push(hoverVersion);
    return null;
  },
}));
jest.mock('react-native-reanimated', () => {
  const { useState: useStateMock } = jest.requireActual('react');
  return {
    __esModule: true,
    useSharedValue: <T,>(value: T) => useStateMock(() => ({ value }))[0],
    useAnimatedRef: () => useStateMock(() => ({ current: null }))[0],
    withTiming: <T,>(value: T) => value,
    withDelay: <T,>(_delay: number, value: T) => value,
  };
});
jest.mock('react-native-worklets', () => ({
  runOnUI:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) =>
      fn(...args),
  runOnJS: <F,>(fn: F) => fn,
}));

const seenContextValues: (DraxInternalContextValue | undefined)[] = [];

function ContextReader(): ReactNode {
  seenContextValues.push(use(DraxContext));
  return null;
}

describe('DraxProvider context value', () => {
  beforeEach(() => {
    mockHoverVersions.length = 0;
    seenContextValues.length = 0;
  });

  it('stays the same object when the provider renders again for the hover content', async () => {
    await act(async () => {
      create(
        <DraxProvider>
          <ContextReader />
        </DraxProvider>
      );
    });
    const contextValue = seenContextValues[0];
    expect(contextValue).toBeDefined();

    // What a drag start and a drag end do
    await act(async () => {
      contextValue?.setHoverContent('hover');
    });
    await act(async () => {
      contextValue?.setHoverContent(null);
    });

    // The provider rendered three times; the reader of its context only once
    expect(mockHoverVersions).toEqual([0, 1, 2]);
    expect(seenContextValues).toHaveLength(1);
  });
});
