# Migrating from 0.11.x to 1.2

This guide covers moving an app from `react-native-drax@0.11.0-alpha.x` (the
Reanimated 3 alpha line) to `react-native-drax@1.2`. Version 1.0.0 was a full
rewrite, so most of the work is in the list API and in event data. `DraxView`
callbacks and style props mostly carry over unchanged.

Every 1.2 API named here is exported from `react-native-drax`. Type names and
fields match `src/types.ts`, `src/DraxList.tsx` and `src/SortableItem.tsx` in
1.2. The 0.11 names match the published `0.11.0-alpha.2` type definitions.

Items marked **No equivalent** have no 1.2 API that does the same thing. Each
one lists a workaround where one exists.

## Contents

- [1. Dependencies](#1-dependencies)
- [2. Provider and imports](#2-provider-and-imports)
- [3. DraxList](#3-draxlist)
- [4. List callbacks](#4-list-callbacks)
- [5. Event data](#5-event-data)
- [6. Hover views and measurements](#6-hover-views-and-measurements)
- [7. Behavior changes](#7-behavior-changes)
- [8. Quick reference](#8-quick-reference)

## 1. Dependencies

| Package | 0.11.0-alpha.2 peer range | 1.2 peer range |
|---|---|---|
| `react` | `*` | `>=19.0.0` |
| `react-native` | `>=0.65.0` | `>=0.78.0` (New Architecture required) |
| `react-native-gesture-handler` | `>=1.8.0` | `>=2.0.0` (v3 recommended) |
| `react-native-reanimated` | not declared (alpha built against `^3.15.5`) | `^4.0.0` |
| `react-native-worklets` | not used | `>=0.3.0` (optional peer, required by Reanimated 4) |

What to do:

1. Upgrade to React 19 and React Native 0.78 or later with the New Architecture
   enabled. 1.2 calls React 19's `use()` and will not run on React 18.
2. Upgrade Reanimated to 4.x and install the `react-native-worklets` version
   that matches it (see the
   [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)).
   Follow Reanimated 4's own migration guide for your app code. In particular,
   the Babel plugin is now `react-native-worklets/plugin`. Expo's
   `babel-preset-expo` adds it for you.
3. Gesture Handler 2.x still works through a compatibility layer. 3.x is
   recommended and uses a faster path. Drax detects the version at runtime, so
   you don't need to configure anything.
4. Remove `lodash.isequal`, `lodash.throttle` and `typesafe-actions` if you only
   had them because of Drax. 1.2 has no runtime dependencies.

## 2. Provider and imports

`DraxProvider` is used the same way. Keep your `GestureHandlerRootView` above it.

```tsx
// 0.11 and 1.2
<GestureHandlerRootView style={{ flex: 1 }}>
  <DraxProvider>{/* ... */}</DraxProvider>
</GestureHandlerRootView>
```

`DraxProviderProps` now also accepts `onDragStart`, `onDrag` and `onDragEnd`,
which fire for every drag under the provider and receive
`DraxProviderDragEvent` (`{ draggedId, receiverId?, position }`).

### Removed exports

The package now has an `exports` map, so deep imports such as
`react-native-drax/build/...` no longer resolve. Import everything from
`react-native-drax`.

These 0.11 exports no longer exist:

| 0.11 export | 1.2 |
|---|---|
| `DraxListItem` | Removed. Use `SortableItem` (see [3.4](#34-draxlistitem--sortableitem)). |
| `DraxSubprovider`, `DraxContext` | Not exported. Nesting is handled by `isParent` / `parent` on `DraxView`, and by `DraxScrollView` and `SortableContainer`. |
| `useDraxRegistry`, `useDraxState` | Removed. |
| `DraxProtocol`, `DraxProtocolProps` | Removed. All callback props are declared directly on `DraxViewProps`. |
| `DraxListProps` (old), `DraxListItemProps`, `DraxListOnItemReorder`, `DraxListOnItemReorderEventData`, `DraxListOnItemDragStartEventData`, `DraxListOnItemDragPositionChangeEventData`, `DraxListOnItemDragEndEventData`, `DraxListDraggedItemData`, `DraxListRenderItemContent`, `DraxListRenderItemHoverContent` | Removed. Use `DraxListProps<T>` (new), `SortableReorderEvent<T>`, `SortableDragStartEvent<T>`, `SortableDragPositionChangeEvent<T>`, `SortableDragEndEvent<T>`. |
| `DraxAbsoluteViewData`, `DraxViewData`, `DraxFoundAbsoluteViewEntry`, `DraxTrackingDrag`, `DraxTrackingReceiver`, `DraxRegistry`, `DraxState`, the `*Payload` action types, `TSDraxtyles` | Removed (internal). For styles use `DraxStyleProp`. |
| `DraxParentView`, `DraxViewRegistration`, `DraxViewMeasurementHandler`, `DraxProtocolDragEndResponse`, `WithCancelledFlag`, `isWithCancelledFlag`, `DraxContextValue` | Still declared in `src/types.ts` but no longer exported from the package. If you need them, derive them, for example `NonNullable<DraxViewProps['parent']>` or `ReturnType<NonNullable<DraxViewProps['onDragEnd']>>`. |

`useDraxContext()` is still exported, but it returns a different, internal shape
built on shared values. It no longer has `getViewState`, `getTrackingStatus`,
`registerView` with the old payloads, `updateViewMeasurements` or
`updateHoverViewMeasurements`. For supported imperative calls use
`useDraxMethods()`: `requestPositionUpdate`, `isDragging`, `getDraggedId`,
`getDroppedItems`, `clearDroppedItems`.

## 3. DraxList

`DraxList` is a new component with the same name. It wraps `useSortableList` +
`SortableContainer` + `SortableItem` around any list component (`FlatList` by
default, or FlashList or LegendList through `component`). It wraps each row in a
`SortableItem` for you, so `renderItem` returns only the row content.

### 3.1 Basic list

Before (0.11):

```tsx
import { DraxList, DraxListItem } from 'react-native-drax';

<DraxList
  data={items}
  keyExtractor={(item) => item.id}
  style={styles.list}
  parentDraxViewProps={{ style: styles.container }}
  renderItem={(info, itemProps) => (
    <DraxListItem
      itemProps={itemProps}
      style={styles.item}
      draggingStyle={styles.itemDragging}
    >
      <Text>{info.item.label}</Text>
    </DraxListItem>
  )}
  onItemReorder={({ fromIndex, toIndex }) => {
    const next = [...items];
    next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
    setItems(next);
  }}
/>
```

After (1.2):

```tsx
import { DraxList } from 'react-native-drax';

<DraxList
  data={items}
  keyExtractor={(item) => item.id}   // required
  style={styles.list}                // applied to the list component
  containerStyle={styles.container}  // applied to the wrapping DraxView
  itemDraxViewProps={{ style: styles.item, draggingStyle: styles.itemDragging }}
  renderItem={({ item }) => <Text>{item.label}</Text>}
  onReorder={({ data }) => setItems(data)}  // required; `data` is already reordered
/>
```

### 3.2 Prop mapping

| 0.11 `DraxList` prop | 1.2 |
|---|---|
| `renderItem(info, itemProps)` | `renderItem(info)`. See [3.3](#33-renderitem-itemprops). |
| `onItemReorder` | `onReorder` (now required). See [4.1](#41-onitemreorder--onreorder). |
| `onItemDragStart` | `onDragStart`. See [4.2](#42-onitemdragstart--ondragstart). |
| `onItemDragPositionChange` | `onDragPositionChange`. See [4.3](#43-onitemdragpositionchange--ondragpositionchange). |
| `onItemDragEnd` | `onDragEnd`, which receives `SortableDragEndEvent<T>` (`{ index, item, toIndex, cancelled }`). |
| `parentDraxViewProps` | `containerDraxViewProps` (`Partial<DraxViewProps>`) for the wrapping `DraxView`. `containerStyle` is a shorthand for its style. |
| `parentDraxViewProps.id` | `id` |
| `monitoringExternalDragStyle` | **No equivalent.** See [3.5](#35-monitoringexternaldragstyle). |
| `lockItemDragsToMainAxis` | `lockToMainAxis` |
| `longPressDelay` | `longPressDelay` (default is still 250 ms) |
| `reorderable` | No prop. Lists are always reorderable. To lock rows, pass `itemDraxViewProps={{ draggable: false }}`, or use the composable API and `<SortableItem fixed>` for single rows. |
| `centerShift` | No prop. Slots are now chosen from the hover position. `reorderStrategy` (`'insert'` \| `'swap'`) controls how items move. |
| `keyExtractor` (optional) | `keyExtractor` (required) |
| Autoscroll props | See [3.6](#36-auto-scroll-props). Jump/threshold props since 1.x (1.0+); `autoScrollEnabled`, `autoScrollInitialDelay`, a real `autoScrollIntervalLength`, and `DraxList` forwarding are **from 1.2.0**. |
| Reanimated `FlatList` props (`itemLayoutAnimation`, etc.) | The default list is React Native's `FlatList`. Pass `component={Animated.FlatList}` to keep Reanimated list props, or use `itemEntering` / `itemExiting` for row enter and exit animations. |
| `data` items may not contain `index` / `originalIndex` keys | Same restriction in practice: `SortableItem` merges `{ index, originalIndex, item }` into the row payload. See [7](#7-behavior-changes). |

New props with no 0.11 counterpart: `component`, `reorderStrategy`,
`animationConfig`, `inactiveItemStyle`, `draggedItemStyle`, `itemEntering`,
`itemExiting`, `numColumns` (grids), and, on `useSortableList` only,
`getItemSpan`. Any other prop is passed to the list component.

While a row is dragged, its in-list placeholder gets `draggedItemStyle`
(default `{ opacity: 0 }`, so it is hidden). Pass `{ opacity: 0.2 }` for a
faint placeholder like in 0.11. As in 0.11, the placeholder stays at the slot
it was picked up from while the finger is down, and neighbours slide over it.
On release it moves to the target slot, where the hover lands. Use visual
props only (opacity, colors, transforms): layout props such as `borderWidth`,
`margin` or `padding` re-lay out the row mid-drag. Pass a stable style (a
constant or `StyleSheet.create`).

### 3.3 renderItem itemProps

In 0.11, `renderItem` received a second `itemProps` argument (`DraxListItemProps`)
that you had to pass to `DraxListItem`. It also gave you list internals:
`draggedItem`, `shiftsRef`, `itemMeasurementsRef`, `registrationsRef` and others.

1.2 has no second argument. `DraxList` renders the `SortableItem` for you.

| What you used `itemProps` for | 1.2 |
|---|---|
| Passing it to `DraxListItem` | Nothing to pass. Return only the row content. |
| `itemProps.index`, `itemProps.item` | `info.index`, `info.item` from `renderItem(info)` |
| `itemProps.originalIndex` | Not exposed. The row's payload carries it: `event.dragged.payload.originalIndex`. |
| `itemProps.draggedItem` (is this row dragged?) | `useItemContext().isActive` (a `SharedValue<boolean>`), called inside the row |
| `itemProps.horizontal`, `lockItemDragsToMainAxis` | Read your own props. They are list-level settings. |
| `shiftsRef`, `itemMeasurementsRef`, `prevItemMeasurementsRef`, `previousShiftsRef`, `registrationsRef`, `resetDraggedItem` | **No equivalent.** Now internal (`sortable._internal`, not a public contract). |
| Different `DraxView` props per row | `itemDraxViewProps` applies to every row. For per-row props, use the composable API and pass props to each `SortableItem`. |

Per-row props with the composable API:

```tsx
import {
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';

const listRef = useRef<FlatList<Item>>(null);
const sortable = useSortableList({
  data: items,
  keyExtractor: (item) => item.id,
  onReorder: ({ data }) => setItems(data),
});

<SortableContainer sortable={sortable} scrollRef={listRef}>
  <FlatList
    ref={listRef}
    data={sortable.data}
    keyExtractor={sortable.stableKeyExtractor}
    onScroll={sortable.onScroll}
    onContentSizeChange={sortable.onContentSizeChange}
    renderItem={({ item, index }) => (
      <SortableItem
        sortable={sortable}
        index={index}
        fixed={item.pinned}
        draggingStyle={item.pinned ? undefined : styles.itemDragging}
      >
        <Row item={item} />
      </SortableItem>
    )}
  />
</SortableContainer>
```

Reading "is this row dragged" inside a row:

```tsx
import { useItemContext } from 'react-native-drax';

function Row({ item }: { item: Item }) {
  const { isActive } = useItemContext();
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: isActive.value ? 1.05 : 1 }],
  }));
  return <Animated.View style={style}><Text>{item.label}</Text></Animated.View>;
}
```

### 3.4 DraxListItem → SortableItem

`DraxListItem` is gone. Its replacement is `SortableItem`
(`SortableItemProps extends DraxViewProps` plus `sortable`, `index`, `fixed`,
`children`). You only use it directly with the composable API. `DraxList` adds
it for you.

```tsx
// 0.11
<DraxListItem itemProps={itemProps} style={styles.item}>{children}</DraxListItem>

// 1.2 (composable API)
<SortableItem sortable={sortable} index={index} style={styles.item}>{children}</SortableItem>
```

### 3.5 monitoringExternalDragStyle

**No equivalent.** In 1.2, `DraxList` and `SortableContainer` have no prop that
styles the container while an item from outside the list hovers over it.

Workaround: the container is a monitoring `DraxView`, and
`containerDraxViewProps` callbacks reach it. `onMonitorDragEnter` is passed
through as is. `onMonitorDragExit`, `onMonitorDragEnd` and `onMonitorDragDrop`
are called after the list's own handling. Toggle React state from them. As in 0.11, "absolute" positions are relative to the
`DraxProvider` root view, not to the screen.

```tsx
const LIST_ID = 'my-list';
const [externalOver, setExternalOver] = useState(false);

<DraxList
  id={LIST_ID}
  containerStyle={[styles.container, externalOver && styles.externalHover]}
  containerDraxViewProps={{
    onMonitorDragEnter: ({ dragged }) => {
      if (dragged.parentId !== LIST_ID) setExternalOver(true);
    },
    onMonitorDragExit: () => setExternalOver(false),
    onMonitorDragEnd: () => { setExternalOver(false); },
    onMonitorDragDrop: () => { setExternalOver(false); },
  }}
  /* ... */
/>
```

This re-renders the container on every enter and exit, just as the 0.11 prop
did, which its docs described as "might be very expensive". This workaround
hasn't been tested on a device.

### 3.6 Auto-scroll props

`autoScrollJumpRatio`, `autoScrollBackThreshold` and
`autoScrollForwardThreshold` have been on `useSortableList` and
`DraxScrollView` since 1.x (shipped in 1.0, still in 1.1). The rest of
`DraxAutoScrollProps` is **from 1.2.0**: `autoScrollEnabled`,
`autoScrollInitialDelay`, a real `autoScrollIntervalLength`, and `DraxList`
forwarding.

| Prop | Type | Default | Since 1.x (1.0+) | From 1.2.0 |
|---|---|---|---|---|
| `autoScrollJumpRatio` | `number` | `0.2` | `useSortableList`, `DraxScrollView` | also `DraxList` |
| `autoScrollBackThreshold` | `number` | `0.1` | `useSortableList`, `DraxScrollView` | also `DraxList` |
| `autoScrollForwardThreshold` | `number` | `0.9` | `useSortableList`, `DraxScrollView` | also `DraxList` |
| `autoScrollEnabled` | `boolean` | `true` | — | `DraxList`, `useSortableList`, `DraxScrollView` |
| `autoScrollInitialDelay` | `number` (ms) | `0` | — | `DraxList`, `useSortableList`, `DraxScrollView` |
| `autoScrollIntervalLength` | `number` (ms) | `250` | typed on `DraxScrollView` but ignored (hardcoded 250) through 1.1 | honoured on `DraxList`, `useSortableList`, `DraxScrollView` |

From 1.2.0, `DraxListProps` and `UseSortableListOptions` extend
`DraxAutoScrollProps`, and `DraxList` forwards every auto-scroll prop into
`useSortableList`. Leaving the edge band resets `autoScrollInitialDelay`.
Because it defaults to `0`, autoscroll starts as soon as the drag enters
the edge band, as in 1.1. A dwell delay is opt-in: set
`autoScrollInitialDelay` (e.g. `300`) to wait that long in the band before
the first jump. Switching `autoScrollEnabled` to `false` mid-drag also stops
a scroll that is already running, at the next drag move.

```tsx
// from 1.2.0 — DraxList forwards DraxAutoScrollProps
<DraxList
  data={items}
  keyExtractor={(item) => item.id}
  onReorder={({ data }) => setItems(data)}
  renderItem={({ item }) => <Text>{item.label}</Text>}
  autoScrollEnabled
  autoScrollInitialDelay={150}
  autoScrollIntervalLength={200}
  autoScrollJumpRatio={0.25}
  autoScrollBackThreshold={0.15}
  autoScrollForwardThreshold={0.85}
/>

// composable API / plain scroll container (jump + thresholds since 1.x / 1.0+)
const sortable = useSortableList({
  data: items,
  keyExtractor: (item) => item.id,
  onReorder: ({ data }) => setItems(data),
  autoScrollEnabled: true,          // from 1.2.0
  autoScrollInitialDelay: 150,      // from 1.2.0
  autoScrollIntervalLength: 200,    // from 1.2.0 (honoured)
  autoScrollJumpRatio: 0.25,
  autoScrollBackThreshold: 0.15,
  autoScrollForwardThreshold: 0.85,
});

<DraxScrollView
  autoScrollEnabled
  autoScrollInitialDelay={150}
  autoScrollIntervalLength={200}
  autoScrollJumpRatio={0.25}
  autoScrollBackThreshold={0.15}
  autoScrollForwardThreshold={0.85}
>
  {children}
</DraxScrollView>
```

## 4. List callbacks

### 4.1 onItemReorder → onReorder

| | 0.11 `onItemReorder` | 1.2 `onReorder` |
|---|---|---|
| Required | no | yes |
| Event type | `DraxListOnItemReorderEventData<T>` | `SortableReorderEvent<T>` |
| Fields | `fromIndex`, `fromItem?`, `toIndex`, `toItem?`, `isExternalDrag` | `data: T[]` (reordered), `fromIndex`, `fromItem`, `toIndex`, `toItem`, `isExternalDrag` |
| When it fires | on release | after the release snap animation ends (then the list commits the new order) |

```tsx
// 0.11
onItemReorder={({ fromIndex, toIndex }) => {
  const next = [...items];
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
  setItems(next);
}}

// 1.2
onReorder={({ data }) => setItems(data)}
```

`isExternalDrag` is always `false` in 1.2. A single list no longer accepts
items dragged in from outside. For moving items between lists, see
[7](#7-behavior-changes).

### 4.2 onItemDragStart → onDragStart

| 0.11 `DraxListOnItemDragStartEventData<T>` | 1.2 `SortableDragStartEvent<T>` |
|---|---|
| `index`, `item?` | `index`, `item` |
| `isExternalDrag` | removed |
| all of `DraxDragEventData` (`dragAbsolutePosition`, `dragTranslation`, `dragged`) | removed |

```tsx
// 0.11
onItemDragStart={({ index, item, dragAbsolutePosition }) => { /* ... */ }}

// 1.2
onDragStart={({ index, item }) => { /* ... */ }}
```

If you need the drag position or the dragged view data, also attach the
`DraxView` callback to every row. It receives the full `DraxDragEventData`:

```tsx
itemDraxViewProps={{
  onDragStart: ({ dragAbsolutePosition, dragged }) => { /* ... */ },
}}
```

### 4.3 onItemDragPositionChange → onDragPositionChange

| 0.11 `DraxListOnItemDragPositionChangeEventData<T>` | 1.2 `SortableDragPositionChangeEvent<T>` |
|---|---|
| `index`, `item?`, `toIndex`, `previousIndex` | `index`, `item`, `toIndex`, `previousIndex` |
| `isExternalDrag` | removed |
| all of `DraxMonitorEventData` (`dragAbsolutePosition`, `dragTranslation`, `dragged`, `receiver?`, `monitorOffset`, `monitorOffsetRatio`) | removed |

```tsx
// 0.11
onItemDragPositionChange={({ index, toIndex, previousIndex, monitorOffsetRatio }) => { /* ... */ }}

// 1.2
onDragPositionChange={({ index, toIndex, previousIndex }) => { /* ... */ }}
```

It still fires only when the target slot changes, and it fires once more with
`toIndex: undefined` when the drag leaves the list. For per-frame monitor data
(`monitorOffset`, `monitorOffsetRatio`), use
`containerDraxViewProps.onMonitorDragOver`, which receives
`DraxMonitorEventData`.

## 5. Event data

The callback names on `DraxView` are the same as in 0.11 (`onDragStart`,
`onDrag`, `onDragEnter`, `onDragOver`, `onDragExit`, `onDragEnd`, `onDragDrop`,
`onSnapEnd`, `onReceive*`, `onMonitor*`). The shape of the view data inside
the events changed.

### 5.1 protocol.payload

In 0.11, every view in an event carried `data: DraxAbsoluteViewData`, and that
included the view's whole `protocol` (`data.protocol.payload`,
`data.protocol.dragPayload`, every callback, and so on). `onSnapEnd` and
`onReceiveSnapEnd` payloads had no top-level `payload` field, so you had to
read `dragged.data.protocol.payload`.

1.2 removes `data` and `protocol`. Each view has a single resolved `payload`:

- for the dragged view: `dragPayload ?? payload`
- for the receiver: `receiverPayload ?? payload`

```tsx
// 0.11
onReceiveDragDrop={({ dragged }) => handlePayload(dragged.data.protocol.payload)}
onSnapEnd={({ dragged, receiver }) => {
  handlePayload(dragged.data.protocol.payload, receiver?.data.protocol.payload);
}}

// 1.2
onReceiveDragDrop={({ dragged }) => handlePayload(dragged.payload)}
onSnapEnd={({ dragged, receiver }) => {
  // DraxSnapEndEventData: { dragged: { id, parentId?, payload }, receiver?: { id, parentId?, payload } }
  handlePayload(dragged.payload, receiver?.payload);
}}
```

`handlePayload` stands for your own code.

`payload` is now typed `unknown`, not `any`. Narrow it with a type guard or a
cast.

Other places that used `protocol`:

| 0.11 | 1.2 |
|---|---|
| `dragged.data.protocol.<callback or flag>` | **No equivalent.** Other views' props are not exposed in events. Keep what you need in the payload. |
| `viewState.data.protocol.payload` in `renderContent` | **No equivalent** on `DraxViewState`. Use the value from your render scope. You already pass it as `payload`. |
| `dynamicReceptiveCallback({ foundView, excludedView })` with `foundView.data.protocol.payload` | `dynamicReceptiveCallback({ targetId, targetMeasurements, draggedId, draggedPayload, draggedParentId? })`. `excludedView.parentId` is `draggedParentId` (**from 1.2.0**; not in earlier 1.x). The receiver's own payload is in your closure. For simple payload checks, use `acceptsDrag(draggedPayload)`. |

### 5.2 Event measurements

| 0.11 (on `dragged` / `receiver`) | 1.2 |
|---|---|
| `x.data.measurements` (relative to the Drax parent) | `x.measurements?: DraxViewMeasurements`. Same frame: relative to the Drax parent, or content-relative inside a scrollable parent. Optional. |
| `x.data.absoluteMeasurements` | **From 1.2.0** as `x.absoluteMeasurements?: DraxViewMeasurements` on both `dragged` and `receiver` (not in 1.0 / 1.1). Provider-root frame, same as `dragAbsolutePosition` / `hoverPosition`. On `dragged` it is the view's **layout** position, not the hover's. On `dragged` it is not set on every continuous event; see [5.4](#54-new-optional-event-fields-from-120). In earlier 1.x, derive from offsets — see below and [5.3](#53-dragabsoluteposition-at-drop). |
| `dragged.data.hoverMeasurements` | **From 1.2.0** as `dragged.hoverMeasurements?: DraxViewMeasurements`: `hoverPosition` plus the dragged view's measured size (default hover / hit-test size). A `renderHoverContent` of a different size is not measured. Set on the same events as `dragged.absoluteMeasurements` ([5.4](#54-new-optional-event-fields-from-120)). Not in earlier 1.x. See also [6.1](#61-updatehoverviewmeasurements). |
| `x.data.parentId`, `x.data.scrollPosition` | `x.parentId`. Scroll position is not exposed. |
| `onSnapEnd` grab offset | **From 1.2.0** as `dragged.grabOffset?: Position` on `DraxSnapEndEventData` (and `onReceiveSnapEnd`). Not top-level on the event. |

`DraxViewMeasurements` gained a numeric `_transformDetected` field (1 when the
view is positioned by transforms, as in LegendList). If you build
`DraxViewMeasurements` objects yourself, add `_transformDetected: 0`.

The offset fields on events are unchanged: `dragAbsolutePosition`,
`dragTranslation`, and on `dragged` `dragTranslationRatio`, `dragOffset`,
`grabOffset`, `grabOffsetRatio` and `hoverPosition`. On `receiver` they are
`receiveOffset` and `receiveOffsetRatio`. On monitor events they are
`monitorOffset` and `monitorOffsetRatio`.

**Caveat:** `dragAbsolutePosition` is the hover **centre** during a drag, but
the hover **top-left** in drop / end events. See [5.3](#53-dragabsoluteposition-at-drop).
Until 1.2.0's `absoluteMeasurements` lands, you can still derive a
provider-root frame during a drag:

```tsx
onReceiveDragOver={({ dragAbsolutePosition, receiver, dragged }) => {
  // During a drag, dragAbsolutePosition is the hover centre.
  // receiveOffset is relative to the receiver's absolute (provider-root) frame.
  const receiverAbsX = dragAbsolutePosition.x - receiver.receiveOffset.x;
  const receiverAbsY = dragAbsolutePosition.y - receiver.receiveOffset.y;
  const receiverSize = receiver.measurements; // width / height
  // top-left of the dragged view's hover copy, provider-relative
  const hoverTopLeft = dragged.hoverPosition;
}}
```

To get a view's own measurements outside events, use `onMeasure` on the
`DraxView` (relative to its parent) or `measureInWindow` on a ref (relative to
the screen).

### 5.3 dragAbsolutePosition at drop

1.2 keeps this behaviour. During continuous drag callbacks (`onDrag`,
`onDragOver`, `onReceiveDragOver`, `onMonitorDragOver`, …),
`dragAbsolutePosition` is the centre of the hover view. In drop and end
callbacks (`onDragDrop`, `onReceiveDragDrop`, `onDragEnd`,
`onMonitorDragDrop`, `onMonitorDragEnd`, …) it is the hover view's
**top-left** (`hoverPosition`). `receiveOffset` / `receiveOffsetRatio` are
computed from that same point, so at drop they are off by half the dragged
view's measured size compared to the last `onReceiveDragOver`.

1.2.0 keeps this. Work around it by shifting drop positions by half the
dragged view's size (or by reading `dragged.hoverPosition` when you want the
top-left explicitly):

```tsx
onReceiveDragDrop={({ dragAbsolutePosition, receiver, dragged }) => {
  const w = dragged.measurements?.width ?? 0;
  const h = dragged.measurements?.height ?? 0;
  // Restore the hover-centre convention used during the drag:
  const dropCenter = {
    x: dragAbsolutePosition.x + w / 2,
    y: dragAbsolutePosition.y + h / 2,
  };
  const receiveOffsetCentered = {
    x: receiver.receiveOffset.x + w / 2,
    y: receiver.receiveOffset.y + h / 2,
  };
  // Or use the top-left directly:
  const hoverTopLeft = dragged.hoverPosition; // same as dragAbsolutePosition at drop
  placeDrop(dropCenter, receiveOffsetCentered, hoverTopLeft);
}}
```

From 1.2.0, prefer `dragged.absoluteMeasurements` /
`receiver.absoluteMeasurements` instead of deriving them from offsets.

### 5.4 New optional event fields (from 1.2.0)

These fields are **from 1.2.0** and are not in 1.0 / 1.1. They ride on the
existing event types (`DraxDragEventData`, `DraxDragWithReceiverEventData`,
`DraxMonitorEventData`, …), but they are not filled on every event.
`receiver.absoluteMeasurements` is set on every event that carries a
`receiver`. On `dragged`, `absoluteMeasurements` and `hoverMeasurements` are
set on start, enter, exit, drop and end events. In continuous events
(`onDrag`, `onDragOver`, `onReceiveDragOver`, `onMonitorDragOver`) they are
only set in a frame where the receiver or the set of monitors changes, so
don't rely on them there.

| Field | Where | Optional | Notes |
|---|---|---|---|
| `absoluteMeasurements` | `dragged` and `receiver` | yes | Provider-root frame. On `dragged`, the view's layout position, not the hover's. |
| `hoverMeasurements` | `dragged` only | yes | `hoverPosition` + the dragged view's measured size (default hover / hit-test size). A differently sized `renderHoverContent` is not measured. |
| `draggedParentId` | `dynamicReceptiveCallback` data | yes | Id of the dragged view's Drax parent, if any. |
| `grabOffset` | `dragged` on `DraxSnapEndEventData` (`onSnapEnd` / `onReceiveSnapEnd`) | yes | Grab point for the drag that just ended. Not a top-level event field. |

```tsx
// 1.2.0 API — not in earlier 1.x
onReceiveDragDrop={({ dragged, receiver }) => {
  const abs = dragged.absoluteMeasurements; // layout position in provider root
  const hover = dragged.hoverMeasurements;  // hoverPosition + dragged view size
  placeAt(abs, hover, receiver?.absoluteMeasurements);
}}

onDragDrop={({ dragged, receiver }) => {
  const r = receiver.absoluteMeasurements;
  const h = dragged.hoverMeasurements;
  if (!r || !h) return undefined;
  // snap hover to the centre of the receiver
  return { x: r.x + (r.width - h.width) / 2, y: r.y + (r.height - h.height) / 2 };
}}

dynamicReceptiveCallback={({
  targetId,
  targetMeasurements,
  draggedId,
  draggedParentId, // from 1.2.0
  draggedPayload,
}) => {
  return draggedParentId !== targetId && accepts(draggedPayload);
}}

onSnapEnd={({ dragged }) => {
  // from 1.2.0: grabOffset lives on dragged, not top-level
  rememberGrab(dragged.id, dragged.grabOffset);
}}
```

### 5.5 viewState.releasedDragTracking.grabOffset

**No equivalent.** 0.11 exposed `viewState.releasedDragTracking.grabOffset`
after a drag. 1.x `DraxViewState` has no `releasedDragTracking`. `grabOffset`
is still on drag events (`dragged.grabOffset`) and on the hover
`renderContent` / `renderHoverContent` `viewState` while dragging.

Workaround: keep `dragged.grabOffset` from `onDragEnd` (or `onDragDrop`) in a
ref:

```tsx
const lastGrabOffsetRef = useRef<{ x: number; y: number } | null>(null);

<DraxView
  payload={card}
  onDragEnd={({ dragged }) => {
    lastGrabOffsetRef.current = dragged.grabOffset;
  }}
  onDragDrop={({ dragged }) => {
    lastGrabOffsetRef.current = dragged.grabOffset;
  }}
>
  <Text>{card.label}</Text>
</DraxView>
```

## 6. Hover views and measurements


### 6.1 updateHoverViewMeasurements

**No equivalent.** In 0.11, `useDraxContext().updateHoverViewMeasurements` (and
the hover view's own `onLayout`) recorded the size of the hover copy, and
collision checks could use it. In 1.2:

- Hover measurement is automatic. `disableHoverViewMeasurementsOnLayout` is
  still accepted but is marked `@deprecated` and does nothing.
- The default hover copy gets the dragged view's measured `width` and `height`.
  With `renderHoverContent`, the hover shrink-wraps to your content, and the
  dragged view's size is passed in as `props.dimensions`.
- Collision checks (`collisionAlgorithm` `'intersect'` and `'contain'`) use the
  dragged view's measured size, not the hover copy's size. Nothing lets you set
  a different hover size for hit-testing.

Workarounds:

- To re-measure after a layout change that didn't trigger `onLayout`, call
  `useDraxMethods().requestPositionUpdate()`, or call `measure()` from the
  `registration` callback of a `DraxView`.
- To make the hover copy larger or smaller than the dragged view, size it in
  `renderHoverContent`. Hit-testing still uses the dragged view's size.

### 6.2 Hover and drag styles

The style props kept their names: `dragInactiveStyle`, `draggingStyle`,
`draggingWithReceiverStyle`, `draggingWithoutReceiverStyle`,
`dragReleasedStyle`, `hoverStyle`, `hoverDraggingStyle`,
`hoverDraggingWithReceiverStyle`, `hoverDraggingWithoutReceiverStyle`,
`hoverDragReleasedStyle`, `receiverInactiveStyle`, `receivingStyle`,
`otherDraggingStyle`, `otherDraggingWithReceiverStyle` and
`otherDraggingWithoutReceiverStyle`. What changed:

- The non-hover style props are typed `DraxStyleProp` (`StyleProp<ViewStyle>`).
  They are flattened for worklets, so pass plain styles, not Reanimated
  animated styles. The `hover*Style` props still accept animated styles.
- Hover content drops `position`, `left`, `top`, `right`, `bottom` and margins
  from the view's style, so absolutely positioned items aren't offset twice.

### 6.3 renderContent and dragStatus

In 1.x, `renderContent` for the in-place view always gets
`viewState.dragStatus === DraxViewDragStatus.Inactive` and
`viewState.receiveStatus === DraxViewReceiveStatus.Inactive`. These values
are hard-coded and stay the same on every render. Only the hover copy gets
`dragStatus: Dragging` (from `renderHoverContent`, or from `renderContent` when
there's no `renderHoverContent`, with `hover: true`).

0.11 code that styled the in-place view by branching on `dragStatus` or
`receiveStatus` in `renderContent` must move to the style props. They are
applied on the UI thread:

| State | Style prop |
|---|---|
| not dragged / released | `dragInactiveStyle` / `dragReleasedStyle` |
| being dragged | `draggingStyle` |
| being dragged over / not over a receiver | `draggingWithReceiverStyle` / `draggingWithoutReceiverStyle` |
| receiving / not receiving | `receivingStyle` / `receiverInactiveStyle` |
| another view is dragged (over / not over a receiver) | `otherDraggingStyle` (`otherDraggingWithReceiverStyle` / `otherDraggingWithoutReceiverStyle`) |

Before (0.11):

```tsx
<DraxView
  payload={card}
  renderContent={({ viewState }) => (
    <View
      style={[
        styles.card,
        viewState?.dragStatus === DraxViewDragStatus.Dragging && styles.cardDragging,
        viewState?.receiveStatus === DraxViewReceiveStatus.Receiving && styles.cardReceiving,
      ]}
    >
      <Text>{card.label}</Text>
    </View>
  )}
/>
```

After (1.2):

```tsx
<DraxView
  payload={card}
  style={styles.card}
  draggingStyle={styles.cardDragging}
  receivingStyle={styles.cardReceiving}
>
  <Text>{card.label}</Text>
</DraxView>
```

To change the hover copy instead, keep branching in `renderHoverContent` (or
use the `hover*Style` props).

## 7. Behavior changes

- **Items dragged in from outside a list.** 0.11 `DraxList` accepted external
  items and reported them with `isExternalDrag: true`. In 1.2, a drag from
  outside a `SortableContainer` snaps back, and `onReorder` never reports an
  external item. To move items between sortable lists, wrap them in
  `SortableBoardContainer` with `useSortableBoard({ keyExtractor, onTransfer })`.
  Each `SortableContainer` inside registers itself as a column. `onTransfer`
  receives `SortableBoardTransferEvent` (`{ item, fromContainerId, fromIndex,
  toContainerId, toIndex }`). This API is experimental. Dropping a plain
  `DraxView` into a list at a given index is **no equivalent**. The closest
  option is `containerDraxViewProps.onMonitorDragDrop` plus your own index
  math from `monitorOffset`. A foreign drag also does not auto-scroll the
  list, fire `onDragPositionChange` or show the drop indicator. Board columns
  still react to items from other columns of the same board.
- **Row payloads.** `SortableItem` spreads your `payload` (only if it is an
  object) and then sets `index`, `originalIndex` and `item` on top. A
  non-object `payload` on a row is dropped, and your own `index`,
  `originalIndex` or `item` keys are overwritten.
- **Cancelled drags.** A drag cancelled by the system (for example, the app goes
  to the background mid-drag) is not a drop. It calls `onDragEnd` with
  `cancelled: true`, and lists put the item back in its start position without
  calling `onReorder`.
- **Leaving the list mid-drag.** As in 0.11, when a row leaves its list the
  list undoes the row's pending move and the neighbours slide back. The list
  keeps monitoring a drag until the dragged row's centre (the finger with
  `collisionAlgorithm: 'touch'`) is more than 100 pt outside the list's
  visible (clipped) edges (the monitor hit-test padding,
  `MONITOR_HIT_TEST_PADDING` in `src/math.ts`), so "leaving" means going past
  that padding.
  - Released on another receiver (anywhere, including within the padding), the
    row does not reorder the list and `onReorder` is not called. Within the
    padding the list's `onDragEnd` still fires, with `toIndex` set to the
    row's start index; on a receiver past the padding it doesn't fire.
  - Released over nothing more than 100 pt outside the list, `onReorder` is not
    called and, as in 0.11, the list's `onDragEnd` doesn't fire.
  - Released over nothing within the 100 pt padding, it still counts as a drop
    in the list: the row takes the slot it last hovered (for example the last
    slot, just below the list), `onDragEnd` reports that `toIndex` and
    `onReorder` fires, as before this change.
  Brought back in, the row moves from its start slot again. A receptive view
  nested inside a row counts as outside the list. Board columns still transfer
  items when they leave a column.
- **When `onReorder` fires.** It fires after the snap animation, not at
  release. If you showed the new order at release, move that code into
  `onReorder`.
- **Gesture config.** `longPressDelay` still defaults to 0 on `DraxView` and 250
  on list items. New `DraxView` props: `dragActivationFailOffset`,
  `scrollHorizontal` (web), `dragHandle` with `DraxHandle`, `dragBoundsRef`,
  `collisionAlgorithm`, `acceptsDrag`, `capacity` and `rejectOwnChildren`.

## 8. Quick reference

| 0.11.x | 1.2 |
|---|---|
| `DraxListItem` | `SortableItem`. `DraxList` adds it for you. |
| `onItemReorder({ fromIndex, toIndex })` | `onReorder({ data, fromIndex, toIndex, fromItem, toItem })` |
| `onItemDragStart` | `onDragStart({ index, item })`. For drag data, add `itemDraxViewProps.onDragStart`. |
| `parentDraxViewProps` | `containerDraxViewProps`, `containerStyle` and `id` |
| `onItemDragPositionChange` | `onDragPositionChange({ index, item, toIndex, previousIndex })`. For monitor data, add `containerDraxViewProps.onMonitorDragOver`. |
| `monitoringExternalDragStyle` | **No equivalent.** Toggle state from `containerDraxViewProps.onMonitorDragEnter` / `Exit` / `End` / `Drop`. |
| `useDraxContext().updateHoverViewMeasurements` | **No equivalent.** Measurement is automatic. Use `useDraxMethods().requestPositionUpdate()` to re-measure. |
| `renderItem(info, itemProps)` | `renderItem(info)`, `useItemContext()`, or `SortableItem` props |
| `x.data.protocol.payload` | `x.payload` |
| `x.data.measurements` / `absoluteMeasurements` / `hoverMeasurements` | `x.measurements?` / **from 1.2.0** `x.absoluteMeasurements?` (layout position on `dragged`; derive from offsets in earlier 1.x; see [5.3](#53-dragabsoluteposition-at-drop)) / **from 1.2.0** `dragged.hoverMeasurements?` (`hoverPosition` + dragged view size) |
| `viewState.releasedDragTracking.grabOffset` | **No equivalent** on `DraxViewState`. Keep `dragged.grabOffset` from `onDragEnd` / `onDragDrop` in a ref. **From 1.2.0:** also `dragged.grabOffset?` on `onSnapEnd` / `onReceiveSnapEnd`. |
| Autoscroll | Jump/threshold since 1.x (1.0+). **From 1.2.0:** `autoScrollEnabled`, `autoScrollInitialDelay`, honoured `autoScrollIntervalLength`, and `DraxList` forwarding. `autoScrollInitialDelay` defaults to `0` (no dwell; opt in with e.g. `300`) — see [3.6](#36-auto-scroll-props). |
