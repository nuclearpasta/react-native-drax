# react-native-drax

Drag-and-drop framework for React Native (iOS, Android, Web). v1.0.0 — major rewrite.

## Architecture

- **UI-thread-first**: spatial index worklet for hit-testing, SharedValues split by update frequency. We need to use the UI thread as much as possible.
- **Reanimated 4 + Gesture Handler 3** (beta)
- Single `HoverLayer`, per-view gesture handlers
- React compiler turned on
- Latest React features.


## Sortable Architecture

- `useSortableList` hook — list-agnostic reorder state (works with FlatList, FlashList, LegendList, etc.)
- `SortableContainer` — monitoring wrapper using `DraxView isParent`, supports `renderDropIndicator` prop
- `SortableItem` — per-item wrapper with shift animation
- `DraxList` — list-agnostic convenience wrapper (accepts `component` prop for FlatList, FlashList, LegendList, etc.)
- Map-based measurements (keyed by item key) instead of array-indexed
- Supports insert + swap reorder strategies
- Drop indicator support: `SortableContainer` tracks target position via SharedValues, renders indicator at insertion point
- **Data ownership**: Library commits reorders internally via `commitReorder`. `onReorder` is a notification — parent stores data but library already committed it. When parent echoes data back, useLayoutEffect detects the match and skips (no double-render).

### Animation Customization

- `animationConfig` prop on `useSortableList` / `DraxList`
- Presets: `'default'` (200ms timing), `'spring'` (spring physics), `'gentle'` (soft spring), `'snappy'` (fast spring), `'none'` (instant)
- Custom: `{ shiftDuration, useSpring, springDamping, springStiffness, springMass }`
- Reduced motion: `useReducedMotion()` from Reanimated — skips all shift animations automatically
- Snap-back animation: fully configurable via `animateSnap`, `snapDelay`, `snapDuration`, `snapAnimator` props

### Accessibility

- `SortableItem` auto-generates `accessibilityLabel` ("Item N of M") and `accessibilityHint` ("Long press to drag and reorder")
- `accessibilityRole="adjustable"` for screen readers
- Custom labels override defaults via `accessibilityLabel` / `accessibilityHint` props on `SortableItem`
- `useReducedMotion()` support — all shift animations respect device accessibility settings

### List Agnosticism

The composable API (`useSortableList` + `SortableContainer` + `SortableItem`) is deliberately list-agnostic:
- Works with any list component: FlatList, FlashList, LegendList, ScrollView
- The hook manages reorder state; the container monitors drags; the item wraps each cell
- `DraxList` is a convenience wrapper that accepts a `component` prop (defaults to FlatList)
- For FlashList/LegendList: pass as `component` prop to `DraxList`, or use the composable API directly

## Cross-Container Sortable (Board)

- `useSortableBoard` hook — board-level coordinator for cross-container transfers
- `SortableBoardContainer` — monitoring wrapper providing board context
- `SortableBoardContext` — auto-registration context for column `SortableContainer`s
- Each column independently uses `useSortableList` + `SortableContainer` + `SortableItem`
- Phantom slot mechanism: target column reserves virtual space at insertion point via `setPhantomSlot`
- Source column ejects dragged item from pending order via `ejectDraggedItem`
- Position-based column detection: board checks hover absolute position against column bounds
- Transfer finalization: clears all committed state on source (forces useLayoutEffect external data path), clears phantom on target, fires `onTransfer`, hover covers transition until both columns re-render with correct data
- No ghost shifts, no effectiveData bypass — both columns reset naturally via useLayoutEffect when parent updates data
- `SortableContainer` has minimal board awareness: auto-registration + finalizeDrag delegation + drag end guards

## Drag Handles

- `DraxView` accepts `dragHandle` prop — when true, the gesture is NOT attached to the view's GestureDetector
- `DraxHandle` component wraps the touchable area and receives the gesture via `DraxHandleContext`
- Only touches on the `DraxHandle` area start a drag; the rest of the view scrolls normally
- Works with `SortableItem` — just pass `dragHandle` prop and nest a `DraxHandle` inside

## Drop Zone Acceptance

- `dynamicReceptiveCallback` — conditional acceptance with full context (targetId, measurements, draggedId, draggedPayload)
- `acceptsDrag` — simpler convenience prop: `(draggedPayload: unknown) => boolean`
- Both checked in `handleReceiverChange` (JS thread). If rejected, receiver is cleared and enter callbacks skipped.
- Use for max capacity: `acceptsDrag={() => items.length < 5}`

## Collision Algorithms

- `DraxView` accepts `collisionAlgorithm` prop: `'center'` (default), `'intersect'`, or `'contain'`
- `'center'`: hover view center must be inside receiver (default, current behavior)
- `'intersect'`: any overlap between dragged view and receiver triggers receiving
- `'contain'`: dragged view must be fully inside receiver
- Algorithm is per-receiver (stored in `SpatialEntry`)
- Dragged view dimensions passed to `hitTestWorklet` for boundary calculations

