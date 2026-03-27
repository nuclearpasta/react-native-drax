# DraxList vs FlashList vs LegendList — Deep Investigation

## Executive Summary

DraxList is a custom recycling list with built-in drag-and-drop, purpose-built for Drax v1.0. This investigation compares its architecture with FlashList v2 (Shopify) and LegendList (LegendApp) to identify performance techniques we can adopt.

**Key finding**: DraxList already uses many of the same foundational techniques as both competitors (ScrollView + absolute positioning, cell recycling, per-cell SharedValues). The biggest gaps are in **viewport tracking efficiency**, **size estimation intelligence**, **blanking prevention**, and **scroll-position maintenance**. Several improvements can be adopted without changing the core DnD architecture.

---

## 1. Architecture Comparison

### 1.1 Rendering Model

| Aspect | DraxList | FlashList v2 | LegendList |
|--------|----------|-------------|------------|
| Outer container | ScrollView | ScrollView | ScrollView |
| Item positioning | Absolute left/top + Reanimated translateX/Y shift | Absolute left/top | Absolute translateY/X |
| Content sizing | Explicit height/width on inner View | Explicit height/width on CompatView | Animated.Value for total size |
| Cell lifecycle | Stable React keys (never unmount) | Recycled React keys (components stay mounted, props change) | Container pool (optional recycling) |
| Native dependencies | Reanimated 4, Gesture Handler 3, Worklets | None (pure JS, Fabric-only) | None (pure JS, both archs) |
| Thread model | UI thread (worklet slot detection) + JS thread | JS thread only (synchronous Fabric measurement) | JS thread only |

### 1.2 Cell Recycling

**DraxList**: Maintains a pool of `cellKey` strings. When items scroll out, their cellKey is returned to `freeCellsRef`. When new items scroll in, they grab a cellKey from the pool (or create a new one). The React `key={cellKey}` ensures the native view persists — only `children` change. Items are bound via `bindingMapRef` (itemKey → cellKey).

**FlashList v2**: `RenderStackManager` maintains per-type recycle pools. When items leave the viewport, their React key is moved to the type-specific pool. New items grab a key from the matching type pool. The ViewHolder component stays mounted — only `item`, `index`, and layout props change. Has `stableIdMap` for O(1) key lookup by data ID.

**LegendList**: Pre-allocates a fixed pool of `Container` components at mount time. Pool size = `ceil((viewport + 2*buffer) / avgItemSize) * numColumns * 2`. Containers are bound to items via fine-grained state keys (`containerItemKey${id}`). When `recycleItems=false` (default), the inner component tree unmounts/remounts; with `recycleItems=true`, it persists like FlashList.

**Analysis**: DraxList's recycling is solid but lacks **type-aware pools**. FlashList's per-type pools prevent expensive re-renders when cell structure differs (e.g., header vs content item). For heterogeneous sortable lists, this matters.

### 1.3 Viewport Tracking

**DraxList**: Linear scan of all item keys in `updateVisibleCells`. For each key, looks up basePosition + shift, computes visual position, checks against `[scrollOffset - buffer, scrollOffset + viewport + buffer]`. O(n) per scroll event.

**FlashList v2**: Binary search via `findFirstVisibleIndex`/`findLastVisibleIndex` on the sorted layouts array. O(log n) per scroll event. Uses `ConsecutiveNumbers` (start/end pair) for O(1) `includes()`.

**LegendList**: Caches `scrollForNextCalculateItemsInView` — if the new scroll offset is within the safe range, skips the entire recalculation. When calculation IS needed, it does a linear scan but breaks early when `currentRowTop > scrollBottomBuffered + 1000`.

**Analysis**: This is DraxList's biggest efficiency gap for large lists. Binary search (FlashList) would give O(log n) visibility. LegendList's range-caching approach could also reduce unnecessary recalculations.

### 1.4 Layout Computation

**DraxList**: `computeGridPositions` handles three paths: mixed-size grid (packGrid), uniform grid (modulo), and linear list. Base positions stored in `Map<string, Position>`. During drag, positions frozen — shifts animate visually. All computation on JS thread except single-column worklet path.

**FlashList v2**: `LayoutManager` maintains a flat array of `RVLayout` objects. Uses `MultiTypeAverageWindow` (circular buffer of 5 values per item type) for size estimation. Layout recomputation starts from the minimum changed index and is batched (max 250 items per pass for progressive rendering).

**LegendList**: Positions in `Map<string, number>`. Recomputation is a linear scan from startIndex with early break. Per-item-type running averages for size estimation.

### 1.5 Size Estimation

