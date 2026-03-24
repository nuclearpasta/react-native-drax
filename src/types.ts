import type { ReactNode, RefObject } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
  StyleProp,
  ViewProps,
  ViewStyle,
} from 'react-native';
import type { HostInstance } from 'react-native';
import type {
  AnimatedStyle,
  EntryOrExitLayoutType,
  SharedValue,
} from 'react-native-reanimated';

// ─── Core Geometry Types ───────────────────────────────────────────────────

/** An xy-coordinate position value */
export interface Position {
  // Index signature required for Reanimated AnimatableValue compatibility
  [k: string]: number;
  x: number;
  y: number;
}

/** Predicate for checking if something is a Position */
export const isPosition = (something: unknown): something is Position =>
  typeof something === 'object' &&
  something !== null &&
  'x' in something &&
  'y' in something &&
  typeof something.x === 'number' &&
  typeof something.y === 'number';

/** Dimensions of a view */
export interface ViewDimensions {
  width: number;
  height: number;
}

/** Grid span for a sortable item (columns and rows it occupies) */
export interface GridItemSpan {
  /** Number of columns this item spans. @default 1 */
  colSpan: number;
  /** Number of rows this item spans. @default 1 */
  rowSpan: number;
}

/** Measurements of a Drax view for bounds checking purposes */
export interface DraxViewMeasurements extends Position, ViewDimensions {
  /** 1 when DraxView auto-detected transform-based positioning
   *  (e.g., LegendList) and used visual measurement instead of Yoga layout. 0 otherwise. */
  _transformDetected: number;
}

// ─── Drag Phase & Status Types ─────────────────────────────────────────────

/** Phase of a drag operation — drives all animated styles */
export type DragPhase = 'idle' | 'dragging' | 'releasing';

/** The states a dragged view can be in */
export enum DraxViewDragStatus {
  Inactive,
  Dragging,
  Released,
}

/** The states a receiver view can be in */
export enum DraxViewReceiveStatus {
  Inactive,
  Receiving,
}

// ─── Collision Algorithm ────────────────────────────────────────────────────

/** Algorithm used to determine if a dragged view is over a receiver */
export type CollisionAlgorithm = 'center' | 'intersect' | 'contain';

// ─── Spatial Index (SharedValue, UI Thread) ────────────────────────────────

/** Entry in the spatial index SharedValue, accessed from worklets for hit-testing */
export interface SpatialEntry {
  /** View unique identifier */
  id: string;
  /** Position relative to parent */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Index of parent in the spatial index array, -1 if root */
  parentIndex: number;
  /** Can this view receive drags? */
  receptive: boolean;
  /** Can this view monitor drags? */
  monitoring: boolean;
  /** Can this view be dragged? */
  draggable: boolean;
  /** If true, this view will not receive drags from its own children */
  rejectOwnChildren: boolean;
  /** Collision algorithm for receiving: 'center' (default), 'intersect', or 'contain' */
  collisionAlgorithm: CollisionAlgorithm;
}

/** Result of a UI-thread hit test */
export interface HitTestResult {
  receiverId: string;
  monitorIds: string[];
}

// ─── Event Data Types (Public API) ─────────────────────────────────────────

/** Data about a view involved in a Drax event */
export interface DraxEventViewData {
  id: string;
  parentId?: string;
  payload: unknown;
  measurements?: DraxViewMeasurements;
}

/** Data about a dragged view involved in a Drax event */
export interface DraxEventDraggedViewData extends DraxEventViewData {
  dragTranslationRatio: Position;
  dragOffset: Position;
  grabOffset: Position;
  grabOffsetRatio: Position;
  hoverPosition: Position;
}

/** Data about a receiver view involved in a Drax event */
export interface DraxEventReceiverViewData extends DraxEventViewData {
  receiveOffset: Position;
  receiveOffsetRatio: Position;
}

/** Data about a Drax drag event */
export interface DraxDragEventData {
  dragAbsolutePosition: Position;
  dragTranslation: Position;
  dragged: DraxEventDraggedViewData;
}