## Hover Styles

- 5 hover-specific style props on `DraxView`: `hoverStyle`, `hoverDraggingStyle`, `hoverDraggingWithReceiverStyle`, `hoverDraggingWithoutReceiverStyle`, `hoverDragReleasedStyle`
- Applied in `HoverLayer.useAnimatedStyle` — reacts to `dragPhaseSV` and `receiverIdSV`
- Set once per drag in `handleDragStart` via `hoverStylesRef`, captured by worklet on HoverLayer re-render
- Supports `AnimatedViewStylePropWithoutLayout` (no layout props — hover is positioned via translateX/Y)

## Drag Bounds

- `DraxView` accepts `dragBoundsRef` prop — a ref to a `View` that constrains the drag area
- Measured via `measureLayout` relative to the root view on mount
- Stored in a SharedValue, clamped in the gesture worklet's `onActivate` and `onUpdate`
- The entire dragged view is kept within bounds (accounts for view dimensions)

## Snap Alignment Helper

- `snapToAlignment(receiver, dragged, alignment, offset?)` — compute snap target for 9-point alignment
- Alignments: `'center'`, `'top-left'`, `'top-center'`, `'top-right'`, `'center-left'`, `'center-right'`, `'bottom-left'`, `'bottom-center'`, `'bottom-right'`
- Use as return value from `onDragDrop`/`onReceiveDragDrop` callbacks
- Exported from `react-native-drax`

## Continuous Drag Callbacks

- `onDrag` — fires continuously while dragging over empty space (no receiver)
- `onDragOver` — fires continuously while dragging over the same receiver
- `onReceiveDragOver` — fires continuously on the receiver while being dragged over
- All dispatched from `handleReceiverChange` which now fires on every gesture update frame

## Namespace API

- `import { Drax } from 'react-native-drax'` for `Drax.View`, `Drax.Provider`, `Drax.Handle`, etc.
- Individual exports still work for tree-shaking: `import { DraxView } from 'react-native-drax'`

## Competitive Landscape

We compete with two libraries. Drax must match or exceed their DX while keeping unique advantages.

