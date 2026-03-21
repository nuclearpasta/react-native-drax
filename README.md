# react-native-drax

**A drag-and-drop framework for React Native**

[![npm version](https://badge.fury.io/js/react-native-drax.svg)](https://badge.fury.io/js/react-native-drax)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE-OF-CONDUCT.md)

[Docs](https://nuclearpasta.com/react-native-drax) | [Live Example](https://nuclearpasta.com/react-native-drax/example)

## Overview

Drax is a declarative drag-and-drop framework for React Native, written in TypeScript. It supports free-form drag-and-drop, sortable lists and grids, cross-container drag (kanban boards), drag handles, collision algorithms, and more.

Built on [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) and [Gesture Handler 3](https://docs.swmansion.com/react-native-gesture-handler/) with a UI-thread-first architecture for smooth 60fps interactions.

**Platforms:** iOS, Android, Web

### Highlights

- **List-agnostic sortable** — works with FlatList, FlashList, LegendList, or any list component
- **Cross-container drag** — move items between lists (kanban boards)
- **UI-thread hit-testing** — spatial index worklet for fast receiver detection
- **Drag handles** — only the handle starts a drag, the rest scrolls
- **Collision algorithms** — center, intersect, or contain
- **Drag bounds** — constrain drags within a view
- **Hover styles** — conditional styles based on drag phase and receiver state
- **Drop zone acceptance** — accept or reject drops with `acceptsDrag`
- **Animation presets** — default, spring, gentle, snappy, none — or custom config
- **Snap alignment** — snap to 9-point alignment within receivers
- **Accessibility** — auto-generated labels, reduced motion support
- **19 callback events** — full drag lifecycle control
- **New Architecture** compatible (Fabric)

## Installation

```bash
npm install react-native-drax
# or
yarn add react-native-drax
```

### Peer Dependencies

```bash
npm install react-native-reanimated react-native-gesture-handler
```

| Peer Dependency | Version |
|---|---|
| `react` | >= 18 |
| `react-native` | >= 0.68 |
| `react-native-reanimated` | ^4.0.0 |
| `react-native-gesture-handler` | >= 2.0.0 (v3 recommended) |

## Quick Start

### Basic Drag-and-Drop

```tsx
import { DraxProvider, DraxView } from 'react-native-drax';

function App() {
  return (
    <DraxProvider>
      <DraxView
        style={{ width: 100, height: 100, backgroundColor: 'blue' }}
        onDragStart={() => console.log('dragging')}
        payload="hello"
      />
      <DraxView
        style={{ width: 100, height: 100, backgroundColor: 'green' }}
        onReceiveDragDrop={({ dragged: { payload } }) => {
          console.log(`received: ${payload}`);
        }}
      />
    </DraxProvider>
  );
}
```

### Sortable List

The simplest way to make a reorderable list:

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';

function App() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D', 'E']);

  return (
    <DraxProvider>
      <DraxList
        data={items}
        keyExtractor={(item) => item}
        onReorder={({ data }) => setItems(data)}
        renderItem={({ item }) => (
          <View style={{ padding: 16, backgroundColor: '#eee', margin: 4 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </DraxProvider>
  );
}
```

`DraxList` is list-agnostic — pass any list component via the `component` prop:

```tsx
import { FlashList } from '@shopify/flash-list';

<DraxList
  component={FlashList}
  data={items}
  keyExtractor={(item) => item.id}
  onReorder={({ data }) => setItems(data)}
  renderItem={({ item }) => <ItemCard item={item} />}
  estimatedItemSize={60}
/>
```

### Composable API

For full control, use the composable primitives directly:

```tsx
import {
  DraxProvider,
  useSortableList,
  SortableContainer,
  SortableItem,
} from 'react-native-drax';
import { FlatList } from 'react-native';

function App() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D', 'E']);
  const listRef = useRef<FlatList>(null);

  const sortable = useSortableList({
    data: items,
    keyExtractor: (item) => item,
    onReorder: ({ data }) => setItems(data),
  });

  return (
    <DraxProvider>
      <SortableContainer sortable={sortable} scrollRef={listRef}>
        <FlatList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          renderItem={({ item, index }) => (
            <SortableItem sortable={sortable} index={index}>
              <Text>{item}</Text>
            </SortableItem>
          )}
        />
      </SortableContainer>
    </DraxProvider>
  );
}
```

This pattern works with any list component — FlatList, FlashList, LegendList, ScrollView, etc.

## Features

### Drag Handles

Only the handle area starts a drag — the rest of the view scrolls normally:

```tsx
import { DraxView, DraxHandle } from 'react-native-drax';

<DraxView dragHandle>
  <Text>This content scrolls normally</Text>
  <DraxHandle>
    <GripIcon />  {/* Only this starts a drag */}
  </DraxHandle>
</DraxView>
```

### Drag Bounds

Constrain a dragged view within a boundary:

```tsx
const boundsRef = useRef<View>(null);

<View ref={boundsRef} style={{ flex: 1 }}>
  <DraxView dragBoundsRef={boundsRef}>
    <Text>I can only be dragged within the parent</Text>
  </DraxView>
</View>
```

### Collision Algorithms

Control how receiver detection works:

```tsx
<DraxView collisionAlgorithm="center" />   {/* hover center inside receiver (default) */}
<DraxView collisionAlgorithm="intersect" /> {/* any overlap triggers receiving */}
<DraxView collisionAlgorithm="contain" />   {/* dragged view must be fully inside */}
```

### Drop Zone Acceptance

Accept or reject drops conditionally:

```tsx
<DraxView
  acceptsDrag={(draggedPayload) => items.length < 5}
  onReceiveDragDrop={({ dragged }) => addItem(dragged.payload)}
/>
```

### Hover Styles

Style the hover layer based on drag state:

```tsx
<DraxView
  hoverStyle={{ opacity: 0.8 }}
  hoverDraggingWithReceiverStyle={{ borderColor: 'green', borderWidth: 2 }}
  hoverDraggingWithoutReceiverStyle={{ opacity: 0.5 }}
  hoverDragReleasedStyle={{ opacity: 0.3 }}
/>
```

### Snap Alignment

Snap dropped items to specific positions within a receiver:

```tsx
import { snapToAlignment } from 'react-native-drax';

<DraxView
  onReceiveDragDrop={({ dragged, receiver }) =>
    snapToAlignment(receiver, dragged, 'top-left', { x: 8, y: 8 })
  }
/>
```

Alignments: `center`, `top-left`, `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`

### Animation Presets

```tsx
<DraxList animationConfig="spring" />  {/* spring physics */}
<DraxList animationConfig="gentle" />  {/* soft spring */}
<DraxList animationConfig="snappy" />  {/* fast spring */}
<DraxList animationConfig="none" />    {/* instant */}

{/* Or custom: */}
<DraxList animationConfig={{
  useSpring: true,
  springDamping: 15,
  springStiffness: 150,
  springMass: 1,
}} />
```

Device reduced motion settings are respected automatically.

### Continuous Drag Callbacks

```tsx
<DraxView
  onDrag={(data) => { /* fires every frame while dragging over empty space */ }}
  onDragOver={(data) => { /* fires every frame while over the same receiver */ }}
/>
```

### Cross-Container Sortable (Experimental)

Move items between lists (kanban board pattern):

```tsx
import {
  useSortableBoard,
  SortableBoardContainer,
  useSortableList,
  SortableContainer,
  SortableItem,
} from 'react-native-drax';

const board = useSortableBoard({
  onTransfer: ({ fromColumnId, toColumnId, fromIndex, toIndex, item }) => {
    // Move item between columns
  },
});

<SortableBoardContainer board={board}>
  {columns.map((column) => (
    <Column key={column.id} board={board} column={column} />
  ))}
</SortableBoardContainer>
```

> **Note:** Cross-container drag is experimental. The API may change in future versions.

### Namespace API

For convenience, all components are available under the `Drax` namespace:

```tsx
import { Drax } from 'react-native-drax';

<Drax.Provider>
  <Drax.View draggable>
    <Drax.Handle><GripIcon /></Drax.Handle>
  </Drax.View>
</Drax.Provider>
```

## Components

| Component | Description |
|---|---|
| `DraxProvider` | Context provider — wrap your app's drag-and-drop area |
| `DraxView` | Draggable and/or receptive view with 19 callback events |
| `DraxList` | List-agnostic sortable list (convenience wrapper) |
| `DraxHandle` | Drag handle — only this area starts a drag |
| `DraxScrollView` | Scrollable container with auto-scroll during drag |
| `SortableContainer` | Monitoring wrapper for composable sortable API |
| `SortableItem` | Per-item wrapper with shift animation |
| `SortableBoardContainer` | Cross-container board coordinator (experimental) |

## Hooks

| Hook | Description |
|---|---|
| `useSortableList` | List-agnostic reorder state management |
| `useSortableBoard` | Cross-container board coordinator (experimental) |
| `useDraxContext` | Access the Drax context |
| `useDraxId` | Generate a unique Drax view ID |

## Examples

The `example/` directory contains an Expo Router app with 10 screens demonstrating all features:

| Screen | Features shown |
|---|---|
| Color Drag & Drop | Drop acceptance, hover styles, snap alignment |
| Reorderable List | DraxList, animation presets, auto-scroll |
| Reorderable Grid | Sortable grid with multi-column layout |
| Drag Handles | Only the grip icon starts a drag |
| Drag Bounds | Constrain drag within a view |
| Collision Modes | Center vs Intersect vs Contain |
| Kanban Board | Cross-container drag between columns (experimental) |
| Knight Moves | Chess knight drag puzzle |
| Scrolling | Drag from scroll view to drop zone |
| Stress Test | 100 items in a sortable list |

To run the example app:

```bash
cd example && yarn start
```

## Migration from v0.x

v1.0.0 is a complete rewrite. Key changes:

- **`DraxList` is new** — list-agnostic convenience wrapper using the new sortable architecture. The old `DraxList` / `DraxListItem` API from v0.10.x and v0.11.0-alpha is removed.
- **New sortable architecture** — `useSortableList` + `SortableContainer` + `SortableItem` composable API replaces the old array-indexed approach.
- **Reanimated 4 + Gesture Handler 3** — required peer dependencies (Gesture Handler v2 supported via compat layer with reduced performance).
- **New Architecture (Fabric)** compatible.

## Contributing

Issues, pull requests, and discussion are all welcome. See the [Contribution Guidelines](CONTRIBUTING.md) for details.

## Code of Conduct

This project is released with a [Contributor Code of Conduct](CODE-OF-CONDUCT.md). By participating in this project you agree to abide by its terms.

## License

[MIT](LICENSE.md)

## Acknowledgments

Originally created by [Joe Lafiosca](https://github.com/lafiosca). v1.0.0 rewrite by the Drax contributors.
