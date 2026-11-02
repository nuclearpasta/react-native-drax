import type { DraxPanEvent } from './types';

/**
 * RNGH 3.0.0-beta.3+ (incl. 3.x stable) reports the end flag as
 * `event.canceled`; 3.0.0-beta.2 and earlier passed `success` as a second
 * argument. Normalize to `didSucceed` so consumers stay version-agnostic.
 * Without this, every normal drop finalizes as cancelled.
 */
export function resolveDidSucceed(
  event: DraxPanEvent,
  success?: boolean
): boolean {
  'worklet';
  return typeof success === 'boolean' ? success : event.canceled !== true;
}