**react-native-sortables** (https://github.com/MatiPl01/react-native-sortables) — Docs: https://react-native-sortables-docs.vercel.app/
- SortableGrid, SortableFlex with insert + swap + custom strategies (swap grid-only), haptic feedback, drag handles (3 modes: draggable/non-draggable/fixed-order)
- Item removal/addition animations (itemExiting/itemEntering), auto-scrolling, portal rendering (PortalProvider + Layer), collapsible items
- 5 active item decoration props (scale, opacity, shadow) + inactive styling + useItemContext hook for custom animated styles
- Drop zones via BaseZone + MultiZoneProvider (deletion only, NOT cross-container transfer). Drop indicators on grid (DropIndicatorComponent + dropIndicatorStyle)
- Reanimated ≥3, Gesture Handler ≥2, partial web support, ~281K monthly npm downloads
- Sorting only — no free-form DnD, no cross-container drag, no collision algorithms, no built-in accessibility (manual only), no snap alignment
- Grid/Flex components do NOT spread ViewProps — accessibility props must go on inner children content
- Drax advantage: cross-container drag, monitoring views, free-form DnD, collision algorithms, built-in accessibility + reduced motion, animation presets, snap alignment (9-point + custom), 15 drag state style props, list-agnostic API, 19-callback event system, UI-thread DnD collision
- Drax missing: sortable flex layout, haptic feedback, item removal animation, fixed-order items, collapsible items, debug mode

**react-native-reanimated-dnd** (https://github.com/entropyconquers/react-native-reanimated-dnd) — Docs: https://reanimated-dnd-docs.vercel.app/
- v2 released March 2026: Reanimated ≥4.2 + react-native-worklets ≥0.7, sortable grids (insert + swap), free-form DnD
- Drag handles, 3 collision modes, drag bounds + axis lock (x/y/both), 9-point snap alignment (dropAlignment on Droppable), auto-scrolling (8-dir for grids)
- Horizontal sorting, dynamic item heights (number/array/function modes), FlatList integration (useFlatList prop)
- DropProvider with global callbacks (onDragStart/End/Dragging) + imperative methods (requestPositionUpdate, getDroppedItems)
- 8 hooks for granular control: useDraggable, useDroppable, useSortable, useSortableList, useHorizontalSortable/List, useGridSortable/List
- Drag styling: onStateChange callback with DraggableState enum (IDLE/DRAGGING/DROPPED) for manual styling. activeStyle on Droppable only. Sortable items have hardcoded shadow + grid scale (NOT configurable)
- Custom animation via animationFunction worklet (no named presets — docs show copy-paste recipes only)
- Still on Gesture Handler ≥2.28 (NOT v3 beta), no web support, New Architecture required (≥RN 0.80)
- No cross-container drag, no monitoring views, no UI-thread DnD collision (free-form collision on JS thread), no overlay/portal (items can clip behind siblings)
- No built-in accessibility (components do NOT spread rest ViewProps — a11y must go on inner children), no reduced motion, no haptic feedback
- No drop indicators, no named animation presets
- Drop acceptance: capacity + dropDisabled only (no data-based acceptsDrag callback)
- Item removal animation: grid only (isBeingRemoved on SortableGridItem)
- ~12 callback types, onDragging fires every frame (throttled 50ms on sortables), no receiver-side continuous callbacks
- Drax advantages: cross-container (kanban), monitoring views, UI-thread DnD collision, list-agnostic API, 5 named presets + custom fn(), built-in accessibility + reduced motion, 15 drag state style props, callback-based drop acceptance, 4 continuous drag callback types, 19-callback event system, web support, drop indicators, snap alignment with custom coordinates + snapAnimator
- Drax missing: item removal animation, DropProvider global callbacks + imperative methods

## Example App

Expo Router with 10 screens in `example/`. Stack navigation with home screen listing all examples.

### Running

```bash
cd example && yarn start
```

Use `--clear` flag after library source changes to bust the Metro transformer cache. Logs are visible directly in the terminal where you run `yarn start`.

### Navigation

Stack-based navigation. Home screen at `/` lists all examples. Use Expo Router deep links to navigate: `/color-drag-drop`, `/reorderable-list`, `/drag-handles`, etc.

### testID Reference

All interactive elements have `testID` for identification via `ui_describe_all` (`AXUniqueId`):

| Screen | testID Pattern | Examples |
|--------|---------------|----------|
| Home | `example-{route}` | `example-color-drag-drop`, `example-drag-handles` |
| Color Drag/Drop | `color-block-{color}`, `receiving-zone`, `staging-zone`, `*-clear-button` | `color-block-red`, `receiving-zone-clear-button` |
| Reorderable List | `sortable-item-{letter}`, `sortable-list-container` | `sortable-item-A`, `sortable-item-Z` |
| Reorderable Grid | `grid-tile-{number}`, `sortable-grid-container` | `grid-tile-1`, `grid-tile-30` |
| Drag Handles | `handle-item-{id}`, `drag-handles-container` | `handle-item-item-0` |
| Drag Bounds | `bounded-draggable`, `free-draggable`, `drag-bounds-area` | |
| Collision Modes | `zone-center`, `zone-intersect`, `zone-contain`, `collision-draggable` | |
| Kanban Board | `kanban-column-{id}`, `kanban-card-{id}` | `kanban-column-todo`, `kanban-card-1` |
| Knight Moves | `chess-square-{notation}`, `chess-knight`, `chess-board` | `chess-square-e4`, `chess-knight` |
| Scrolling | `scroll-item-{n}`, `sum-bucket` | `scroll-item-1`, `sum-bucket` |
| Stress Test | `stress-item-{id}`, `stress-test-container` | `stress-item-stress-0` |

## Debugging with Device Automation

### agent-device (preferred)

Workflow: `agent-device open <app>` → `agent-device snapshot -i` → interact via `@ref` → `agent-device close`

- **Snapshot**: `agent-device snapshot -i` (interactive-only, minimizes output). Always re-snapshot after navigation — refs invalidate on UI changes.
- **Interact**: `click @e1`, `fill @e2 "text"`, `scroll down 0.5`, `long-press @e3`
- **Find**: `find label "text" click` — semantic element lookup by label/text/role/id
- **Text input**: `fill` clears then types; `type` appends without clearing

### iOS Simulator MCP (fallback)

- **Screenshots**: `mcp__ios-simulator__screenshot` then `Read` the PNG
- **Coordinate-based interactions**: `ui_swipe`, `ui_tap` (point coordinates, not pixels). iPhone 17 Pro Max: 440x956pt. Divide screenshot pixels by 3 for @3x.
- **Accessibility tree**: `mcp__ios-simulator__ui_describe_all` for full screen, `ui_describe_point(x, y)` for specific element

### Simulating Drag-and-Drop

Drax uses `longPressDelay` (default 250ms) before activating drag.

- `agent-device long-press @ref` then `scroll` for drag gestures
- Fallback: `ui_swipe` with `duration=5` and `delta=1` via ios-simulator MCP for slow movement that triggers long-press then drag
- `ui_tap` with duration does long-press but lifts finger — does NOT become a drag
- For lists: vertical swipe may trigger FlatList scroll instead of drag — ask user if automated approach fails


Other: 

- Remember to always update this file ( CLAUDE.MD ) with your findings
- **NEVER use `CI=1`** when running Metro/Expo. It breaks interactive mode. Just use `yarn start` or `npx expo start` directly.