**DraxList**: Single `estimatedItemSize` value for all items. Items self-measure via `onLayout`. If actual size differs by > 0.5px, `itemHeightsRef` is updated and base positions recomputed.

**FlashList v2**: `MultiTypeAverageWindow` — a circular buffer of 5 measured values per item type, starting at 200px. As items measure, the average converges toward real sizes. Much better initial layout for lists with heterogeneous item types.

**LegendList**: Per-item-type running averages: `averageSizes[itemType] = { avg, num }`. Plus `getEstimatedItemSize(index)` callback for per-item overrides, and `getFixedItemSize(index)` for known-size items.

**Analysis**: Both competitors use per-type running averages. This is a clear improvement opportunity — DraxList's single `estimatedItemSize` produces worse initial layouts for lists with mixed item sizes.

---

## 2. Performance Techniques Comparison

### 2.1 Blanking Prevention

| Technique | DraxList | FlashList v2 | LegendList |
|-----------|----------|-------------|------------|
| Draw distance buffer | Yes (250px default) | Yes (250px, split 70/30 by direction) | Yes (250px, split 50/150 by direction) |
| Velocity-aware buffer | No | Yes (70% in scroll direction + boundary redistribution) | Yes (150% in scroll direction) |
| Offset projection | No | Yes (Android: predict scroll position ahead by render time) | No |
| Progressive rendering | No | Yes (exponential batch sizing, blocks paint until measured) | Yes (waitForInitialLayout) |
| Initial opacity 0 | No | Yes (ViewHolderCollection starts invisible) | Yes (waitForInitialLayout) |
| useLayoutEffect corrections | No (uses onLayout) | Yes (synchronous Fabric measureLayout) | Yes (on new arch) |

**Analysis**: Velocity-aware buffer distribution is the most impactful improvement. Currently DraxList distributes buffer symmetrically. Giving 70% to the scroll direction would reduce blanking during fast scrolling at minimal cost.

### 2.2 Re-render Optimization

**DraxList**: Single `forceRender` via `useReducer`. Every cell binding change triggers ONE re-render of the entire DraxList component. Individual cells are `React.memo`'d (`RecycledCell`). Per-cell SharedValues mean only shifted cells re-evaluate their animated style on the UI thread.

**FlashList v2**: `renderId` state triggers re-render. `ViewHolder` uses custom `React.memo` comparator with deep layout equality. `renderItem` result is `useMemo`'d on `[item, extraData, target, renderItem]` — notably NOT on index, so recycled items with same data don't re-render children.

**LegendList**: Fine-grained state (`set$`/`useArr$`) means each Container subscribes only to its own keys. Updating one container's position doesn't re-render others. This is the most granular approach.

**Analysis**: DraxList's model is good. The `RecycledCell` memo + per-cell SharedValue approach is already quite efficient. The main cost is the `forceRender` call which re-runs the bindings `.map()` in DraxList — but this is lightweight (just mapping cellKey → item lookup). LegendList's approach is more granular but would require a fundamentally different state architecture.

### 2.3 Measurement

**DraxList**: Uses `onLayout` on a wrapper `View` around `renderItem`. Two nested onLayout calls: outer for primary axis, inner for cross-axis. Measurement is asynchronous (fires after native layout pass).

**FlashList v2**: Uses synchronous `measureLayout` (Fabric only) in `useLayoutEffect`. Corrections happen before paint. This is the key v2 innovation — all layout adjustments are invisible to the user.

**LegendList**: `onLayout` on Container + synchronous `measure()` via `useLayoutEffect` on new arch. Falls back to onLayout on old arch.

**Analysis**: DraxList could benefit from synchronous measurement on Fabric (since we already require new arch via Reanimated 4). However, our two-nested-onLayout approach is needed for the cross-axis measurement pattern (items that center inside their column). The primary axis measurement could potentially use synchronous Fabric `measureLayout` instead.

### 2.4 Scroll Position Maintenance (MVCP)

**DraxList**: No MVCP. When items change size or data changes, positions recompute but scroll position is not adjusted.

**FlashList v2**: Sophisticated MVCP using `ScrollAnchor` (invisible View) + native `maintainVisibleContentPosition`. Computes position diff of previously-visible item, adjusts anchor to trigger native correction.

**LegendList**: Custom MVCP that snapshots first-visible-item position before recalc, computes diff after, and adjusts via a `ScrollAdjust` anchor view piggy-backing on native MVCP.

**Analysis**: Not critical for drag-and-drop sorting (positions are stable during drag), but would help during data changes from external sources (e.g., real-time updates while list is visible).

---

