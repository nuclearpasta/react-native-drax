# react-native-drax

Drag-and-drop framework for React Native. Branch `reanimated-v4` is a major rewrite. **Breaking changes are allowed.**

## Architecture

- **UI-thread-first**: spatial index worklet for hit-testing, SharedValues split by update frequency. We need to use the UI thread as much as possible.
- **Reanimated 4 + Gesture Handler 3** (beta)
- Single `HoverLayer`, per-view gesture handlers
- React compiler turned on
- Latest React features.


## Sortable Architecture

- `useSortableList` hook — list-agnostic reorder state
- `SortableContainer` — monitoring wrapper using `DraxView isParent`, supports `renderDropIndicator` prop
- `SortableItem` — per-item wrapper with shift animation
- `DraxSortableList` — convenience FlatList wrapper
- Map-based measurements (keyed by item key) instead of array-indexed
- Supports insert + swap reorder strategies
- Drop indicator support: `SortableContainer` tracks target position via SharedValues, renders indicator at insertion point
- Old `DraxList`/`DraxListItem` are deprecated

## Drag Handles

- `DraxView` accepts `dragHandle` prop — when true, the gesture is NOT attached to the view's GestureDetector
- `DraxHandle` component wraps the touchable area and receives the gesture via `DraxHandleContext`
- Only touches on the `DraxHandle` area start a drag; the rest of the view scrolls normally
- Works with `SortableItem` — just pass `dragHandle` prop and nest a `DraxHandle` inside

## Collision Algorithms

- `DraxView` accepts `collisionAlgorithm` prop: `'center'` (default), `'intersect'`, or `'contain'`
- `'center'`: hover view center must be inside receiver (default, current behavior)
- `'intersect'`: any overlap between dragged view and receiver triggers receiving
- `'contain'`: dragged view must be fully inside receiver
- Algorithm is per-receiver (stored in `SpatialEntry`)
- Dragged view dimensions passed to `hitTestWorklet` for boundary calculations

## Namespace API

- `import { Drax } from 'react-native-drax'` for `Drax.View`, `Drax.Provider`, `Drax.Handle`, etc.
- Individual exports still work for tree-shaking: `import { DraxView } from 'react-native-drax'`

## Competitive Landscape

We compete with two libraries. Drax must match or exceed their DX while keeping unique advantages.

**react-native-sortables** (https://github.com/MatiPl01/react-native-sortables)
- SortableGrid, SortableFlex with insert + swap strategies, haptic feedback
- Sorting only — no free-form DnD, no cross-container drag
- Drax advantage: cross-container drag, monitoring views, nested contexts, free-form DnD

**react-native-reanimated-dnd** (https://github.com/entropyconquers/react-native-reanimated-dnd)
- Simpler API, drag handles, collision detection, drag bounds
- Uses Reanimated 3 (older)
- Drax advantage: UI-thread hit-testing, 18-callback event system, scroll-aware containers
- Drax now has: drag handles (`DraxHandle`), collision algorithms (`collisionAlgorithm` prop), drop indicators

## Example App

Expo Router with 9 screens in `example/`. Stack navigation with home screen listing all examples.

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