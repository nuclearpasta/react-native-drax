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