/** Supplemental type for adding a cancelled flag */
export interface WithCancelledFlag {
  cancelled: boolean;
}

/** Predicate for checking if something has a cancelled flag */
export const isWithCancelledFlag = (
  something: unknown
): something is WithCancelledFlag =>
  typeof something === 'object' &&
  something !== null &&
  'cancelled' in something &&
  typeof something.cancelled === 'boolean';

/** Data about a Drax drag end event */
export interface DraxDragEndEventData
  extends DraxDragEventData, WithCancelledFlag {}

/** Data about a Drax drag event that involves a receiver */
export interface DraxDragWithReceiverEventData extends DraxDragEventData {
  receiver: DraxEventReceiverViewData;
}

/** Data about a Drax drag/receive end event */
export interface DraxDragWithReceiverEndEventData
  extends DraxDragWithReceiverEventData, WithCancelledFlag {}

/** Data about a Drax monitor event */
export interface DraxMonitorEventData extends DraxDragEventData {
  receiver?: DraxEventReceiverViewData;
  monitorOffset: Position;
  monitorOffsetRatio: Position;
}

/** Data about a Drax monitor drag end event */
export interface DraxMonitorEndEventData
  extends DraxMonitorEventData, WithCancelledFlag {}

/** Data about a Drax monitor drag-drop event */
export interface DraxMonitorDragDropEventData extends Required<DraxMonitorEventData> {}

// ─── Snap Types ────────────────────────────────────────────────────────────

/** Preset values for specifying snap targets without a Position */
export enum DraxSnapbackTargetPreset {
  Default,
  None,
}

/** Target for snap hover view release animation: none, default, or specified Position */
export type DraxSnapbackTarget = DraxSnapbackTargetPreset | Position;

/** Response type for drag end callbacks, allowing override of default release snap behavior */
export type DraxProtocolDragEndResponse = void | DraxSnapbackTarget;

/** Data about a Drax snap, used for custom animations */
export interface DraxSnapData {
  hoverPosition: SharedValue<Position>;
  toValue: Position;
  delay: number;
  duration: number;
  scrollPosition?: SharedValue<Position>;
  finishedCallback: (finished: boolean) => void;
}

/** Data passed to onSnapEnd and onReceiveSnapEnd callbacks */
export interface DraxSnapEndEventData {
  dragged: { id: string; parentId?: string; payload: unknown };
  receiver?: { id: string; parentId?: string; payload: unknown };
}

// ─── Render Content Props ──────────────────────────────────────────────────

/** Simplified view state for render content props */
export interface DraxViewState {
  dragStatus: DraxViewDragStatus;
  receiveStatus: DraxViewReceiveStatus;
  dragAbsolutePosition?: Position;
  dragTranslation?: Position;
  dragTranslationRatio?: Position;
  dragOffset?: Position;
  grabOffset?: Position;
  grabOffsetRatio?: Position;
  draggingOverReceiver?: DraxEventViewData;
  receiveOffset?: Position;
  receiveOffsetRatio?: Position;
  receivingDrag?: DraxEventViewData;
}

/** Tracking status indicating whether anything is being dragged/received */
export interface DraxTrackingStatus {
  dragging: boolean;
  receiving: boolean;
}

/** Props provided to a render function for a Drax view */
export interface DraxRenderContentProps {
  viewState?: DraxViewState;
  trackingStatus?: DraxTrackingStatus;
  hover: boolean;
  children: ReactNode;
  dimensions?: ViewDimensions;
}

/** Props provided to a render function for a hovering copy of a Drax view */
export interface DraxRenderHoverContentProps extends DraxRenderContentProps {}

// ─── Style Types ───────────────────────────────────────────────────────────

/** Style prop for DraxView drag/receive states (flattened for worklets) */
export type DraxStyleProp = StyleProp<ViewStyle>;

/** Style prop for hover views (supports animated styles) */
export type AnimatedViewStylePropWithoutLayout =
  | StyleProp<ViewStyle>
  | StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;

