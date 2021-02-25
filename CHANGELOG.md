# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Changes marked as (BREAKING) may break your app logic. Changes marked as (BREAKING-TS) may break your app logic if you are explicitly using Drax's exported TypeScript type definitions in your code.

## Unreleased

### Changed

- (BREAKING) Rename `useDrax` to `useDraxContext`
- Simplify DraxList rendering because Drax ids cannot be empty since 0.7.0

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
- (BREAKING) Changed peerDependency react-native from \* to >=0.62.0
- (BREAKING) Changed peerDependency react-native-gesture-handler from ^1.5.0 to >=1.8.0
- Removed dependency uuid
- Removed devDependency @types/uuid
- Removed devDependency @types/react
- Removed devDependency @babel/core
- Removed devDependency @babel/runtime
- Removed devDependency hoist-non-react-statics
- Upgraded devDependency @types/node from ^14.0.5 to ^14.11.8
- Upgraded devDependency @types/react from ^16.9.17 to ^16.9.51
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

_(More history to be added later)_

[unreleased]: https://github.com/nuclearpasta/react-native-drax/compare/v0.6.0...HEAD
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
