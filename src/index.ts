// ── Namespace ────────────────────────────────────────────────────────
export { Drax } from './Drax';

// ── Public Components ────────────────────────────────────────────────
export { DraxHandle } from './DraxHandle';
export { DraxProvider } from './DraxProvider';
export { DraxScrollView } from './DraxScrollView';
export { DraxView } from './DraxView';

// Sortable (list-agnostic)
export { SortableContainer } from './SortableContainer';
export { SortableItem } from './SortableItem';
export { DraxSortableList } from './DraxSortableList';

// Cross-container sortable (board)
export { SortableBoardContainer } from './SortableBoardContainer';
export type { SortableBoardContainerProps } from './SortableBoardContainer';

/** @deprecated Use `DraxSortableList`, `SortableContainer`, or `useSortableList` instead */
export { DraxList } from './DraxList';
/** @deprecated Use `SortableItem` instead */
export { DraxListItem } from './DraxListItem';

// ── Public Hooks ─────────────────────────────────────────────────────
export { useDraxContext } from './hooks/useDraxContext';
export { useDraxId } from './hooks/useDraxId';
export { useSortableList } from './hooks/useSortableList';
export { useSortableBoard } from './hooks/useSortableBoard';

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
  SortableItemMeasurement,
  DropIndicatorProps,

  // Board types (cross-container sortable)
  UseSortableBoardOptions,
  SortableBoardHandle,
  SortableBoardTransferEvent,

  // Legacy list types (deprecated)
  DraxListProps,
  DraxListDraggedItemData,
  DraxListOnItemDragStartEventData,
  DraxListOnItemDragPositionChangeEventData,
  DraxListOnItemDragEndEventData,
  DraxListOnItemReorderEventData,
  DraxListRenderItemContent,
  DraxListRenderItemHoverContent,
  DraxListOnItemReorder,
  DraxListItemProps,
} from './types';

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