/** Style-related props for a Drax view */
export interface DraxViewStyleProps {
  style?: DraxStyleProp;
  dragInactiveStyle?: DraxStyleProp;
  draggingStyle?: DraxStyleProp;
  draggingWithReceiverStyle?: DraxStyleProp;
  draggingWithoutReceiverStyle?: DraxStyleProp;
  dragReleasedStyle?: DraxStyleProp;
  hoverStyle?: AnimatedViewStylePropWithoutLayout;
  hoverDraggingStyle?: AnimatedViewStylePropWithoutLayout;
  hoverDraggingWithReceiverStyle?: AnimatedViewStylePropWithoutLayout;
  hoverDraggingWithoutReceiverStyle?: AnimatedViewStylePropWithoutLayout;
  hoverDragReleasedStyle?: AnimatedViewStylePropWithoutLayout;
  receiverInactiveStyle?: DraxStyleProp;
  receivingStyle?: DraxStyleProp;
  otherDraggingStyle?: DraxStyleProp;
  otherDraggingWithReceiverStyle?: DraxStyleProp;
  otherDraggingWithoutReceiverStyle?: DraxStyleProp;
}

// ─── Custom render functions ───────────────────────────────────────────────

/** Custom render function for content of a DraxView */
export interface DraxViewRenderContent {
  (props: DraxRenderContentProps): ReactNode;
}

/** Custom render function for content of hovering copy of a DraxView */
export interface DraxViewRenderHoverContent {
  (props: DraxRenderHoverContentProps): ReactNode;
}

// ─── View Props ────────────────────────────────────────────────────────────

