# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Changes marked as (BREAKING) may break your app logic. Changes marked as (BREAKING-TS) may break your app logic if you are explicitly using Drax's exported TypeScript type definitions in your code.


## [1.0.0] - 2026-03-20

Complete rewrite of the library. This is a major release with breaking changes from all prior versions.

### Architecture

- Rewritten on **Reanimated 4** and **Gesture Handler 3** (beta)
- **UI-thread-first** architecture: spatial index worklet for hit-testing, SharedValues split by update frequency
- **New Architecture (Fabric)** compatible
- **Web** platform support
- Single `HoverLayer`, per-view gesture handlers
- Gesture Handler v2 supported via compatibility layer (v3 recommended for best performance)

### Added

- **List-agnostic sortable API**: `useSortableList` hook + `SortableContainer` + `SortableItem` composable primitives — works with FlatList, FlashList, LegendList, or any list component
- **`DraxList`** convenience wrapper: list-agnostic sortable list with `component` prop to swap list implementations
- **Cross-container sortable** (experimental): `useSortableBoard` + `SortableBoardContainer` for kanban board patterns
- **Drag handles**: `DraxHandle` component + `dragHandle` prop — only the handle area starts a drag
- **Drag bounds**: `dragBoundsRef` prop constrains drags within a boundary view
- **Collision algorithms**: `collisionAlgorithm` prop — `'center'` (default), `'intersect'`, `'contain'`
- **Drop zone acceptance**: `acceptsDrag` convenience prop + `dynamicReceptiveCallback` for conditional drop acceptance
- **Hover styles**: 5 hover-specific style props — `hoverStyle`, `hoverDraggingStyle`, `hoverDraggingWithReceiverStyle`, `hoverDraggingWithoutReceiverStyle`, `hoverDragReleasedStyle`
- **Snap alignment**: `snapToAlignment()` utility for 9-point alignment within receivers
- **Animation presets**: `'default'`, `'spring'`, `'gentle'`, `'snappy'`, `'none'` — plus custom spring/timing config
- **Continuous drag callbacks**: `onDrag`, `onDragOver`, `onReceiveDragOver` fire every gesture frame
- **Accessibility**: auto-generated `accessibilityLabel`/`accessibilityHint` on sortable items, `useReducedMotion()` support
- **Namespace API**: `import { Drax } from 'react-native-drax'` for `Drax.View`, `Drax.Provider`, etc.
- **Drop indicator support**: `renderDropIndicator` prop on `SortableContainer`
- **Insert + swap** reorder strategies
- 10 example screens in the bundled Expo Router example app

### Changed

- (BREAKING) Peer dependency: `react-native-reanimated ^4.0.0` required
- (BREAKING) Peer dependency: `react-native-gesture-handler >=2.0.0` required (v3 recommended)
- (BREAKING) Peer dependency: `react >=18.0.0` required
- (BREAKING) `DraxList` is completely new — list-agnostic wrapper using the new sortable architecture
- (BREAKING) `dynamicReceptiveCallback` signature changed: receives `draggedPayload` parameter

### Removed

- (BREAKING) Old `DraxList` component (v0.10.x API with `renderItemContent`/`renderHoverContent` and v0.11.0-alpha API with `renderItem(info, itemProps)`)
- (BREAKING) `DraxListItem` component — replaced by `SortableItem`
- (BREAKING) All legacy list types: `DraxListProps` (old), `DraxListItemProps`, `DraxListDraggedItemData`, `DraxListOnItemDragStartEventData`, `DraxListOnItemDragPositionChangeEventData`, `DraxListOnItemDragEndEventData`, `DraxListOnItemReorderEventData`, `DraxListRenderItemContent`, `DraxListRenderItemHoverContent`, `DraxListOnItemReorder`


## [0.10.3] - 2022-09-06

