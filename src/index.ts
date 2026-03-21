// ── Namespace ────────────────────────────────────────────────────────
export { Drax } from './Drax';

// ── Public Components ────────────────────────────────────────────────
export { DraxHandle } from './DraxHandle';
export { DraxList } from './DraxList';
export { DraxProvider } from './DraxProvider';
export { DraxScrollView } from './DraxScrollView';
export { DraxView } from './DraxView';

// Sortable (list-agnostic)
export { SortableContainer } from './SortableContainer';
export { SortableItem } from './SortableItem';

// Cross-container sortable (board)
export { SortableBoardContainer } from './SortableBoardContainer';
export type { SortableBoardContainerProps } from './SortableBoardContainer';

// ── Public Hooks ─────────────────────────────────────────────────────
export { useDraxContext } from './hooks/useDraxContext';
export { useDraxId } from './hooks/useDraxId';
export { useDraxMethods } from './hooks/useDraxMethods';
export { useSortableList } from './hooks/useSortableList';
export { useSortableBoard } from './hooks/useSortableBoard';

// ── Public Utilities ─────────────────────────────────────────────────
export { snapToAlignment } from './math';
export type { SnapAlignment } from './math';

// ── Public Types ─────────────────────────────────────────────────────
export type {
  // Geometry
  Position,
  ViewDimensions,
  DraxViewMeasurements,

  // Drag events
  DraxDragEventData,
  DraxDragEndEventData,
  DraxDragWithReceiverEventData,
  DraxDragWithReceiverEndEventData,
  DraxMonitorEventData,
  DraxMonitorEndEventData,
  DraxMonitorDragDropEventData,
  DraxEventViewData,
  DraxEventDraggedViewData,
  DraxEventReceiverViewData,

  // View state & rendering
  DraxViewState,
  DraxTrackingStatus,
  DraxRenderContentProps,
  DraxRenderHoverContentProps,
  DraxStyleProp,
  DraxViewStyleProps,
  DraxViewRenderContent,
  DraxViewRenderHoverContent,

  // Snap
  DraxSnapbackTarget,
  DraxSnapData,
  DraxSnapEndEventData,

  // Collision
  CollisionAlgorithm,

  // Props
  DraxViewProps,
  DraxProviderProps,
  DraxProviderDragEvent,
  DraxScrollViewProps,
  DraxAutoScrollProps,

  // Sortable types
  UseSortableListOptions,
  SortableListHandle,
  SortableReorderEvent,
  SortableDragStartEvent,
  SortableDragPositionChangeEvent,
  SortableDragEndEvent,
  SortableReorderStrategy,
  SortableAnimationConfig,
  SortableAnimationPreset,
  SortableAnimationCustomConfig,
  SortableItemMeasurement,
  DropIndicatorProps,

  // Board types (cross-container sortable)
  UseSortableBoardOptions,
  SortableBoardHandle,
  SortableBoardTransferEvent,
} from './types';

export type { DraxListProps } from './DraxList';
export type { DraxHandleProps } from './DraxHandle';

export {
  // Enums
  DraxViewDragStatus,
  DraxViewReceiveStatus,
  DraxSnapbackTargetPreset,
  AutoScrollDirection,

  // Type guards
  isPosition,
} from './types';
