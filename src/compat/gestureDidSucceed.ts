import type { DraxPanEvent } from './types';

/**
 * Whether an ending gesture succeeded (END) rather than being cancelled or failed.
 * RNGH 3.0.0-beta.3+ (incl. 3.x stable) reports this as `event.canceled`;
 * RNGH v2 and 3.0.0-beta.2 and earlier pass `success` as a second argument.
 * If neither is present, assume success.
 */
export function gestureDidSucceed(event: DraxPanEvent, success?: boolean): boolean {
  'worklet';
  return typeof success === 'boolean' ? success : event.canceled !== true;
}
