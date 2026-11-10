# react-native-drax

Drag-and-drop framework for React Native (iOS, Android, Web). Current package version 1.1.0 (the 1.x line is the Reanimated 4 rewrite of the old 0.x API).

## Architecture

- **UI-thread-first**: spatial index worklet for hit-testing, SharedValues split by update frequency. We need to use the UI thread as much as possible.
- **Reanimated 4 + react-native-worklets + Gesture Handler 3** (GH v2 also supported via `src/compat`)
- Peer ranges: React >=19.0.0, React Native >=0.78.0 (New Architecture), Reanimated ^4.0.0, Gesture Handler >=2.0.0, react-native-worklets >=0.3.0 (optional peer via `peerDependenciesMeta`: `src` imports `runOnJS`/`runOnUI` from it, and Reanimated 4 already requires it).
- Single `HoverLayer`, per-view gesture handlers
- Latest React features.


## Sortable Architecture

- `useSortableList` hook — list-agnostic reorder state (works with FlatList, FlashList, LegendList, etc.)
- `SortableContainer` — monitoring wrapper using `DraxView isParent`, supports `renderDropIndicator` prop
- `SortableItem` — per-item wrapper with shift animation
- `DraxList` — list-agnostic convenience wrapper (accepts `component` prop for FlatList, FlashList, LegendList, etc.)
- Map-based measurements (keyed by item key) instead of array-indexed
- Supports insert + swap reorder strategies
- Drop indicator support: `SortableContainer` tracks target position via SharedValues, renders indicator at insertion point
- **JS mirrors**: `shiftsJSRef` / `scrollPositionJSRef` in `_internal` mirror `shiftsRef` / `scrollPosition` for JS-thread reads (e.g. `SortableItem` `onMeasure`). A JS `.value =` write reaches the UI thread asynchronously, so a JS `.value` read can be stale and warns during render (#249). Set the mirror next to every JS-side shifts write, including before `runOnUI` blocks.
- **Data ownership**: Library commits reorders internally via `commitReorder`. `onReorder` is a notification — parent stores data but library already committed it. When parent echoes data back, useLayoutEffect detects the match and skips (no double-render).
- `finalizeDrag` reaches `SortableItem` through `_internal.onItemSnapEndRef` (stable ref, read at call time). `_internal` is rebuilt every render, so a plain property captured at render goes stale when the list owner re-renders mid-drag (#236/#296).
- Jest can render the real sortable hook/container/item with `react-test-renderer`: stub `DraxView`, Reanimated, worklets, and `useDraxContext`. See `src/__tests__/SortableItem.snapEnd.test.tsx`.

### Back-to-Back Drags (#250)

- A drag that activates while the previous one is still `releasing` (snap in flight, or snap ended but its JS callback not run yet) supersedes it. `onActivate` resets `dragPhaseSV` to `idle` and `hoverReadySV` to false.
- The new `hoverPositionSV` write cancels the snap `withTiming`, so its `finished` callback never fires. `handleDragStart` runs the pending `onSnapComplete` (`pendingSnapCompleteRef`) first, so the previous drag's `finalizeDrag` commits before the new drag touches sortable state. `onSnapComplete` runs at most once.
- The snap-end clear worklets (`performSnapback`, `finalizeDrag`, and `finalizeTransfer` step 2 on a board) reset `draggedIdSV`, `hoverPositionSV` and the hover content only while the phase is still `releasing`, so they never wipe the new drag. `finalizeTransfer`'s 3-rAF hover clear is skipped by `cleanupGenRef` once the new drag reaches the board monitor, and by the same `releasing` guard for a new drag the board does not monitor (e.g. a DraxView outside the board).
- A controlled parent also needs #310's flush deferral. Main's `setTimeout(0)` `flushVisualOrder` would otherwise land mid drag 2 and scramble it.
- Jest harness with explicit UI/JS FIFO queues, real dispatch + gesture worklets + sortable (list and two-column board): `src/__tests__/SortableContainer.dragRace.test.tsx`.

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

### Mixed-Size Grid (Non-Uniform Spans)

- `getItemSpan` prop on `useSortableList` — returns `{ colSpan, rowSpan }` per item
- `packGrid` utility — bin-packing algorithm placing items left-to-right, top-to-bottom into a 2D occupancy grid
- Grid geometry (cell size + gaps) derived automatically from item measurements
- `computeShiftsForOrder` uses `packGrid` to compute target positions for non-uniform items
- `getSlotFromPosition` maps finger position to grid cell, then to display index via cell→owner map
- `getSnapbackTarget` packs the pending order to find the dragged item's target position
- Rendering: user provides absolute positioning (ScrollView + absolute items); shifts handle reorder
- `packGrid` exported for users to compute grid positions in their render function
- Example: `example/screens/mixed-grid.tsx` — 4-column grid with 1×1, 2×1, 1×2, and 2×2 items

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

## Auto-Scroll

- Props (`DraxAutoScrollProps`, shared by `DraxScrollView`, `useSortableList`, `DraxList`): `autoScrollEnabled` (true), `autoScrollIntervalLength` (250), `autoScrollInitialDelay` (0), `autoScrollJumpRatio` (0.2 of the container/viewport), `autoScrollBackThreshold`/`ForwardThreshold` (0.1/0.9). `DraxList` forwards them to `useSortableList`.
- Timing lives in `src/autoScrollTimer.ts` (`startAutoScrollTimer`/`stopAutoScrollTimer`): dwell `initialDelay`, then jump and repeat every `intervalLength`. Leaving the band calls stop, so the dwell restarts.
- `SortableContainer` auto-scrolls and fires `onDragPositionChange` only for its own items. A foreign drag returns early (no slot tracking, drop indicator or autoscroll), except a sortable item from another column of the same board (`boardInternal.columns.has(dragged.parentId)`), which still auto-scrolls. Not `transferState.targetId`: the board monitor may set it after the column monitor in the same dispatch.
- `autoScrollEnabled` false resets the scroll state and stops the timer on the next drag-over, so flipping it mid-scroll stops scrolling. `SortableContainer` stops the timer on unmount.
- Jest: `src/__tests__/autoScroll.test.tsx` calls `SortableContainer`/`DraxScrollView` as plain functions with React hooks stubbed and reads the monitor handlers off the returned `DraxView` element. `useRef` persists by call order (so a re-render keeps the timer), and `useEffect` callbacks are collected for a mount/unmount check.

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
- `'touch'`: the finger (root-relative touch point) must be inside receiver, wherever the item was grabbed (0.x behavior, #282). `hitTestWorklet` takes an optional `touchPosition`; `useDragGesture` passes `rootRelPos` in `onUpdate` and the release point from the end event in `onDeactivate`/`onFinalize`
- Drag end events carry `dragTouchPosition` (finger at release, root-relative); `dragAbsolutePosition` at drop stays the hover top-left
- Algorithm is per-receiver (stored in `SpatialEntry`)
- Dragged view dimensions passed to `hitTestWorklet` for boundary calculations

## Hover Styles

- 5 hover-specific style props on `DraxView`: `hoverStyle`, `hoverDraggingStyle`, `hoverDraggingWithReceiverStyle`, `hoverDraggingWithoutReceiverStyle`, `hoverDragReleasedStyle`
- Applied in `HoverLayer.useAnimatedStyle` — reacts to `dragPhaseSV` and `receiverIdSV`
- Set once per drag in `handleDragStart` via `hoverStylesRef`, captured by worklet on HoverLayer re-render
- Supports `AnimatedViewStylePropWithoutLayout` (no layout props — hover is positioned via translateX/Y)
- Default hover content strips positioning styles (`position`, `left`, `top`, `right`, `bottom`) and margins via `hoverResetStyle` in `handleDragStart` — prevents double-displacement when items use `position: 'absolute'` with offsets

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
- All dispatched from `handleReceiverChange`. The drag worklet hops to it on every receiver or monitor set change (never skipped), otherwise only while JS says continuous updates are needed (`needsUpdatesSV`: monitors, `onDragOver`/`onReceiveDragOver` over a receiver, `onDrag`/provider `onDrag` with none), with at most one such hop in flight (`jsPendingSV`). An update skipped while one is in flight sets `skippedSV`; the hop's `runOnUI` end then resends the latest position once. On release, `onDeactivate` sends one more hop before `handleDragEnd` while `needsUpdatesSV` is true, so the drop sees the release position (#343 B1). Continuous callbacks therefore fire at JS rate, not frame rate (edm 124711: an unbounded per-frame queue made drops wait seconds)
- These SVs are internal: `DraxInternalContextValue` in `DraxContext.ts` extends the public `DraxContextValue`; read it with `useDraxInternalContext` (not exported). Do not add internal fields to `DraxContextValue` (public type). Tests that mock `hooks/useDraxContext` and run `useDragGesture` must mock `useDraxInternalContext`

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
- Still on Gesture Handler ≥2.28 (NOT v3), no web support, New Architecture required (≥RN 0.80)
- No cross-container drag, no monitoring views, no UI-thread DnD collision (free-form collision on JS thread), no overlay/portal (items can clip behind siblings)
- No built-in accessibility (components do NOT spread rest ViewProps — a11y must go on inner children), no reduced motion, no haptic feedback
- No drop indicators, no named animation presets
- Drop acceptance: capacity + dropDisabled only (no data-based acceptsDrag callback)
- Item removal animation: grid only (isBeingRemoved on SortableGridItem)
- ~12 callback types, onDragging fires every frame (throttled 50ms on sortables), no receiver-side continuous callbacks
- Drax advantages: cross-container (cross-list reorder), monitoring views, UI-thread DnD collision, list-agnostic API, 5 named presets + custom fn(), built-in accessibility + reduced motion, 15 drag state style props, callback-based drop acceptance, 4 continuous drag callback types, 19-callback event system, web support, drop indicators, snap alignment with custom coordinates + snapAnimator
- Drax missing: item removal animation, DropProvider global callbacks + imperative methods

## Example App

Expo Router with 11 screens in `example/`. Stack navigation with home screen listing all examples.

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
| Mixed-Size Grid | `mixed-tile-{id}`, `mixed-grid-container` | `mixed-tile-weather`, `mixed-tile-mail` |
| Drag Handles | `handle-item-{id}`, `drag-handles-container` | `handle-item-item-0` |
| Drag Bounds | `bounded-draggable`, `free-draggable`, `drag-bounds-area` | |
| Collision Modes | `zone-center`, `zone-intersect`, `zone-contain`, `collision-draggable` | |
| Cross-List Reorder | `cross-list-column-{id}`, `cross-list-card-{id}` | `cross-list-column-legendlist`, `cross-list-card-1` |
| Knight Moves | `chess-square-{notation}`, `chess-knight`, `chess-board` | `chess-square-e4`, `chess-knight` |
| Scrolling | `scroll-item-{n}`, `sum-bucket` | `scroll-item-1`, `sum-bucket` |
| Stress Test | `stress-item-{id}`, `stress-test-container` | `stress-item-stress-0` |

## Docs site versions

- npm `latest` is 1.x (1.1.0). Released docs are the default version at the unprefixed paths (`/getting-started`, `/api/...`). The tree in `docs-site/docs` is unreleased 2.x and lives at `/next/...`. The host 308s `/1.x` and `/1.x/*` to the unprefixed paths. Do not add a docs redirect or an `index` doc for `/1.x`. Do not add `docs/index.mdx` — that file would collide with the custom homepage.
- `docusaurus.config.ts`: `lastVersion: '1.x'`, `versions['1.x'].path: ''` (keep the empty string; `??` would otherwise ignore it), `versions['1.x'].label: 'v1.x'`, no banner and no `noIndex` on 1.x. `versions.current.path: 'next'`, `label: '2.x (next)'`, `banner: 'unreleased'`, `noIndex: true`.
- Homepage CTAs, footer Docs links, and navbar Docs/API point at the unprefixed 1.x URLs. The Docs/API items are `docSidebar` components swizzled to the latest version, so they stay on 1.x even while a `/next/` page is open. Do not set a site-wide `og:url`. On a `/next/` page that has a 1.x doc with the same id, `SiteMetadata` sets canonical and `og:url` to that unprefixed twin. A `/next/` page with no twin keeps its own canonical and stays `noindex`.
- `createSitemapItems` drops `/next` and `/1.x`. The sitemap lists the homepage and the released docs only.
- Live demo canonical and the navbar Live Demo link are `https://nuclearpasta.com/react-native-drax/example` with no trailing slash.
- The example tab title is `react-native-drax — Live Demo` via `Head` in `example/app/(tabs)/_layout.tsx`. Keep the `Platform.OS === 'web'` guard: iOS `expo-router/head` calls `getStaticUrlFromExpoRouter` and throws in dev when the Expo config has no `expo-router` origin.
- Production `appendBaseUrl` still joins `experiments.baseUrl` with the index path `/` and `history.replaceState`s the address bar to `/react-native-drax/example/`. There is no app config for that; parsing accepts both URLs.
- `clientScreen` must render the same placeholder on the server and on the first web client render. Mount the lazy screen in an effect. A module-level `typeof window` branch (placeholder vs `Suspense`+`lazy`) is React hydration error #418.

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
- System cancel (e.g. app backgrounded mid-drag) must not drop: RNGH 3.x calls `onDeactivate({canceled:true})` then `onFinalize`. The compat layer passes `didSucceed` to both; `useDragGesture.onDeactivate` returns early on cancel, and `SortableContainer` restores the start order when the end event is `cancelled`.
- To reproduce a system cancel on the simulator: hold a drag (no Up), press Argent `button home`, wait ≥2s, then send Up. On the iOS 27 simulator, an Up sent less than ~1s after Home arrived before the app resigned active and RNGH reported a normal END (a real drop).
- Before the cancel fix, a cancelled list drag committed the reorder when the app stayed active (drop and cancel both returned the reordered snap target). When the app was backgrounded at the cancel, the list reverted instead (cause not established). Test cancels in the foreground too, not only via Home.
- In-app cancel without HID: call the item's `GestureDetector.props.gesture.detectorCallbacks.jsEventHandler` (via `debugger-evaluate`) with UNDETERMINED→BEGAN→ACTIVE, updates, then ACTIVE→CANCELLED. RNGH sets `canceled` from the CANCELLED/FAILED state.


Other: 

- Remember to always update this file ( CLAUDE.MD ) with your findings
- **NEVER use `CI=1`** when running Metro/Expo. It breaks interactive mode. Just use `yarn start` or `npx expo start` directly.