/** Props for a DraxView */
export interface DraxViewProps
  extends Omit<ViewProps, 'style'>, DraxViewStyleProps {
  /** Custom render function for content of this view */
  renderContent?: DraxViewRenderContent;
  /** Custom render function for content of hovering copy of this view, defaults to renderContent */
  renderHoverContent?: DraxViewRenderHoverContent;
  /** If true, do not render hover view copies for this view when dragging */
  noHover?: boolean;
  /** For external registration of this view, to access internal methods */
  registration?: (registration: DraxViewRegistration | undefined) => void;
  /** For receiving view measurements externally */
  onMeasure?: DraxViewMeasurementHandler;
  /** Unique Drax view id, auto-generated if omitted */
  id?: string;
  /** Drax parent view, if nesting */
  parent?: DraxParentView;
  /** If true, treat this view as a Drax parent view for nested children */
  isParent?: boolean;
  /** Used internally - The view's scroll position, if it is a scrollable parent view */
  scrollPosition?: SharedValue<Position>;
  /** Time in milliseconds view needs to be pressed before drag starts */
  longPressDelay?: number;
  /** Cancel drag activation if finger moves more than this distance (px).
   *  Prevents accidental drags when the user is trying to scroll.
   *  Can be a number (symmetric) or [min, max] tuple per axis. */
  dragActivationFailOffset?: number;

  /** Hint that this view is inside a horizontal scroll container.
   *  On mobile web, sets `touch-action: pan-x` so the browser allows
   *  native horizontal scrolling before the long-press activates drag.
   *  Without this, items in horizontal lists default to `pan-y` which
   *  blocks horizontal scrolling on touch devices. */
  scrollHorizontal?: boolean;

  // ─── Callback props (formerly in DraxProtocol) ─────────────────────

  /** A function that can be used to conditionally enable or disable receiving */
  dynamicReceptiveCallback?: (data: {
    targetId: string;
    targetMeasurements: DraxViewMeasurements;
    draggedId: string;
    draggedPayload: unknown;
  }) => boolean;

  /** Simpler convenience prop for conditional drop acceptance based on payload */
  acceptsDrag?: (draggedPayload: unknown) => boolean;
  /** Maximum number of items this view can receive. Drops are auto-rejected
   *  when at capacity. Requires DraxProvider to track dropped items centrally. */
  capacity?: number;

  /** Called in the dragged view when a drag action begins */
  onDragStart?: (data: DraxDragEventData) => void;
  /** Called in the dragged view repeatedly while dragged, not over any receiver */
  onDrag?: (data: DraxDragEventData) => void;
  /** Called in the dragged view when initially dragged over a new receiver */
  onDragEnter?: (data: DraxDragWithReceiverEventData) => void;
  /** Called in the dragged view repeatedly while dragged over a receiver */
  onDragOver?: (data: DraxDragWithReceiverEventData) => void;
  /** Called in the dragged view when dragged off of a receiver */
  onDragExit?: (data: DraxDragWithReceiverEventData) => void;
  /** Called in the dragged view when drag ends not over any receiver or is cancelled */
  onDragEnd?: (data: DraxDragEndEventData) => DraxProtocolDragEndResponse;
  /** Called in the dragged view when drag ends over a receiver */
  onDragDrop?: (
    data: DraxDragWithReceiverEventData
  ) => DraxProtocolDragEndResponse;
  /** Called in the dragged view when drag release snap ends */
  onSnapEnd?: (data: DraxSnapEndEventData) => void;
  /** Called in the receiver view when drag release snap ends */
  onReceiveSnapEnd?: (data: DraxSnapEndEventData) => void;
  /** Called in the receiver view each time an item is initially dragged over it */
  onReceiveDragEnter?: (data: DraxDragWithReceiverEventData) => void;
  /** Called in the receiver view repeatedly while an item is dragged over it */
  onReceiveDragOver?: (data: DraxDragWithReceiverEventData) => void;
  /** Called in the receiver view when item is dragged off of it or drag is cancelled */
  onReceiveDragExit?: (data: DraxDragWithReceiverEndEventData) => void;
  /** Called in the receiver view when drag ends over it */
  onReceiveDragDrop?: (
    data: DraxDragWithReceiverEventData
  ) => DraxProtocolDragEndResponse;
  /** Called in the monitor view when a drag action begins over it */
  onMonitorDragStart?: (data: DraxMonitorEventData) => void;
  /** Called in the monitor view each time an item is initially dragged over it */
  onMonitorDragEnter?: (data: DraxMonitorEventData) => void;
  /** Called in the monitor view repeatedly while an item is dragged over it */
  onMonitorDragOver?: (data: DraxMonitorEventData) => void;
  /** Called in the monitor view when item is dragged off of it */
  onMonitorDragExit?: (data: DraxMonitorEventData) => void;
  /** Called in the monitor view when drag ends over it while not over any receiver or drag is cancelled */
  onMonitorDragEnd?: (
    data: DraxMonitorEndEventData
  ) => DraxProtocolDragEndResponse;
  /** Called in the monitor view when drag ends over it while over a receiver */
  onMonitorDragDrop?: (
    data: DraxMonitorDragDropEventData
  ) => DraxProtocolDragEndResponse;

  /** Whether or not to animate hover view snap after drag release, defaults to true */
  animateSnap?: boolean;
  /** Delay in ms before hover view snap begins after drag is released */
  snapDelay?: number;
  /** Duration in ms for hover view snap to complete */
  snapDuration?: number;
  /** Function returning custom hover view snap animation */
  snapAnimator?: (data: DraxSnapData) => void;

  /** Payload that will be delivered to receiver views when this view is dragged; overrides `payload` */
  dragPayload?: unknown;
  /** Payload that will be delivered to dragged views when this view receives them; overrides `payload` */
  receiverPayload?: unknown;
  /** Convenience prop to provide one value for both `dragPayload` and `receiverPayload` */
  payload?: unknown;

  /** Whether the view can be dragged */
  draggable?: boolean;
  /** Whether the view can receive drags */
  receptive?: boolean;
  /** Whether the view can monitor drags */
  monitoring?: boolean;
  /** If true, this view will not receive drags from its own children */
  rejectOwnChildren?: boolean;
  /** @deprecated No longer needed — hover measurements are handled automatically */
  disableHoverViewMeasurementsOnLayout?: boolean;
  /** If true, lock drag's x-position */
  lockDragXPosition?: boolean;
  /** If true, lock drag's y position */
  lockDragYPosition?: boolean;
  /** When true, drag is only activated via a descendant DraxHandle component */
  dragHandle?: boolean;
  /** Collision algorithm for receiving drags: 'center' (default), 'intersect', or 'contain' */
  collisionAlgorithm?: CollisionAlgorithm;
  /** Ref to a View that constrains the drag area. The dragged view will be clamped within these bounds. */
  dragBoundsRef?: RefObject<any>;
}

