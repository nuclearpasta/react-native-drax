import type { ReactNode, RefObject } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import type { AnimatedStyle, SharedValue } from 'react-native-reanimated';

import type {
  CollisionAlgorithm,
  DraxViewMeasurementHandler,
  DraxViewMeasurements,
  DraxViewRegistration,
  DraxParentView,
  Position,
  ViewDimensions,
} from './core';
import type { DraxViewDragStatus, DraxViewReceiveStatus } from './core';
import type {
  DraxDragEndEventData,
  DraxDragEventData,
  DraxDragWithReceiverEndEventData,
  DraxDragWithReceiverEventData,
  DraxEventViewData,
  DraxMonitorDragDropEventData,
  DraxMonitorEndEventData,
  DraxMonitorEventData,
  DraxProtocolDragEndResponse,
  DraxSnapData,
  DraxSnapEndEventData,
} from './events';

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
  /** Internal: worklet config for UI-thread slot detection (set by DraxList) */
  sortableWorklet?: unknown;
  /** Collision algorithm for receiving drags: 'center' (default), 'intersect', or 'contain' */
  collisionAlgorithm?: CollisionAlgorithm;
  /** Ref to a View that constrains the drag area. The dragged view will be clamped within these bounds. */
  dragBoundsRef?: RefObject<any>;
}
