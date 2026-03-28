import { useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';

import type {
  CollisionAlgorithm,
  DraxViewMeasurements,
  DraxViewProps,
  FlattenedHoverStyles,
  Position,
  RegisterViewPayload,
  SpatialEntry,
  ViewRegistryEntry,
} from '../types';

function flattenOrNull(s: unknown): ViewStyle | null {
  if (!s) return null;
  return StyleSheet.flatten(s as ViewStyle) ?? null;
}

function buildFlattenedHoverStyles(props: DraxViewProps): FlattenedHoverStyles {
  return {
    hoverStyle: flattenOrNull(props.hoverStyle),
    hoverDraggingStyle: flattenOrNull(props.hoverDraggingStyle),
    hoverDraggingWithReceiverStyle: flattenOrNull(props.hoverDraggingWithReceiverStyle),
    hoverDraggingWithoutReceiverStyle: flattenOrNull(props.hoverDraggingWithoutReceiverStyle),
    hoverDragReleasedStyle: flattenOrNull(props.hoverDragReleasedStyle),
  };
}

/**
 * Module-level helper to update spatial entry capabilities.
 * Defined outside the hook so the worklet closure cannot capture
 * any React refs from the hook scope — only the explicitly passed values.
 */
function updateSpatialEntryCapabilities(
  spatialIndexSV: SharedValue<SpatialEntry[]>,
  idx: number,
  draggable: boolean,
  receptive: boolean,
  monitoring: boolean,
  rejectOwnChildren: boolean,
  collisionAlgorithm: CollisionAlgorithm,
) {
  spatialIndexSV.modify((entries) => {
    'worklet';
    if (idx >= 0 && idx < entries.length && entries[idx]) {
      entries[idx]!.receptive = receptive;
      entries[idx]!.monitoring = monitoring;
      entries[idx]!.draggable = draggable;
      entries[idx]!.rejectOwnChildren = rejectOwnChildren;
      entries[idx]!.collisionAlgorithm = collisionAlgorithm;
    }
    return entries;
  });
}

/**
 * Manages the spatial index (SharedValue<SpatialEntry[]>) and the JS-thread
 * view registry (Map<string, ViewRegistryEntry>).
 *
 * The spatial index lives on the UI thread and is used by gesture worklets
 * for hit-testing. The registry is JS-thread only and stores callbacks,
 * props, and other data that worklets don't need.
 */
export const useSpatialIndex = () => {
  // ── SharedValues ───────────────────────────────────────────────────
  const spatialIndexSV = useSharedValue<SpatialEntry[]>([]);
  const scrollOffsetsSV = useSharedValue<Position[]>([]);

  // ── JS-thread registry ─────────────────────────────────────────────
  const registryRef = useRef(new Map<string, ViewRegistryEntry>());
  /** Local counter for deterministic index assignment (avoids race with async modify) */
  const nextIndexRef = useRef(0);
  /** Pending unregisters — deferred so re-registration can cancel them */
  const pendingUnregistersRef = useRef(new Set<string>());

  /** Find the spatial index of a parent view, or -1 if not found */
  const findParentSpatialIndex = (parentId?: string): number => {
    if (!parentId) return -1;
    const parent = registryRef.current.get(parentId);
    return parent?.spatialIndex ?? -1;
  };

  /** Perform the actual removal of a view from spatial index and registry */
  const performUnregister = (id: string) => {
    const entry = registryRef.current.get(id);
    if (!entry) return;

    const removedIndex = entry.spatialIndex;

    // Remove from spatial index
    spatialIndexSV.modify((entries) => {
      'worklet';
      entries.splice(removedIndex, 1);
      return entries;
    });

    // Remove from scroll offsets
    scrollOffsetsSV.modify((offsets) => {
      'worklet';
      offsets.splice(removedIndex, 1);
      return offsets;
    });

    // Remove from JS registry
    registryRef.current.delete(id);
    nextIndexRef.current -= 1;

    // Update spatial indices for all entries after the removed one
    for (const [, regEntry] of registryRef.current) {
      if (regEntry.spatialIndex > removedIndex) {
        regEntry.spatialIndex -= 1;
      }
    }

    // Update parent indices in spatial index (entries that pointed to removed or later indices)
    spatialIndexSV.modify((entries) => {
      'worklet';
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e) continue;
        if (e.parentIndex === removedIndex) {
          // Parent was removed — reparent to grandparent or root
          e.parentIndex = -1;
        } else if (e.parentIndex > removedIndex) {
          e.parentIndex -= 1;
        }
      }
      return entries;
    });
  };

  /** Register a view (idempotent — re-registration preserves measurements) */
  const registerView = (payload: RegisterViewPayload) => {
    const { id, parentId, scrollPosition, props } = payload;

    // Cancel any pending unregister for this view
    pendingUnregistersRef.current.delete(id);

    // Determine capabilities from props
    const draggable = isDraggable(props);
    const receptive = isReceptive(props);
    const monitoring = isMonitoring(props);

    // If already registered, update in-place (preserves measurements)
    const existing = registryRef.current.get(id);
    if (existing) {
      existing.parentId = parentId;
      existing.scrollPosition = scrollPosition;
      existing.props = props;
      existing.flattenedHoverStyles = buildFlattenedHoverStyles(props);

      const idx = existing.spatialIndex;
      updateSpatialEntryCapabilities(
        spatialIndexSV, idx, draggable, receptive, monitoring,
        props.rejectOwnChildren ?? false,
        props.collisionAlgorithm ?? 'center',
      );
      return;
    }

    const parentIndex = findParentSpatialIndex(parentId);

    // Append to spatial index
    const newEntry: SpatialEntry = {
      id,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      parentIndex,
      receptive,
      monitoring,
      draggable,
      rejectOwnChildren: props.rejectOwnChildren ?? false,
      collisionAlgorithm: props.collisionAlgorithm ?? 'center',
    };

    const spatialIndex = nextIndexRef.current;
    nextIndexRef.current += 1;

    spatialIndexSV.modify((entries) => {
      'worklet';
      entries.push(newEntry);
      return entries;
    });

    // Also extend scroll offsets array
    scrollOffsetsSV.modify((offsets) => {
      'worklet';
      offsets.push({ x: 0, y: 0 });
      return offsets;
    });

    // Store in JS registry
    registryRef.current.set(id, {
      id,
      parentId,
      spatialIndex,
      scrollPosition,
      measurements: undefined,
      props,
      flattenedHoverStyles: buildFlattenedHoverStyles(props),
    });

    // Fix up children that registered before this parent.
    // React fires useEffect bottom-up, so children often register before their parent.
    // Scan existing entries and update their parentIndex if they reference this view.
    for (const [, childEntry] of registryRef.current) {
      if (childEntry.parentId === id && childEntry.id !== id) {
        const childIdx = childEntry.spatialIndex;
        spatialIndexSV.modify((entries) => {
          'worklet';
          if (
            childIdx >= 0 &&
            childIdx < entries.length &&
            entries[childIdx] &&
            entries[childIdx]!.parentIndex !== spatialIndex
          ) {
            entries[childIdx]!.parentIndex = spatialIndex;
          }
          return entries;
        });
      }
    }
  };

  /**
   * Unregister a view. Deferred via microtask so that if registerView is
   * called for the same ID immediately after (useEffect cleanup → re-register),
   * the removal is cancelled and measurements are preserved.
   */
  const unregisterView = (id: string) => {
    pendingUnregistersRef.current.add(id);
    queueMicrotask(() => {
      if (!pendingUnregistersRef.current.has(id)) return;
      pendingUnregistersRef.current.delete(id);
      performUnregister(id);
    });
  };

  /** Update measurements for a view (called on layout) */
  const updateMeasurements = (id: string, measurements: DraxViewMeasurements) => {
    const entry = registryRef.current.get(id);
    if (!entry) return;

    entry.measurements = measurements;

    const idx = entry.spatialIndex;
    spatialIndexSV.modify((entries) => {
      'worklet';
      if (idx >= 0 && idx < entries.length && entries[idx]) {
        entries[idx]!.x = measurements.x;
        entries[idx]!.y = measurements.y;
        entries[idx]!.width = measurements.width;
        entries[idx]!.height = measurements.height;
      }
      return entries;
    });
  };

  /** Update scroll offset for a scrollable view */
  const updateScrollOffset = (id: string, offset: Position) => {
    const entry = registryRef.current.get(id);
    if (!entry) return;

    const idx = entry.spatialIndex;
    scrollOffsetsSV.modify((offsets) => {
      'worklet';
      if (idx >= 0 && idx < offsets.length) {
        offsets[idx] = offset;
      }
      return offsets;
    });
  };

  /** Update view props (callbacks, capabilities, etc.) */
  const updateViewProps = (id: string, props: DraxViewProps) => {
    const entry = registryRef.current.get(id);
    if (!entry) return;

    entry.props = props;
    entry.flattenedHoverStyles = buildFlattenedHoverStyles(props);

    // Update capabilities in spatial index
    const draggable = isDraggable(props);
    const receptive = isReceptive(props);
    const monitoring = isMonitoring(props);

    const idx = entry.spatialIndex;
    updateSpatialEntryCapabilities(
      spatialIndexSV, idx, draggable, receptive, monitoring,
      props.rejectOwnChildren ?? false,
      props.collisionAlgorithm ?? 'center',
    );
  };

  /** Get a view registry entry by id */
  const getViewEntry = (id: string): ViewRegistryEntry | undefined => {
    return registryRef.current.get(id);
  };

  return {
    spatialIndexSV,
    scrollOffsetsSV,
    registerView,
    unregisterView,
    updateMeasurements,
    updateScrollOffset,
    updateViewProps,
    getViewEntry,
  };
};

// ─── Helper functions ──────────────────────────────────────────────────────

export function isDraggable(props: DraxViewProps): boolean {
  return (
    props.draggable ??
    (props.dragPayload !== undefined ||
      props.payload !== undefined ||
      !!props.onDrag ||
      !!props.onDragEnd ||
      !!props.onDragEnter ||
      !!props.onDragExit ||
      !!props.onDragOver ||
      !!props.onDragStart ||
      !!props.onDragDrop)
  );
}

function isReceptive(props: DraxViewProps): boolean {
  return (
    props.receptive ??
    (props.receiverPayload !== undefined ||
      props.payload !== undefined ||
      !!props.onReceiveDragEnter ||
      !!props.onReceiveDragExit ||
      !!props.onReceiveDragOver ||
      !!props.onReceiveDragDrop)
  );
}

function isMonitoring(props: DraxViewProps): boolean {
  return (
    props.monitoring ??
    (!!props.onMonitorDragStart ||
      !!props.onMonitorDragEnter ||
      !!props.onMonitorDragOver ||
      !!props.onMonitorDragExit ||
      !!props.onMonitorDragEnd ||
      !!props.onMonitorDragDrop)
  );
}
