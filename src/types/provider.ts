import type { ReactNode, RefObject } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import type { HostInstance } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type {
  DragPhase,
  DraxParentView,
  DraxViewMeasurements,
  Position,
  SpatialEntry,
} from './core';
import type { DraxViewProps } from './view';

// ─── View Registry (JS Thread) ─────────────────────────────────────────────

/** Flattened hover styles for the currently dragged view */
export interface FlattenedHoverStyles {
  hoverStyle: ViewStyle | null;
  hoverDraggingStyle: ViewStyle | null;
  hoverDraggingWithReceiverStyle: ViewStyle | null;
  hoverDraggingWithoutReceiverStyle: ViewStyle | null;
  hoverDragReleasedStyle: ViewStyle | null;
}

/** Entry in the JS-thread view registry Map */
export interface ViewRegistryEntry {
  id: string;
  parentId?: string;
  /** Index in the spatialIndexSV array */
  spatialIndex: number;
  /** Scroll position SharedValue, for scrollable parent views */
  scrollPosition?: SharedValue<Position>;
  /** Current measurements */
  measurements?: DraxViewMeasurements;
  /** All props from DraxView (callbacks, styles, payload, etc.) */
  props: DraxViewProps;
  /** Pre-flattened hover styles — computed at registration/prop-update time
   *  to avoid 5 StyleSheet.flatten calls in the drag-start hot path. */
  flattenedHoverStyles?: FlattenedHoverStyles;
}

// ─── Context Value ─────────────────────────────────────────────────────────

/** Context value used internally by Drax provider */
export interface DraxContextValue {
  // ── Split SharedValues (by update frequency) ───────────────────────
  /** Changes ~2x per drag. Read by all DraxView useAnimatedStyle. */
  draggedIdSV: SharedValue<string>;
  /** Changes ~3-5x per drag. Read by all DraxView useAnimatedStyle. */
  receiverIdSV: SharedValue<string>;
  /** Changes ~3x per drag. Read by all DraxView useAnimatedStyle. */
  dragPhaseSV: SharedValue<DragPhase>;
  /** Changes every frame during drag. Read ONLY by HoverLayer. */
  hoverPositionSV: SharedValue<Position>;
  /** Changes every frame during drag. Used by gesture worklet for hit-testing. */
  dragAbsolutePositionSV: SharedValue<Position>;
  /** ID of the most recently rejected receiver (cleared when drag leaves its bounds).
   *  Read by gesture worklet to skip re-detecting the same rejected receiver. */
  rejectedReceiverIdSV: SharedValue<string>;
  /** Changes on view mount/layout. Read by gesture worklet for hit-testing. */
  spatialIndexSV: SharedValue<SpatialEntry[]>;
  /** Changes during scroll. Indexed parallel to spatialIndex. */
  scrollOffsetsSV: SharedValue<Position[]>;
  /** Set once on drag start. */
  grabOffsetSV: SharedValue<Position>;
  /** Absolute position where drag started. */
  startPositionSV: SharedValue<Position>;
  /** Screen offset of the DraxProvider root view (for coordinate conversion). */
  rootOffsetSV: SharedValue<Position>;
  /** True after hover content is committed to DOM (set in HoverLayer useLayoutEffect).
   *  False after snap completes. Used by SortableItem for blink-free visibility. */
  hoverReadySV: SharedValue<boolean>;
  /** Set to true by SortableContainer.finalizeDrag when a reorder commit is in-flight.
   *  Checked by onSnapComplete to skip immediate hover clearing — the clearing is
   *  deferred to useSortableList's useLayoutEffect (after FlatList re-render). */
  hoverClearDeferredRef: { current: boolean };
  /** Animated hover content dimensions for cross-container transfer.
   *  x = width, y = height. {0,0} = no constraint (natural size). */
  hoverDimsSV: SharedValue<Position>;
  /** Drag lock — false during snap animation. Blocks new gesture activation on UI thread. */
  isDragAllowedSV: SharedValue<boolean>;

  // ── Registry methods (JS thread) ───────────────────────────────────
  registerView: (payload: RegisterViewPayload) => void;
  unregisterView: (id: string) => void;
  updateMeasurements: (id: string, measurements: DraxViewMeasurements) => void;
  updateScrollOffset: (id: string, offset: Position) => void;
  updateViewProps: (id: string, props: DraxViewProps) => void;
  getViewEntry: (id: string) => ViewRegistryEntry | undefined;

  // ── Callback dispatch (JS thread, called via scheduleOnRN from gesture) ─
  handleDragStart: (
    draggedId: string,
    absolutePosition: Position,
    grabOffset: Position
  ) => void;
  handleReceiverChange: (
    oldReceiverId: string,
    newReceiverId: string,
    absolutePosition: Position,
    draggedId: string,
    startPosition: Position,
    grabOffset: Position,
    monitorIds?: string[]
  ) => void;
  handleDragEnd: (
    draggedId: string,
    receiverId: string,
    cancelled: boolean,
    finalMonitorIds?: string[]
  ) => void;

  // ── Hover content ──────────────────────────────────────────────────
  setHoverContent: (content: ReactNode | null) => void;

  // ── Dropped items tracking ─────────────────────────────────────────
  /** Map of receiverId → Set of draggedIds that have been dropped on it */
  droppedItemsRef: RefObject<Map<string, Set<string>>>;

  // ── View refs ──────────────────────────────────────────────────────
  rootViewRef: { current: HostInstance | null };
  parent?: DraxParentView;
}

/** Payload for registering a Drax view */
export interface RegisterViewPayload {
  id: string;
  parentId?: string;
  scrollPosition?: SharedValue<Position>;
  props: DraxViewProps;
}

// ─── Provider / Subprovider Props ──────────────────────────────────────────

/** Event data for provider-level drag callbacks */
export interface DraxProviderDragEvent {
  draggedId: string;
  receiverId?: string;
  position: Position;
}

/** Optional props that can be passed to a DraxProvider */
export interface DraxProviderProps {
  style?: StyleProp<ViewStyle>;
  debug?: boolean;
  /** Called when any drag starts */
  onDragStart?: (event: DraxProviderDragEvent) => void;
  /** Called on every gesture update during any drag */
  onDrag?: (event: DraxProviderDragEvent) => void;
  /** Called when any drag ends (drop or cancel) */
  onDragEnd?: (event: DraxProviderDragEvent & { cancelled: boolean }) => void;
  children?: ReactNode;
}

/** Props that are passed to a DraxSubprovider */
export interface DraxSubproviderProps {
  parent: DraxParentView;
}

// ─── Auto-scroll Types ─────────────────────────────────────────────────────

/** Auto-scroll direction used internally by DraxScrollView and DraxList */
export enum AutoScrollDirection {
  Back = -1,
  None = 0,
  Forward = 1,
}

/** Auto-scroll state used internally by DraxScrollView */
export interface AutoScrollState {
  x: AutoScrollDirection;
  y: AutoScrollDirection;
}

/** Props for auto-scroll options */
export interface DraxAutoScrollProps {
  autoScrollIntervalLength?: number;
  autoScrollJumpRatio?: number;
  autoScrollBackThreshold?: number;
  autoScrollForwardThreshold?: number;
}

// ─── ScrollView Props ──────────────────────────────────────────────────────

/** Props for a DraxScrollView */
export interface DraxScrollViewProps
  extends ScrollViewProps, DraxAutoScrollProps {
  id?: string;
}
