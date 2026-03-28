import type { SharedValue } from 'react-native-reanimated';

import type { DraxViewMeasurements, Position } from './core';

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