// ─── View Registry (JS Thread) ─────────────────────────────────────────────

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

  // ── Registry methods (JS thread) ───────────────────────────────────
  registerView: (payload: RegisterViewPayload) => void;
  unregisterView: (id: string) => void;
  updateMeasurements: (id: string, measurements: DraxViewMeasurements) => void;
  updateScrollOffset: (id: string, offset: Position) => void;
  updateViewProps: (id: string, props: DraxViewProps) => void;
  getViewEntry: (id: string) => ViewRegistryEntry | undefined;

  // ── Callback dispatch (JS thread, called via runOnJS from gesture) ─
  handleDragStart: (
    draggedId: string,
    absolutePosition: Position,
    grabOffset: Position
  ) => void;
  handleReceiverChange: (
    oldReceiverId: string,
    newReceiverId: string,
    absolutePosition: Position,
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

// ─── External Registration ─────────────────────────────────────────────────

/** Methods provided by a DraxView when registered externally */
export interface DraxViewRegistration {
  id: string;
  measure: (measurementHandler?: DraxViewMeasurementHandler) => void;
}

/** Information about the parent of a nested DraxView */
export interface DraxParentView {
  id: string;
  /** Any ref-like object with a .current holding a native view instance.
   *  Accepts both React.RefObject and Reanimated.AnimatedRef. */
  viewRef: { current: any };
  /** When true, measureLayout returns content-relative positions on native
   *  (scroll offset should NOT be added). */
  isScrollContainer?: boolean;
}

/** Function that receives a Drax view measurement */
export interface DraxViewMeasurementHandler {
  (measurements: DraxViewMeasurements | undefined): void;
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

// ─── Sortable Types (List-Agnostic) ─────────────────────────────────────────

/** Reorder strategy for sortable lists */
export type SortableReorderStrategy = 'insert' | 'swap';

/** Named animation preset for sortable item shift animations */
export type SortableAnimationPreset = 'default' | 'spring' | 'gentle' | 'snappy' | 'none';

/** Custom animation configuration for sortable item shifts */
export interface SortableAnimationCustomConfig {
  /** Duration in ms for timing-based animations. Ignored when useSpring is true. @default 200 */
  shiftDuration?: number;
  /** Use spring physics instead of timing. @default false */
  useSpring?: boolean;
  /** Spring damping. @default 15 */
  springDamping?: number;
  /** Spring stiffness. @default 150 */
  springStiffness?: number;
  /** Spring mass. @default 1 */
  springMass?: number;
}

/** Animation configuration: a preset name or custom config object */
export type SortableAnimationConfig = SortableAnimationPreset | SortableAnimationCustomConfig;

/** Measurement for a single sortable item, keyed by item key */
export interface SortableItemMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
  key: string;
  /** Current display index (updated on reorder) */
  index: number;
  /** Scroll offset at the time this measurement was taken */
  scrollAtMeasure: Position;
}

/** Internal payload attached to each SortableItem's DraxView */
export interface SortableItemPayload {
  index: number;
  originalIndex: number;
}

/** Type guard for SortableItemPayload */
export function isSortableItemPayload(value: unknown): value is SortableItemPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'index' in value &&
    'originalIndex' in value &&
    typeof value.index === 'number' &&
    typeof value.originalIndex === 'number'
  );
}

/** Event data for sortable drag start */
export interface SortableDragStartEvent<T> {
  index: number;
  item: T;
}

/** Event data for sortable drag position change */
export interface SortableDragPositionChangeEvent<T> {
  index: number;
  item: T;
  toIndex: number | undefined;
  previousIndex: number | undefined;
}

/** Event data for sortable drag end */
export interface SortableDragEndEvent<T> {
  index: number;
  item: T;
  toIndex: number | undefined;
  cancelled: boolean;
}

