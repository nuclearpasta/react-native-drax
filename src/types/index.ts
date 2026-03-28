// ─── Core ────────────────────────────────────────────────────────────────
export type {
  Position,
  ViewDimensions,
  GridItemSpan,
  DraxViewMeasurements,
  DragPhase,
  CollisionAlgorithm,
  SpatialEntry,
  HitTestResult,
  DraxViewRegistration,
  DraxParentView,
  DraxViewMeasurementHandler,
} from './core';
export { isPosition, DraxViewDragStatus, DraxViewReceiveStatus } from './core';

// ─── Events & Snap ───────────────────────────────────────────────────────
export type {
  DraxEventViewData,
  DraxEventDraggedViewData,
  DraxEventReceiverViewData,
  DraxDragEventData,
  WithCancelledFlag,
  DraxDragEndEventData,
  DraxDragWithReceiverEventData,
  DraxDragWithReceiverEndEventData,
  DraxMonitorEventData,
  DraxMonitorEndEventData,
  DraxMonitorDragDropEventData,
  DraxSnapbackTarget,
  DraxProtocolDragEndResponse,
  DraxSnapData,
  DraxSnapEndEventData,
} from './events';
export { isWithCancelledFlag, DraxSnapbackTargetPreset } from './events';

// ─── View ────────────────────────────────────────────────────────────────
export type {
  DraxViewState,
  DraxTrackingStatus,
  DraxRenderContentProps,
  DraxRenderHoverContentProps,
  DraxStyleProp,
  AnimatedViewStylePropWithoutLayout,
  DraxViewStyleProps,
  DraxViewRenderContent,
  DraxViewRenderHoverContent,
  DraxViewProps,
} from './view';

// ─── Provider & Context ──────────────────────────────────────────────────
export type {
  FlattenedHoverStyles,
  ViewRegistryEntry,
  DraxContextValue,
  RegisterViewPayload,
  DraxProviderDragEvent,
  DraxProviderProps,
  DraxSubproviderProps,
  AutoScrollState,
  DraxAutoScrollProps,
  DraxScrollViewProps,
} from './provider';
export { AutoScrollDirection } from './provider';

// ─── Sortable ────────────────────────────────────────────────────────────
export type {
  SortableReorderStrategy,
  SortableAnimationPreset,
  SortableAnimationCustomConfig,
  SortableAnimationConfig,
  SortableItemPayload,
} from './sortable';
export { isSortableItemPayload } from './sortable';