## 3. Actionable Improvements for DraxList

### Priority 1 — High Impact, Low Effort

#### 3.1 Velocity-Aware Buffer Distribution
**What**: Split `drawDistance` asymmetrically based on scroll direction (70% ahead, 30% behind).
**Why**: Both competitors do this. Reduces blanking during fast scrolling by pre-rendering more items in the direction of movement.
**How**: Track scroll velocity in `handleScroll` (compare current offset to previous). Pass direction to `updateVisibleCells`. Adjust `visibleStart`/`visibleEnd` calculation.
**Effort**: Small — affects only `handleScroll` and `updateVisibleCells` in DraxList.tsx.

#### 3.2 Binary Search for Visible Range
**What**: Replace the O(n) linear scan in `updateVisibleCells` with O(log n) binary search.
**Why**: For large lists (100+ items), the current linear scan is wasteful. FlashList uses binary search; it's the standard approach.
**How**: `basePositionsRef` already has sorted positions. Binary search for the first item where `position + height >= visibleStart`, then linear scan forward to `visibleEnd`. Requires positions to be stored in sorted order (they already are — keyed by orderedKeysRef which is in display order).
**Effort**: Small — refactor `updateVisibleCells` inner loop to binary search start, linear scan to end.

#### 3.3 Range Caching (Skip Redundant Recalculations)
**What**: Cache the "safe scroll range" where the current visible set is valid. Skip `updateVisibleCells` entirely if the new scroll offset is within this range.
**Why**: LegendList's `scrollForNextCalculateItemsInView` eliminates most scroll handler work. Most scroll events don't change the visible set — especially with a large `drawDistance`.
**How**: After computing visible cells, store `{safeStart, safeEnd}` where safeStart = visibleStart + margin, safeEnd = visibleEnd - margin. Next scroll: if offset is within safe range, early return.
**Effort**: Small — a few lines in `handleScroll`.

### Priority 2 — Medium Impact, Medium Effort

#### 3.4 Per-Type Size Estimation
**What**: Replace single `estimatedItemSize` with per-item-type running averages.
**Why**: Both FlashList and LegendList do this. For lists with heterogeneous item sizes (e.g., mixed card types), per-type averages give much better initial positions — less layout jumping on first render.
**How**: Add optional `getItemType` prop. Maintain `averageSizes: Map<string, { sum: number, count: number }>` in useSortableList. When items self-measure, update the type's average. Use type-specific average (or global estimatedItemSize as fallback) in `computeGridPositions`.
**Effort**: Medium — new prop, new ref in useSortableList, update computeGridPositions lookups.

#### 3.5 Synchronous Measurement on Fabric
**What**: Use Fabric's synchronous `measureLayout` in `useLayoutEffect` instead of async `onLayout` for primary-axis measurement.
**Why**: FlashList v2 proved this eliminates visible layout jumping. All corrections happen before paint.
**How**: Replace the outer `onLayout` wrapper with a `useLayoutEffect` + `ref.current.measureLayout()` call. Keep the inner onLayout for cross-axis (or also convert).
**Caveat**: This requires Fabric (which we already need for Reanimated 4). Need to verify `measureLayout` is truly synchronous in our RN version (0.80+).
**Effort**: Medium — need to refactor RecycledCell or the inner View wrappers.

#### 3.6 Type-Aware Cell Pools
**What**: Maintain per-type recycle pools instead of a single `freeCellsRef` array.
**Why**: When a "header" cell is recycled and reused for a "content" cell, React must unmount and remount the entire inner tree (even though the wrapper View persists). Per-type pools ensure recycled cells match the incoming item's component structure.
**How**: Add `getItemType` prop. Change `freeCellsRef` from `string[]` to `Map<string, string[]>`. On unbind, push to the type's pool. On bind, pop from matching type's pool first, then any pool.
**Effort**: Medium — refactor `updateVisibleCells` binding/unbinding logic.

### Priority 3 — Lower Priority or Larger Effort

#### 3.7 Progressive Initial Render
**What**: On first mount, render only viewport items, measure, then expand to full drawDistance.
**Why**: FlashList starts with 2 items, expands exponentially. Reduces time-to-first-paint for large lists.
**How**: Introduce an `isInitialized` ref. On first `updateVisibleCells`, use a small buffer. After first `forceRender` with measured items, expand to full `drawDistance`.
**Effort**: Small but needs testing for visual stability.

#### 3.8 Initial Opacity 0 Until Measured
**What**: Render cells invisible until items have been measured and positioned correctly.
**Why**: Prevents flash of estimated-size items that jump to real size. Both competitors do this.
**How**: Track `isFirstLayoutComplete` ref. Apply `opacity: 0` to the content container until all initially-visible items have been measured.
**Effort**: Small but UX-sensitive — need to avoid perceived loading delay.