/** Event data for sortable item reorder */
export interface SortableReorderEvent<T> {
  data: T[];
  fromIndex: number;
  toIndex: number;
  fromItem: T;
  toItem: T;
  isExternalDrag: boolean;
}

/** Props for rendering a drop indicator in a sortable container */
export interface DropIndicatorProps {
  /** Whether the indicator should be visible */
  visible: boolean;
  /** Whether the list is horizontal */
  horizontal: boolean;
  /** Width of the gap slot */
  width: number;
  /** Height of the gap slot */
  height: number;
  /** Display index where the gap is (dragged item's current slot) */
  index: number;
  /** Total number of items in the list (including the dragged item) */
  itemCount: number;
  /** Whether this is a cross-container phantom (item coming from another list) */
  isPhantom: boolean;
}

/** Return type of computeGapPosition — position + dimensions of the visual gap */
export interface GapPositionResult {
  /** View-relative X position of the gap */
  x: number;
  /** View-relative Y position of the gap */
  y: number;
  /** Width of the gap slot */
  width: number;
  /** Height of the gap slot */
  height: number;
  /** Display index of the gap */
  index: number;
  /** Whether the gap is a phantom (cross-container) */
  isPhantom: boolean;
}

/** Options for useSortableList hook */
export interface UseSortableListOptions<T> {
  /** Optional explicit DraxView id for the container */
  id?: string;
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (event: SortableReorderEvent<T>) => void;
  /** List layout direction. @default false */
  horizontal?: boolean;
  /** Number of columns for grid layout. @default 1 */
  numColumns?: number;
  /** Reorder strategy. @default 'insert' */
  reorderStrategy?: SortableReorderStrategy;
  /** Long press delay before drag starts in ms. @default 250 */
  longPressDelay?: number;
  /** Lock item drags to the list's main axis. @default false */
  lockToMainAxis?: boolean;
  /** Auto-scroll jump distance as fraction of container size. @default 0.2 */
  autoScrollJumpRatio?: number;
  /** Drag position threshold for back auto-scroll. @default 0.1 */
  autoScrollBackThreshold?: number;
  /** Drag position threshold for forward auto-scroll. @default 0.9 */
  autoScrollForwardThreshold?: number;
  /** Animation config for item shift animations. @default 'default' */
  animationConfig?: SortableAnimationConfig;
  /** Returns the grid span for an item. Enables non-uniform grid layout
   *  where items can span multiple columns and/or rows.
   *  Only used when numColumns > 1. */
  getItemSpan?: (item: T, index: number) => GridItemSpan;
  /** Style applied to all non-dragged items while a drag is active.
   *  Use for dimming/scaling inactive items (e.g., `{ opacity: 0.5 }`). */
  inactiveItemStyle?: ViewStyle;
  /** Reanimated layout animation for items entering the list (e.g., `FadeIn`). */
  itemEntering?: EntryOrExitLayoutType;
  /** Reanimated layout animation for items exiting the list (e.g., `FadeOut`). */
  itemExiting?: EntryOrExitLayoutType;
  /** Callback when drag starts */
  onDragStart?: (event: SortableDragStartEvent<T>) => void;
  /** Callback when drag position (index) changes */
  onDragPositionChange?: (event: SortableDragPositionChangeEvent<T>) => void;
  /** Callback when drag ends */
  onDragEnd?: (event: SortableDragEndEvent<T>) => void;
}

/** Handle returned by useSortableList — pass to SortableContainer and SortableItem */
export interface SortableListHandle<T> {
  /** Reordered data to pass to your list component */
  data: T[];
  /** Wire to your list's onScroll prop */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Wire to your list's onContentSizeChange prop */
  onContentSizeChange: (width: number, height: number) => void;
  /** Stable index-based keyExtractor — prevents FlatList cell unmounting on reorder */
  stableKeyExtractor: (item: T, index: number) => string;
  /** Internal state — consumed by SortableContainer and SortableItem */
  _internal: SortableListInternal<T>;
}

