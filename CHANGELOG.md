# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Changes marked as (BREAKING) may break your app logic. Changes marked as (BREAKING-TS) may break your app logic if you are explicitly using Drax's exported TypeScript type definitions in your code.

## [Unreleased]

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

*(More history to be added later)*

[Unreleased]: https://github.com/nuclearpasta/react-native-drax/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/nuclearpasta/react-native-drax/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.6...v0.4.0
[0.3.6]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/nuclearpasta/react-native-drax/compare/v0.3.4...v0.3.5
