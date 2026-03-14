import type {
  DraxViewMeasurements,
  HitTestResult,
  Position,
  SpatialEntry,
  ViewDimensions,
} from './types';

export const getRelativePosition = (
  { x, y }: Position,
  { width, height, x: x0, y: y0 }: DraxViewMeasurements
) => {
  'worklet';
  const rx = x - x0;
  const ry = y - y0;
  return {
    relativePosition: { x: rx, y: ry },
    // Guard against division by zero for zero-dimension views
    relativePositionRatio: { x: rx / (width || 1), y: ry / (height || 1) },
  };
};

export const generateRandomId = () =>
  `${Math.random().toString(36).substr(2)}${Math.random().toString(36).substr(2)}`;

/**
 * Compute the absolute position of a spatial entry by walking the parent chain.
 * Accounts for scroll offsets at each level.
 */
export const computeAbsolutePositionWorklet = (
  entryIndex: number,
  entries: SpatialEntry[],
  scrollOffsets: Position[]
): Position => {
  'worklet';
  const entry = entries[entryIndex];
  if (!entry) return { x: 0, y: 0 };

  let absX = entry.x;
  let absY = entry.y;
  let parentIdx = entry.parentIndex;

  while (parentIdx >= 0) {
    const parent = entries[parentIdx];
    if (!parent) break;
    const parentScroll = scrollOffsets[parentIdx] || { x: 0, y: 0 };
    absX += parent.x - parentScroll.x;
    absY += parent.y - parentScroll.y;
    parentIdx = parent.parentIndex;
  }

  return { x: absX, y: absY };
};

/**
 * Extra padding (in points) applied to monitoring views during hit-testing.
 * During auto-scroll the hover center can drift outside the container's visible
 * bounds. This padding prevents false monitor exits that would prematurely end
 * the drag. Receptive views keep exact bounds for precise drop targeting.
 */
const MONITOR_HIT_TEST_PADDING = 100;

/**
 * Hit-test all views in the spatial index against a given absolute position.
 * Runs entirely on the UI thread as a worklet.
 * Returns the deepest receptive view and all monitoring views that contain the point.
 *
 * @param position - Center of the hover view (absolute)
 * @param entries - Spatial index entries
 * @param scrollOffsets - Scroll offsets per entry
 * @param excludeId - ID of the dragged view (excluded from hit-testing)
 * @param draggedDimensions - Optional dimensions of the dragged view (needed for intersect/contain)
 */
export const hitTestWorklet = (
  position: Position,
  entries: SpatialEntry[],
  scrollOffsets: Position[],
  excludeId: string,
  draggedDimensions?: ViewDimensions
): HitTestResult => {
  'worklet';

  let receiverId = '';
  const monitorIds: string[] = [];

  // Find the dragged item's parent index for rejectOwnChildren check
  let draggedParentIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]?.id === excludeId) {
      draggedParentIndex = entries[i]!.parentIndex;
      break;
    }
  }

  // Dragged view bounds (for intersect/contain algorithms)
  const dw = draggedDimensions?.width ?? 0;
  const dh = draggedDimensions?.height ?? 0;
  // position is the center of the hover view; compute top-left
  const dragLeft = position.x - dw / 2;
  const dragTop = position.y - dh / 2;
  const dragRight = dragLeft + dw;
  const dragBottom = dragTop + dh;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry) continue;
    if (entry.id === excludeId) continue;
    if (!entry.receptive && !entry.monitoring) continue;

    // Skip views with zero dimensions (not yet measured)
    if (entry.width === 0 || entry.height === 0) continue;

    // Compute absolute position by walking parent chain
    const absPos = computeAbsolutePositionWorklet(i, entries, scrollOffsets);

    const recLeft = absPos.x;
    const recTop = absPos.y;
    const recRight = recLeft + entry.width;
    const recBottom = recTop + entry.height;

    let isHit: boolean;
    const algo = entry.collisionAlgorithm;

    if (algo === 'intersect' && dw > 0 && dh > 0) {
      // Any overlap between dragged view and receiver
      isHit =
        dragLeft < recRight &&
        dragRight > recLeft &&
        dragTop < recBottom &&
        dragBottom > recTop;
    } else if (algo === 'contain' && dw > 0 && dh > 0) {
      // Dragged view is fully inside receiver
      isHit =
        dragLeft >= recLeft &&
        dragRight <= recRight &&
        dragTop >= recTop &&
        dragBottom <= recBottom;
    } else {
      // Default 'center': hover center is inside receiver
      isHit =
        position.x >= recLeft &&
        position.y >= recTop &&
        position.x < recRight &&
        position.y < recBottom;
    }

    if (isHit) {
      if (entry.monitoring) monitorIds.push(entry.id);
      // Take the last (deepest/most recently registered) receptive match
      // Skip if this receiver rejects drags from its own children
      if (entry.receptive) {
        if (entry.rejectOwnChildren && i === draggedParentIndex) {
          // This receiver is the parent of the dragged item — skip
        } else {
          receiverId = entry.id;
        }
      }
    } else if (entry.monitoring) {
      // Padded bounds check for monitoring views only (tolerates hover drift during auto-scroll)
      const isPaddedHit =
        position.x >= recLeft - MONITOR_HIT_TEST_PADDING &&
        position.y >= recTop - MONITOR_HIT_TEST_PADDING &&
        position.x < recRight + MONITOR_HIT_TEST_PADDING &&
        position.y < recBottom + MONITOR_HIT_TEST_PADDING;
      if (isPaddedHit) {
        monitorIds.push(entry.id);
      }
    }
  }

  return { receiverId, monitorIds };
};
