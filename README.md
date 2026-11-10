# react-native-drax


[![React Native CLI](https://img.shields.io/badge/-React%20Native%20CLI-282C34?style=flat-square&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Expo CLI](https://img.shields.io/badge/-Expo%20CLI-282C34?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS%20%7C%20Web-brightgreen.svg?style=flat-square&colorB=191A17)](https://necolas.github.io/react-native-web/)
[![GitHub top language](https://img.shields.io/github/languages/top/nuclearpasta/react-native-drax?style=flat-square)](https://github.com/nuclearpasta/react-native-drax/search?l=typescript)
[![CI](https://github.com/nuclearpasta/react-native-drax/actions/workflows/ci.yml/badge.svg)](https://github.com/nuclearpasta/react-native-drax/actions/workflows/ci.yml)
[![GitHub license](https://img.shields.io/github/license/nuclearpasta/react-native-drax?style=flat-square)](https://github.com/nuclearpasta/react-native-drax/blob/main/LICENSE.md)
[![npm version](https://img.shields.io/npm/v/react-native-drax?style=flat-square)](https://www.npmjs.com/package/react-native-drax)



📚 [**Visit the official documentation**](https://nuclearpasta.com/react-native-drax)

🎮 [**See the live example**](https://nuclearpasta.com/react-native-drax/example)

## 📖 Overview

Drax is a declarative drag-and-drop framework for React Native, written in TypeScript. It supports free-form drag-and-drop, sortable lists and grids, cross-list reorder, drag handles, collision algorithms, and more.

Built on [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) and [Gesture Handler 3](https://docs.swmansion.com/react-native-gesture-handler/) (v2 also supported) with a UI-thread-first architecture for smooth 60fps interactions.

**Platforms:** iOS, Android, Web

**Supports (1.2):** Expo 54-58 (tested on 58; 54-57 by peer ranges), or bare React Native >= 0.78 with the New Architecture · React >= 19 · Reanimated 4 + `react-native-worklets` · Gesture Handler >= 2. See [Peer Dependencies](#-peer-dependencies).

### ✨ Highlights

- 📋 **List-agnostic sortable** — works with FlatList, FlashList, LegendList, or any list component
- 🔀 **Cross-container drag** — move items between lists (cross-list reorder)
- ⚡ **UI-thread hit-testing** — spatial index worklet for fast receiver detection
- ✊ **Drag handles** — only the handle starts a drag, the rest scrolls
- 💥 **Collision algorithms** — center, intersect, or contain
- 📐 **Drag bounds** — constrain drags within a view
- 🎨 **Hover styles** — conditional styles based on drag phase and receiver state
- 🚫 **Drop zone acceptance** — accept or reject drops with `acceptsDrag`
- 🎬 **Animation presets** — default, spring, gentle, snappy, none — or custom config
- 🧲 **Snap alignment** — snap to 9-point alignment within receivers
- ♿ **Accessibility** — auto-generated labels, reduced motion support
- 📡 **19 callback events** — full drag lifecycle control
- 🏗️ **New Architecture** compatible (Fabric)

### 🤔 Why Drax?

| Feature | Drax | reanimated-dnd | sortables |
|---|:---:|:---:|:---:|
| Free-form drag & drop | ✅ | ✅ | ➖ |
| Sortable list / grid | ✅ | ✅ | ✅ |
| Mixed-size grid (non-uniform spans) | ✅ | ➖ | ➖ |
| Cross-container / cross-list reorder | ⚠️ Experimental | ➖ | ➖ |
| List-agnostic (FlatList, FlashList, LegendList) | ✅ | ➖ | ➖ |
| Drag handles | ✅ | ✅ | ✅ |
| Drag state styling | 15 props + inactive | onStateChange | 5 props + hook |
| Drop indicator | ✅ | ➖ | Grid only |
| UI-thread DnD collision | ✅ | ➖ | ➖ |
| Event callbacks | 19 types | ~12 types | ~10 types |
| Accessibility + reduced motion | ✅ | Manual | Manual |
| Web support | ✅ | ➖ | Partial |
| Reanimated | ≥ 4 | ≥ 4.2 | ≥ 3 |
| Gesture Handler | ≥ 2 | ≥ 2.28 | ≥ 2 |

[See full comparison →](https://nuclearpasta.com/react-native-drax#comparison)

## 📦 Installation

```bash
npm install react-native-drax
# or
yarn add react-native-drax
```

### 🔗 Peer Dependencies

`react-native-worklets` is required by Reanimated 4, so install it alongside Reanimated:

```bash
npm install react-native-reanimated react-native-worklets react-native-gesture-handler
```

| Peer Dependency | Version |
|---|---|
| `react` | >= 19.0.0 |
| `react-native` | >= 0.78.0 (New Architecture) |
| `react-native-reanimated` | ^4.0.0 |
| `react-native-gesture-handler` | >= 2.0.0 (v3 recommended) |
| `react-native-worklets` | >= 0.3.0 (optional peer; required by Reanimated 4) |

Drax 1.2 supports Expo SDK 54-58. It is tested on SDK 58; SDK 54-57 are covered by the peer ranges but not tested. On SDK 54-57, `npx expo install` picks react-native-gesture-handler 2.x (2.28 to 2.32), which Drax supports (peer `>=2.0.0`). Each of those SDKs ships React Native >= 0.81 with the New Architecture, Reanimated 4 and `react-native-worklets`, so `npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler` picks compatible versions. Outside Expo, use React Native >= 0.78 with the New Architecture enabled.

Drax imports from `react-native-worklets` directly, so it is listed as an optional peer (`>=0.3.0`, the same range Reanimated 4.0.0 declares); it is optional only because Reanimated 4 already requires it. Install the version matching your Reanimated release (see the [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)). Reanimated 4 also requires the New Architecture. Gesture Handler v2 and v3 both work; v3 is recommended, and v2 is supported via a compatibility layer with reduced performance.

### 🌳 Gesture Handler root view

Gesture Handler only recognizes gestures under a `GestureHandlerRootView`, so wrap your app root in one, with `DraxProvider` inside it:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider } from 'react-native-drax';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DraxProvider>{/* your app */}</DraxProvider>
    </GestureHandlerRootView>
  );
}
```

**Inside a React Native `Modal`:** the modal's content renders outside the app root's `GestureHandlerRootView`. Gesture Handler's setup docs list this under Android: modal content needs its own `GestureHandlerRootView`. Put the `DraxProvider` inside that root view too, so drags and their hover views stay in the modal. A `DraxProvider` outside the `Modal` has been reported to draw hover views behind the modal's content ([issue #69](https://github.com/nuclearpasta/react-native-drax/issues/69)). iOS behavior without the extra root view hasn't been verified, so wrap the modal content on every platform:

```tsx
import { Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraxProvider, DraxView } from 'react-native-drax';

<Modal visible={visible} onRequestClose={close}>
  <GestureHandlerRootView style={{ flex: 1 }}>
    <DraxProvider>
      <DraxView payload="card" />
    </DraxProvider>
  </GestureHandlerRootView>
</Modal>
```

## 🚀 Quick Start

### 👋 Basic Drag-and-Drop

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

### 📋 Sortable List

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

`DraxList` is list-agnostic — pass any list component via the `component` prop. Props that `DraxList` doesn't define are passed to that component:

```tsx
import { FlashList } from '@shopify/flash-list';

<DraxList
  component={FlashList}
  data={items}
  keyExtractor={(item) => item.id}
  onReorder={({ data }) => setItems(data)}
  renderItem={({ item }) => <ItemCard item={item} />}
/>
```

### 🧱 Composable API

For full control, use the composable primitives directly:

```tsx
import { useRef, useState } from 'react';
import { FlatList, Text } from 'react-native';
import {
  DraxProvider,
  useSortableList,
  SortableContainer,
  SortableItem,
} from 'react-native-drax';

function App() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D', 'E']);
  const listRef = useRef<FlatList<string>>(null);

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

## 🎛 Features

### ✊ Drag Handles

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

### 📐 Drag Bounds

Constrain a dragged view within a boundary:

```tsx
const boundsRef = useRef<View>(null);

<View ref={boundsRef} style={{ flex: 1 }}>
  <DraxView dragBoundsRef={boundsRef}>
    <Text>I can only be dragged within the parent</Text>
  </DraxView>
</View>
```

### 💥 Collision Algorithms

Control how receiver detection works:

```tsx
<DraxView collisionAlgorithm="center" />   {/* hover center inside receiver (default) */}
<DraxView collisionAlgorithm="intersect" /> {/* any overlap triggers receiving */}
<DraxView collisionAlgorithm="contain" />   {/* dragged view must be fully inside */}
```

### 🚫 Drop Zone Acceptance

Accept or reject drops conditionally:

```tsx
<DraxView
  acceptsDrag={(draggedPayload) => items.length < 5}
  onReceiveDragDrop={({ dragged }) => addItem(dragged.payload)}
/>
```

### 🎨 Hover Styles

Style the hover layer based on drag state:

```tsx
<DraxView
  hoverStyle={{ opacity: 0.8 }}
  hoverDraggingWithReceiverStyle={{ borderColor: 'green', borderWidth: 2 }}
  hoverDraggingWithoutReceiverStyle={{ opacity: 0.5 }}
  hoverDragReleasedStyle={{ opacity: 0.3 }}
/>
```

### 🧲 Snap Alignment

Snap dropped items to specific positions within a receiver:

```tsx
import { snapToAlignment } from 'react-native-drax';

<DraxView
  onReceiveDragDrop={({ dragged, receiver }) =>
    receiver.measurements
      ? snapToAlignment(receiver.measurements, dragged.measurements, 'top-left', { x: 8, y: 8 })
      : undefined
  }
/>
```

Alignments: `center`, `top-left`, `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`

### 🎬 Animation Presets

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

### 📡 Continuous Drag Callbacks

```tsx
<DraxView
  onDrag={(data) => { /* fires every frame while dragging over empty space */ }}
  onDragOver={(data) => { /* fires every frame while over the same receiver */ }}
/>
```

### 🔀 Cross-Container Sortable (Experimental)

Move items between lists (cross-list reorder). Each `SortableContainer` inside a `SortableBoardContainer` registers itself as a column, under the `id` you pass to its `useSortableList`:

```tsx
import { useRef, useState } from 'react';
import { FlatList, Text } from 'react-native';
import {
  DraxProvider,
  useSortableBoard,
  SortableBoardContainer,
  useSortableList,
  SortableContainer,
  SortableItem,
} from 'react-native-drax';

type Card = { id: string; title: string };
type Columns = Record<string, Card[]>;

function Board() {
  const [columns, setColumns] = useState<Columns>({
    todo: [{ id: '1', title: 'Write tests' }],
    done: [{ id: '2', title: 'Setup project' }],
  });

  const board = useSortableBoard<Card>({
    keyExtractor: (card) => card.id, // required
    onTransfer: ({ item, fromContainerId, toContainerId, toIndex }) => {
      setColumns((prev) => {
        const from = (prev[fromContainerId] ?? []).filter((c) => c.id !== item.id);
        const to = [...(prev[toContainerId] ?? [])];
        to.splice(toIndex, 0, item);
        return { ...prev, [fromContainerId]: from, [toContainerId]: to };
      });
    },
  });

  return (
    <DraxProvider>
      <SortableBoardContainer board={board}>
        {Object.entries(columns).map(([columnId, cards]) => (
          <Column
            key={columnId}
            columnId={columnId}
            cards={cards}
            onReorder={(data) => setColumns((prev) => ({ ...prev, [columnId]: data }))}
          />
        ))}
      </SortableBoardContainer>
    </DraxProvider>
  );
}

function Column({ columnId, cards, onReorder }: {
  columnId: string;
  cards: Card[];
  onReorder: (data: Card[]) => void;
}) {
  const listRef = useRef<FlatList<Card>>(null);
  const sortable = useSortableList({
    id: columnId, // becomes fromContainerId / toContainerId in onTransfer
    data: cards,
    keyExtractor: (card) => card.id,
    onReorder: ({ data }) => onReorder(data),
  });

  return (
    <SortableContainer sortable={sortable} scrollRef={listRef}>
      <FlatList
        ref={listRef}
        data={sortable.data}
        keyExtractor={sortable.stableKeyExtractor}
        onScroll={sortable.onScroll}
        onContentSizeChange={sortable.onContentSizeChange}
        renderItem={({ item, index }) => (
          <SortableItem sortable={sortable} index={index}>
            <Text>{item.title}</Text>
          </SortableItem>
        )}
      />
    </SortableContainer>
  );
}
```

> **Note:** Cross-container drag is experimental. The API may change in future versions.

### 🏷️ Namespace API

For convenience, all components are available under the `Drax` namespace:

```tsx
import { Drax } from 'react-native-drax';

<Drax.Provider>
  <Drax.View draggable>
    <Drax.Handle><GripIcon /></Drax.Handle>
  </Drax.View>
</Drax.Provider>
```

## 🧩 Components

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

## 🪝 Hooks

| Hook | Description |
|---|---|
| `useSortableList` | List-agnostic reorder state management |
| `useSortableBoard` | Cross-container board coordinator (experimental) |
| `useItemContext` | Per-item state inside a `SortableItem` (`isActive`, `activeItemId`, `itemKey`, `index`) |
| `useDraxMethods` | Imperative helpers: `requestPositionUpdate`, `isDragging`, `getDraggedId`, `getDroppedItems`, `clearDroppedItems` |
| `useDraxContext` | Access the Drax context (low-level; its shape is internal) |
| `useDraxId` | Generate a unique Drax view ID |

## 🧰 Utilities

| Utility | Description |
|---|---|
| `snapToAlignment` | Compute a snap target at one of 9 alignment points inside a receiver |
| `packGrid` | Bin-pack mixed-size items into a grid (use with `getItemSpan`) |

## 💡 Examples

The `example/` directory contains an Expo Router app with 11 screens demonstrating all features:

| Screen | Features shown |
|---|---|
| Color Drag & Drop | Drop acceptance, hover styles, snap alignment |
| Reorderable List | DraxList, animation presets, auto-scroll |
| Reorderable Grid | Sortable grid with multi-column layout |
| Mixed-Size Grid | Items with different spans (1×1, 2×2, etc.) using `getItemSpan` and `packGrid` |
| Drag Handles | Only the grip icon starts a drag |
| Drag Bounds | Constrain drag within a view |
| Collision Modes | Center vs Intersect vs Contain |
| Cross-List Reorder | FlashList + LegendList + FlatList cross-container drag (experimental) |
| Knight Moves | Chess knight drag puzzle |
| Scrolling | Drag from scroll view to drop zone |
| Stress Test | 100 items in a sortable list |

To run it:

```bash
yarn install
yarn example start
```

## 🔄 Migration from v0.x

1.x (since 1.0.0) is a complete rewrite. Key changes:

- **`DraxList` is new** — list-agnostic convenience wrapper using the new sortable architecture. The old `DraxList` / `DraxListItem` API from v0.10.x and v0.11.0-alpha is removed.
- **New sortable architecture** — `useSortableList` + `SortableContainer` + `SortableItem` composable API replaces the old array-indexed approach.
- **Reanimated 4 + Gesture Handler** — required peer dependencies (Reanimated 4 also needs `react-native-worklets`). Gesture Handler v2 and v3 both work; v3 is recommended, v2 is supported via a compat layer with reduced performance. See [Peer Dependencies](#-peer-dependencies) for exact ranges.
- **New Architecture (Fabric)** compatible.

For a step-by-step guide with before/after code (including the `0.11.0-alpha` `DraxList` / `DraxListItem` API), see [MIGRATION.md](MIGRATION.md).

Coming from 1.0 or 1.1: 1.2 makes no breaking changes to the documented API. The declared peer ranges were raised to match what 1.x already needed at runtime (React >= 19, React Native >= 0.78), and `react-native-worklets` is now declared as an optional peer. A drag cancelled by the system (for example, the app going to the background) no longer counts as a drop. A receiver under a cancelled drag now gets `onReceiveDragExit` with `cancelled: true`. See [CHANGELOG.md](CHANGELOG.md).

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full list of changes.

## 🤝 Contributing

Issues, pull requests, and discussion are all welcome. See the [Contribution Guidelines](CONTRIBUTING.md) for details.

## 📜 Code of Conduct

This project is released with a [Contributor Code of Conduct](CODE-OF-CONDUCT.md). By participating in this project you agree to abide by its terms.

## 🏆 Contributors

Originally created by [Joe Lafiosca](https://github.com/lafiosca). v1.0.0 rewrite led by [Ovidiu Cristescu](https://github.com/LunatiqueCoder).

Thanks to all contributors who have helped make Drax better:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lafiosca"><img src="https://avatars.githubusercontent.com/u/9442662?v=4" width="100px;" alt="Joe Lafiosca"/><br /><sub><b>Joe Lafiosca</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=lafiosca" title="Code">💻</a> <a href="https://github.com/nuclearpasta/react-native-drax/commits?author=lafiosca" title="Documentation">📖</a> <a href="#example-lafiosca" title="Examples">💡</a> <a href="#maintenance-lafiosca" title="Maintenance">🚧</a> <a href="#infra-lafiosca" title="Infrastructure">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/LunatiqueCoder"><img src="https://avatars.githubusercontent.com/u/55203625?v=4" width="100px;" alt="Ovidiu Cristescu"/><br /><sub><b>Ovidiu Cristescu</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=LunatiqueCoder" title="Code">💻</a> <a href="https://github.com/nuclearpasta/react-native-drax/commits?author=LunatiqueCoder" title="Documentation">📖</a> <a href="#example-LunatiqueCoder" title="Examples">💡</a> <a href="#maintenance-LunatiqueCoder" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Auticiel"><img src="https://avatars.githubusercontent.com/u/8429221?v=4" width="100px;" alt="François Dupayrat"/><br /><sub><b>François Dupayrat</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=Auticiel" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jmarnold"><img src="https://avatars.githubusercontent.com/u/181667?v=4" width="100px;" alt="Josh Arnold"/><br /><sub><b>Josh Arnold</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=jmarnold" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/rnz269"><img src="https://avatars.githubusercontent.com/u/20953181?v=4" width="100px;" alt="Rahul Nallappa"/><br /><sub><b>Rahul Nallappa</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=rnz269" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/negue"><img src="https://avatars.githubusercontent.com/u/842273?v=4" width="100px;" alt="negue"/><br /><sub><b>negue</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=negue" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/chrisdrackett"><img src="https://avatars.githubusercontent.com/u/4378?v=4" width="100px;" alt="Chris Drackett"/><br /><sub><b>Chris Drackett</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=chrisdrackett" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sturdynut"><img src="https://avatars.githubusercontent.com/u/8547391?v=4" width="100px;" alt="Matti Salokangas"/><br /><sub><b>Matti Salokangas</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=sturdynut" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/afgarcia86"><img src="https://avatars.githubusercontent.com/u/3606053?v=4" width="100px;" alt="Andres Garcia"/><br /><sub><b>Andres Garcia</b></sub></a><br /><a href="https://github.com/nuclearpasta/react-native-drax/commits?author=afgarcia86" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## 📃 License

[MIT](LICENSE.md)

---

Built and maintained using [OpenKit](https://www.openkit.work/).