/** Internal state of the sortable list (not part of public API contract) */
export interface SortableListInternal<T> {
  id: string;
  horizontal: boolean;
  numColumns: number;
  reorderStrategy: SortableReorderStrategy;
  longPressDelay: number;
  lockToMainAxis: boolean;
  animationConfig: SortableAnimationConfig;
  /** Returns the grid span for an item (non-uniform grid layout) */
  getItemSpan?: (item: T, index: number) => GridItemSpan;
  inactiveItemStyle?: ViewStyle;
  itemEntering?: EntryOrExitLayoutType;
  itemExiting?: EntryOrExitLayoutType;
  /** Set of item keys that are fixed (cannot be dragged or displaced) */
  fixedKeys: RefObject<Set<string>>;
  draggedItem: SharedValue<number | undefined>;
  itemMeasurements: RefObject<Map<string, SortableItemMeasurement>>;
  originalIndexes: number[];
  keyExtractor: (item: T, index: number) => string;
  data: T[];
  rawData: T[];
  /** Move the dragged item to a new display index (live reorder during drag).
   *  Returns true if the move was performed, false if skipped (no-op). */
  moveDraggedItem: (toDisplayIndex: number) => boolean;
  /** Get the snapback target for the dragged item's current position */
  getSnapbackTarget: () => DraxSnapbackTarget;
  setDraggedItem: (index: number) => void;
  resetDraggedItem: () => void;
  scrollPosition: SharedValue<Position>;
  containerMeasurementsRef: RefObject<DraxViewMeasurements | undefined>;
  contentSizeRef: RefObject<Position | undefined>;
  autoScrollJumpRatio: number;
  autoScrollBackThreshold: number;
  autoScrollForwardThreshold: number;
  /** Callbacks from options, stored for SortableContainer to invoke */
  onDragStart?: (event: SortableDragStartEvent<T>) => void;
  onDragPositionChange?: (event: SortableDragPositionChangeEvent<T>) => void;
  onDragEnd?: (event: SortableDragEndEvent<T>) => void;
  onReorder: (event: SortableReorderEvent<T>) => void;
  getMeasurementByOriginalIndex: (originalIndex: number) => SortableItemMeasurement | undefined;
  /** Position of the drop indicator (animated) */
  dropTargetPositionSV: SharedValue<Position>;
  /** Dimensions of the drop indicator gap (animated, {x: width, y: height}) */
  dropTargetDimsSV: SharedValue<Position>;
  /** Whether the drop indicator is visible (animated) */
  dropTargetVisibleSV: SharedValue<boolean>;
  /** Called by SortableItem's onSnapEnd to finalize the drag.
   *  Stored as a ref so the latest finalizeDrag is always called,
   *  even if SortableItem has a stale _internal reference. */
  onItemSnapEnd?: () => void;
  /** Current display index of the dragged item (updated during live reorder) */
  draggedDisplayIndexRef: RefObject<number | undefined>;
  /** Original display index where the drag started */
  dragStartIndexRef: RefObject<number | undefined>;
  /** Per-item shift transforms keyed by item key (UI thread) */
  shiftsRef: SharedValue<Record<string, Position>>;
  /** When true, SortableItem clears shift transforms instantly (no animation) */
  instantClearSV: SharedValue<boolean>;
  /** When false, SortableItem ignores shifts entirely (treats as 0).
   *  Set to false SYNCHRONOUSLY in useLayoutEffect when rawData changes,
   *  so the animated style reads it in the same UI frame as the Fabric commit.
   *  This prevents the 1-frame blink where cells show new content but stale shifts. */
  shiftsValidSV: SharedValue<boolean>;
  /** Initialize pending order from current originalIndexes at drag start */
  initPendingOrder: () => void;
  /** Store committed visual order after drag (permanent shifts, no data change) */
  commitVisualOrder: () => void;
  /** Flush permanent shifts: sync stableData to rawData and clear shifts.
   *  Restores touch hit testing after permanent shifts. */
  flushVisualOrder: () => void;
  /** Compute shifts for a given order. Returns undefined if measurements missing. */
  computeShiftsForOrder: (
    order: number[],
    skipIndex?: number,
    phantom?: SortablePhantomSlot,
  ) => Record<string, Position> | undefined;
  /** Committed visual order from last completed drag (indices into rawData) */
  committedOrderRef: RefObject<number[]>;
  /** Pending order ref (indices into rawData) */
  pendingOrderRef: RefObject<number[]>;
  /** Cancel drag without reorder — reverts to committed shifts */
  cancelDrag: () => void;
  /** Compute target display index from a container-local content position */
  getSlotFromPosition: (contentPos: Position) => number;
  /** Compute view-relative position and dimensions of the visual gap (for drop indicator) */
  computeGapPosition: () => GapPositionResult | undefined;
  /** Update the drop indicator position (set by SortableContainer) */
  updateDropIndicator?: () => void;
  /** Current phantom slot (cross-container drag) */
  phantomRef: RefObject<SortablePhantomSlot | undefined>;
  /** Reserve space for an incoming item at the given display index */
  setPhantomSlot: (atDisplayIndex: number, width: number, height: number) => void;
  /** Remove phantom slot, items shift back */
  clearPhantomSlot: () => void;
  /** Remove the dragged item from pending order — items close the gap */
  ejectDraggedItem: () => void;
  /** Re-add a previously ejected item into pending order at the given display index */
  reinjectDraggedItem: (displayIndex: number, originalIndex: number) => void;
  /** Get snap target position for the current phantom slot */
  getPhantomSnapTarget: () => DraxSnapbackTarget;
  /** Off-screen shifts for transferred items (persist across shift recalculations) */
  ghostShiftsRef: RefObject<Record<string, Position>>;
  /** Committed shifts from last completed drag (for cancel revert) */
  committedShiftsRef: RefObject<Record<string, Position>>;
  /** When true, the next useLayoutEffect RESET skips sync shiftsValidSV=false */
  skipShiftsInvalidationRef: RefObject<boolean>;
}