### Fixed
- Fix clipping sizes to properly take position into account (#151) - Thank you @FrancoisDupayrat!

## [0.10.2] - 2022-06-10

### Added
- Allow overriding style of DraxProvider (#136)

## [0.10.1] - 2022-06-10

### Changed
- Bump ansi-regex from 4.1.0 to 4.1.1 (dependabot)
- Bump async from 2.6.3 to 2.6.4 (dependabot)
- Bump cross-fetch from 3.1.4 to 3.1.5 (dependabot)
- Bump minimist from 1.2.5 to 1.2.6 (dependabot)
- Bump plist from 3.0.2 to 3.0.5 (dependabot)
- Bump simple-plist from 1.1.1 to 1.3.1 (dependabot)

## [0.10.0] - 2022-06-10

### Changed
- (BREAKING) Update requirement from RN 0.62 to RN 0.65
- (BREAKING-TS) Remove Animated ViewStyle types which were needed as a workaround before

### Fixed
- (BREAKING) Stop using removeListener method which was deprecated in RN 0.65 (#125)

## [0.9.3] - 2021-12-14

### Fixed
- Fixed typo-based math error in auto-scroll logic (#126)

## [0.9.2] - 2021-12-08

### Fixed
- Fixed typo-based math error in view measurement clipping logic (#124)

## [0.9.1] - 2021-11-03

### Changed
- Apply `DraxScrollView`'s style to outer `DraxView` instead of inner `ScrollView` (#119)
- Upgraded tmpl from 1.0.4 to 1.0.5 (dependabot)

## [0.9.0] - 2021-11-03

### Added
- Forward underlying `ScrollView` ref in `DraxScrollView` (#117)
- Forward underlying `FlatList` ref in `DraxList` (#118)

### Changed
- Apply `DraxScrollView`'s style to outer `DraxView` instead of inner `ScrollView` (#119)
- Elaborated on state of library and contributions in README

## [0.8.2] - 2021-09-07

### Added
- Added `longPressDelay` prop to `DraxList` to override default (#59)

### Changed
- Upgraded path-parse from 1.0.6 to 1.0.7 (dependabot)

## [0.8.1] - 2021-08-02

### Changed
- Small change to `DraxList` ref array allocations to account for race conditions in registration/measurement causing shifts array to become wrong length (#103)
- Upgraded devDependency react-native from ^0.64.0 to ^0.64.1 for security alert

## [0.8.0] - 2021-04-29

### Changed
- (BREAKING) Rename `useDrax` to `useDraxContext`
- Simplify DraxList rendering because Drax ids cannot be empty since 0.7.0
- Bump y18n from 4.0.0 to 4.0.3 (dependabot)
- (BREAKING-TS) Update `hover*Style` props to not include layout-related keys, to reflect reality
- Merge hover view translate transform with any transform value specified in `hover*Style` props rather than replacing (#35)
- Upgraded devDependency @types/node from ^14.11.8 to ^14.14.43
- Upgraded devDependency @types/react-native from ^0.63.25 to ^0.64.4
- Upgraded devDependency @typescript-eslint/eslint-plugin from ^4.4.0 to ^4.22.0
- Upgraded devDependency @typescript-eslint/parser from ^4.4.0 to ^4.22.0
- Upgraded devDependency eslint from ^7.10.0 to ^7.25.0
- Upgraded devDependency eslint-config-airbnb-typescript from ^11.0.0 to ^12.3.1
- Upgraded devDependency eslint-plugin-jsx-a11y from ^6.3.1 to ^6.4.1
- Upgraded devDependency eslint-plugin-react from ^7.21.3 to ^7.23.2
- Upgraded devDependency eslint-plugin-react-hooks from ^4.1.2 to ^4.2.0
- Upgraded devDependency react from ^16.13.1 to ^17.0.2
- Upgraded devDependency react-native from ^0.63.3 to ^0.64.0
- Upgraded devDependency typescript from ^4.0.3 to ^4.2.4
- Removed type workaround for `LongPressGestureHandlerGestureEvent`

### Fixed
- Honor `onScroll` prop of `DraxList` (#63)

### Added
- Added `itemsDraggable` prop to `DraxList` to allow explicitly disabling dragging of all items (#62)
- Added `lockDragXPosition` and `lockDragYPositon` props to `DraxView` to allow locking drags to an axis (#65)
- Added `lockItemDragsToMainAxis` prop to `DraxList` to allow locking dragged items to the main axis of a list (#65)
- Added `flatListStyle` prop to `DraxList` to allow styling of underlying `FlatList` (#40)
- Added `viewPropsExtrator` prop to `DraxList` to allow overriding `DraxView` props for specific items (#92)

## [0.7.2] - 2020-10-13

### Changed
- Upgraded node-fetch indirect dependency from 2.6.0 to 2.6.1 for security

## [0.7.1] - 2020-10-12

### Changed
- Upgraded lodash dependency from 4.17.15 to 4.17.19 for security

## [0.7.0] - 2020-10-12

### Fixed
- (BREAKING) Stop calling getNode on Animated.View; requires React Native >=0.62.0 (#54)
- Fixed various newly uncovered warnings/errors due to upgrades

### Changed
- Changed internal logic so that views never have empty Drax ids even for a moment
- Moved useDrax into hooks directory
- (BREAKING) Changed peerDependency react-native from * to >=0.62.0
- (BREAKING) Changed peerDependency react-native-gesture-handler from ^1.5.0 to >=1.8.0
- Removed dependency uuid
- Removed devDependency @types/uuid
- Removed devDependency @types/react
- Removed devDependency @babel/core
- Removed devDependency @babel/runtime
- Removed devDependency hoist-non-react-statics
- Upgraded devDependency @types/node from ^14.0.5 to ^14.11.8
- Upgraded devDependency @types/react-native from ^0.60.25 to ^0.63.25
- Upgraded devDependency react from ^16.9.0 to ^16.13.1
- Upgraded devDependency react-native from ^0.62.2 to ^0.63.3
- Upgraded devDependency typescript from ^3.7.2 to ^4.0.3
- Upgraded devDependency eslint from ^6.7.0 to ^7.10.0
- Upgraded devDependency @typescript-eslint/eslint-plugin from ^2.8.0 to ^4.4.0
- Upgraded devDependency @typescript-eslint/parser from ^2.8.0 to ^4.4.0
- Upgraded devDependency eslint-config-airbnb-typescript from ^6.3.0 to ^11.0.0
- Upgraded devDependency eslint-plugin-import from ^2.18.2 to ^2.22.1
- Upgraded devDependency eslint-plugin-jsx-a11y from ^6.2.3 to ^6.3.1
- Upgraded devDependency eslint-plugin-react from ^7.16.0 to ^7.21.3
- Upgraded devDependency eslint-plugin-react-hooks from ^2.3.0 to ^4.1.2
- Upgraded devDependency eslint-plugin-react-native from ^3.8.1 to ^3.10.0
- Upgraded devDependency react-native-gesture-handler from ^1.5.0 to ^1.8.0
- Changed TypeScript output directory from lib to build

### Added
- Added lint script to package.json

## [0.6.0] - 2020-06-16
### Changed
- Speed up dragging animation to be at least 60fps (#29)

### Fixed
- Implement `onMonitorDragStart` in DraxView (#22)
- Fix regression with DraxList reorder item snapback position (#46)

### Added
- New DraxList item drag lifecycle callbacks: `onItemDragStart`, `onItemDragPositionChange`, `onItemDragEnd` (#25)
- New DraxView prop `snapbackAnimator` for custom snapback animations (#28)

## [0.5.5] - 2020-06-09
### Changed
- Bump devDependency react-native to 0.62 to address logkitty vulnerability (dependabot; #30)

## [0.5.4] - 2020-06-09
### Changed
- Fixed bug with DraxList item shift values when dragging outside list (#27)

## [0.5.3] - 2020-05-23
### Added
- Added devDependency @types/node@^14.0.5

### Changed
- Bump library versions (dependabot)

## [0.5.2] - 2020-03-16
### Changed
- Bump minimist from 1.2.0 to 1.2.5 (dependabot)

## [0.5.1] - 2020-03-16
### Changed
- Bump acorn from 7.1.0 to 7.1.1 (dependabot)

## [0.5.0] - 2020-01-28
### Added
- Added .editorconfig file to render tabs with indent size 4 on GitHub
- (BREAKING-TS) Drag/drop lifecycle events include supplemental data such as dragOffset/grabOffset (#17)
- Added explanation of BREAKING and BREAKING-TS to changelog.
- (BREAKING-TS) Add `dragTranslation` and `dragTranslationRatio` to drag/drop lifecycle event payloads and view states (#23)

### Changed
- (BREAKING) All `Animated.ValueXY`s except `hoverPosition` are now `Position`s (#18)
- (BREAKING) Drag/drop lifecycle event payloads have been unified for consistency (#20)
- (BREAKING) Renamed `screenPosition` to `dragAbsolutePosition` (#19)

### Fixed
- Improved `isPosition` logic to avoid potential TypeErrors
- Call `onMonitorDragEnd` even if drag is not cancelled (#21)

## [0.4.2] - 2020-01-23
### Added
- Added `onSnapbackEnd` property to DraxView (#16)

## [0.4.1] - 2020-01-22
### Added
- Include relative position data in receiver objects for non-receiver events (#15)
- Added screenshots to README
- Created initial CHANGELOG

### Fixed
- Fixed documentation typos

## [0.4.0] - 2020-01-13
### Added
- Added Basic Usage and Caveats to README
- Added link to example project to README

### Changed
- (BREAKING) Changed default `longPressDelay` from 250ms to 0ms for DraxView (#11)
- Updated copyright year range

## [0.3.6] - 2020-01-12
### Fixed
- Fixed problem with view measurements after Dimensions change (#9)

## [0.3.5] - 2020-01-12
### Fixed
- DraxProvider now respects parent padding (#10)

*(More history to be added later?)*

[Unreleased]: https://github.com/nuclearpasta/react-native-drax/compare/v0.10.3...HEAD
[0.10.3]: https://github.com/nuclearpasta/react-native-drax/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.9.3...v0.10.0
[0.9.3]: https://github.com/nuclearpasta/react-native-drax/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.5...v0.6.0
[0.5.5]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.6...v0.4.0
[0.3.6]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.4...v0.3.5
