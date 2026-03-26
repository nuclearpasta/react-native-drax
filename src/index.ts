// ── Namespace ────────────────────────────────────────────────────────
export { Drax } from './Drax';

// ── Public Components ────────────────────────────────────────────────
export { DraxHandle } from './DraxHandle';
export { DraxList } from './DraxList';
export { DraxProvider } from './DraxProvider';
export { DraxScrollView } from './DraxScrollView';
export { DraxView } from './DraxView';

// ── Public Components (Board) ────────────────────────────────────────
export { SortableBoardContainer } from './SortableBoardContainer';
export type { SortableBoardContainerProps } from './SortableBoardContainer';

// ── Public Hooks ─────────────────────────────────────────────────────
export { useDraxContext } from './hooks/useDraxContext';
export { useDraxId } from './hooks/useDraxId';
export { useDraxMethods } from './hooks/useDraxMethods';
export { useSortableList } from './hooks/useSortableList';
export { useSortableBoard } from './hooks/useSortableBoard';

// ── Public Utilities ─────────────────────────────────────────────────
export { snapToAlignment, packGrid } from './math';
export type { SnapAlignment, GridPackResult } from './math';

// ── Public Types ─────────────────────────────────────────────────────
export type {
  Position,
  ViewDimensions,
  DraxViewMeasurements,
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
  DraxViewState,
  DraxTrackingStatus,
  DraxRenderContentProps,
  DraxRenderHoverContentProps,
  DraxStyleProp,
  DraxViewStyleProps,
  DraxViewRenderContent,
  DraxViewRenderHoverContent,
  DraxSnapbackTarget,
  DraxSnapData,
  DraxSnapEndEventData,
  CollisionAlgorithm,
  DraxViewProps,
  DraxProviderProps,
  DraxProviderDragEvent,
  DraxScrollViewProps,
  DraxAutoScrollProps,
  SortableAnimationConfig,
  SortableAnimationPreset,
  SortableAnimationCustomConfig,
  SortableReorderStrategy,
  GridItemSpan,
} from './types';

export type {
  SortableReorderEvent,
  SortableListHandle,
  UseSortableListOptions,
} from './hooks/useSortableList';

export type { DraxListProps, DropIndicatorInfo } from './DraxList';
export type { SortableBoardHandle, SortableBoardTransferEvent, UseSortableBoardOptions } from './hooks/useSortableBoard';
export type { DraxHandleProps } from './DraxHandle';

export {
  DraxViewDragStatus,
  DraxViewReceiveStatus,
  DraxSnapbackTargetPreset,
  AutoScrollDirection,
  isPosition,
} from './types';