// ─── Board Types (Cross-Container Sortable) ──────────────────────────────

/** Phantom slot for cross-container drag: virtual space in target column */
export interface SortablePhantomSlot {
  atDisplayIndex: number;
  width: number;
  height: number;
}

/** Event data for cross-container item transfer */
export interface SortableBoardTransferEvent<TItem> {
  item: TItem;
  fromContainerId: string;
  fromIndex: number;
  toContainerId: string;
  toIndex: number;
}

/** Options for useSortableBoard hook */
export interface UseSortableBoardOptions<TItem> {
  keyExtractor: (item: TItem) => string;
  onTransfer: (event: SortableBoardTransferEvent<TItem>) => void;
}

/** Handle returned by useSortableBoard — pass to SortableBoardContainer */
export interface SortableBoardHandle<TItem> {
  _internal: SortableBoardInternal<TItem>;
}

/** Transfer state during cross-container drag */
export interface SortableBoardTransferState {
  sourceId: string;
  sourceOriginalIndex: number;
  itemKey: string;
  itemDimensions: ViewDimensions;
  dragStartIndex: number;
  targetId?: string;
  targetSlot?: number;
}

/** Internal state of the sortable board (not part of public API contract) */
export interface SortableBoardInternal<TItem> {
  keyExtractor: (item: TItem) => string;
  onTransfer: (event: SortableBoardTransferEvent<TItem>) => void;
  columns: Map<string, SortableListInternal<unknown>>;
  registerColumn: (id: string, internal: SortableListInternal<unknown>) => void;
  unregisterColumn: (id: string) => void;
  transferState: RefObject<SortableBoardTransferState | undefined>;
  /** Set by SortableBoardContainer — handles cross-container transfer finalization */
  finalizeTransfer?: () => void;
}

/** Context value for board coordination.
 *  Uses Pick to avoid generic variance issues — consumers only need
 *  transferState and finalizeTransfer, not typed item fields. */
export interface SortableBoardContextValue {
  registerColumn: (id: string, internal: SortableListInternal<unknown>) => void;
  unregisterColumn: (id: string) => void;
  boardInternal: SortableBoardInternal<unknown>;
}

// ─── Utility Types ─────────────────────────────────────────────────────────