#### 3.9 Scroll Position Maintenance (MVCP)
**What**: When items above the viewport change size, adjust scroll offset to keep visible content stable.
**Why**: Important for lists with dynamic content (e.g., images loading, expandable items). Both competitors implement this.
**How**: Before `recomputeBasePositions`, snapshot position of first visible item. After recompute, compare new position. Adjust scroll by diff via `scrollRef.current.scrollTo({ animated: false })`.
**Effort**: Medium — need to identify "first visible item" and coordinate with scroll handler to ignore the programmatic scroll.

#### 3.10 Batched Layout Recomputation
**What**: When multiple items measure in rapid succession, batch the position recomputation instead of recomputing per-item.
**Why**: Currently, each `handleItemLayout` call that detects a size change triggers `recomputeBasePositions()` + `forceRender()`. If 10 items measure in the same frame, that's 10 recomputations.
**How**: Use a microtask/requestAnimationFrame to batch: set a `needsRecomputeRef = true` on size change, schedule `recomputeBasePositions` + `forceRender` for next microtask if not already scheduled.
**Effort**: Small but needs careful interaction with drag state (don't batch during active drag).

---

## 4. Techniques We Should NOT Adopt

### 4.1 Fine-Grained Reactive State (LegendList)
LegendList's `set$`/`useArr$` system is elegant but would require replacing our SharedValue + forceRender architecture. The benefit is marginal — our per-cell SharedValues already achieve fine-grained UI-thread updates for shift animations. The JS-thread forceRender cost is low (just mapping bindings).

### 4.2 Removing Native Dependencies (FlashList v2)
FlashList went pure-JS to maximize portability. We need Reanimated for shift animations and Gesture Handler for drag gestures — these are non-negotiable for DnD performance.

### 4.3 Render Time Tracking / Offset Projection (FlashList v2)
FlashList's Android offset projection is clever but complex. The benefit is marginal for our use case — drag-and-drop lists are typically shorter (10-100 items) where blanking is rare. The complexity isn't worth it.

### 4.4 Masonry/Staggered Layout
FlashList supports masonry via `MasonryLayoutManager`. Interesting but orthogonal to our sortable use case. Our `packGrid` bin-packing for mixed-size grids serves a different purpose (fixed cell sizes with variable spans).

---

## 5. Architecture Summary

```
                  DraxList              FlashList v2            LegendList
                  ────────              ────────────            ──────────
Scroll layer      ScrollView            ScrollView              ScrollView
Position          abs left/top          abs left/top            translateY/X
                  + Reanimated shift
Recycling         cellKey pool          per-type key pool       container pool
                  (single pool)         (with stableIdMap)      (pre-allocated)
Visibility        O(n) linear scan      O(log n) binary search  range-cached skip
Size estimation   single estimate       per-type avg window     per-type avg
Measurement       async onLayout        sync measureLayout      both (arch-dependent)
Re-render model   forceRender (1 call)  renderId (1 call)       fine-grained per-cell
Shift animation   per-cell SharedValue  N/A (no DnD)            N/A (no DnD)
Thread model      UI (worklet) + JS     JS only (sync Fabric)   JS only
DnD support       Full                  None                    None
```

---

## 6. Recommended Implementation Order

1. **Velocity-aware buffer** — immediate win, ~30 lines changed
2. **Range caching** — immediate win, ~15 lines changed
3. **Binary search visibility** — O(n) → O(log n), ~40 lines changed
4. **Per-type size estimation** — better initial layout, ~60 lines changed + new prop
5. **Batched layout recomputation** — reduces wasted work, ~30 lines changed
6. **Type-aware cell pools** — better recycling for heterogeneous lists, ~50 lines changed
7. **Progressive initial render** — faster first paint, ~40 lines changed
8. **Synchronous measurement** — eliminate layout jumping, ~80 lines changed + testing
9. **MVCP** — scroll stability during size changes, ~100 lines changed

Items 1-3 can be done together in a single PR. Items 4-6 in another. Items 7-9 are independent.

Note: Items 7-8 (FOUC prevention) already landed on LOCAL-28/v2 via commits 81b3cb4 and 2a9928c.

---

## 7. Code-Level Allocation & Efficiency Hotspots

Beyond the architectural improvements above, these are specific code-level issues found in the current implementation.

### 7.1 HIGH IMPACT

#### `cellShiftRecordSV` full rebuild on cell recycle during drag
**Where**: `useSortableList.ts:273-276, 284-286`
**What**: During drag, every cell register/unregister (scroll-triggered recycle) rebuilds the entire `cellShiftRecordSV` Record from the full Map. With 50 visible cells, that's 50 iterations + new object allocation per recycle.
**Fix**: Maintain a parallel Record alongside the Map. On register, add to both; on unregister, delete from both. Assign the pre-built Record to the SV without rebuilding.

#### `computeGridPositions` allocates 2 Maps + N objects per call (grids)
**Where**: `useSortableList.ts:356-357`
**What**: Called from `recomputeShiftsForReorder` on every slot change during grid drag. Allocates `new Map()` twice + N Position + N dimension objects per gesture frame.
**Fix**: Pool the Maps — maintain two persistent Maps that are `.clear()`ed and reused. Caller reads before next call.

### 7.2 MEDIUM IMPACT

#### Worklet style spread allocates empty `{}` per cell per frame
**Where**: `RecycledCell.tsx:98-103, 112-116`
**What**: `...(isInactive && inactiveItemStyle ? inactiveItemStyle : {})` allocates an empty `{}` object and spreads it on every UI-thread evaluation when no inactive style is present.
**Fix**: Use a branch instead of conditional spread:
```javascript
if (isInactive && inactiveItemStyle) {
    return { opacity: 0, transform: [...], ...inactiveItemStyle };
}
return { opacity: isDragged ? 0 : 1, transform: [...] };
```

#### `shiftsSV.value` read on every scroll frame (even when not dragging)
**Where**: `DraxList.tsx:358`
**What**: Every scroll event reads `shiftsSV.value` via JSI cross-thread call. During normal scrolling (no drag), shifts are always `{}` — wasted read.
**Fix**: Guard with `int.isDraggingRef.current`. Skip shifts lookup when not dragging.

#### Unconditional `forceRender()` after `updateVisibleCells`
**Where**: `DraxList.tsx:465`
**What**: `useLayoutEffect` on data change always calls `forceRender()` even if `updateVisibleCells` already triggered one. Double render work on every data change.
**Fix**: Return a boolean from `updateVisibleCells` indicating whether it already rendered. Skip redundant `forceRender()`.

#### Full bindings array rebuilt on every visible-set change
**Where**: `DraxList.tsx:417-421`
**What**: When any cell is bound/unbound during scroll, the entire bindings array (30 CellBinding objects) is rebuilt from the Map.
**Fix**: Apply incremental changes — on unbind, splice out; on bind, push. Avoids full rebuild.

#### Spread-copy of `itemHeightsSV` per measurement during drag
**Where**: `DraxList.tsx:331-334`
**What**: During active drag, every item measurement spreads the entire `itemHeightsSV` Record to add one key.
**Fix**: Batch measurements via microtask — set a flag on size change, schedule a single SV write on next microtask.

#### No guard against no-op container layout
**Where**: `DraxList.tsx:288-297`
**What**: `handleContainerLayout` triggers full `recomputeBasePositionsAndClearShifts` + `updateVisibleCells` + `forceRender` even if the container width didn't change. iOS fires `onLayout` multiple times during mount.
**Fix**: Early return if `cw === int.containerWidthRef.current`.

#### Three Map-to-Record conversions at drag start
**Where**: `useSortableList.ts:291-308`
**What**: `syncRefsToWorklet` converts 3 Maps to Records (basePositions, itemHeights, cellShiftRegistry) — O(3N) at drag start.
**Fix**: Maintain shadow Records updated incrementally. At sync time, just assign the pre-built Record.

### 7.3 LOW IMPACT

#### `indexOf` in worklet (O(N) on UI thread)
**Where**: `useSortableList.ts:602`
**What**: `keys.indexOf(dragKey)` does a linear scan per gesture frame.
**Fix**: Pass the current drag index as a parameter (already known from `currentSlotSV`).

#### New indicator info object per slot change
**Where**: `DraxList.tsx:728-741`
**What**: 12-property object allocated per slot change. Most properties are constant for the drag.
**Fix**: Allocate once in `onMonitorDragStart`, mutate `index` on slot change.

#### `removeKey` allocates a filtered array
**Where**: `useSortableList.ts:718`
**What**: `.filter()` allocates a new array during cross-container transfer.
**Fix**: Use `splice` on the existing array (find index, splice it out).

#### Array spread of ordered keys per slot change
**Where**: `useSortableList.ts:642`
**What**: `[...orderedKeysRef.current]` copies the full array before splice.
**Fix**: Double-buffer approach — swap between two arrays to avoid allocation.
