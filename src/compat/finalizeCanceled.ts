import type { DraxPanEvent } from './types';

/**
 * Whether a finalized pan gesture was cancelled, across gesture-handler
 * versions. Released v3 reports it as `event.canceled` (PR #3887); v2 and
 * v3 betas predating that change pass a legacy `success` second parameter
 * instead. Reading only the parameter makes every normal end look cancelled
 * on released v3.
 */
export function isFinalizeCanceled(
  event: DraxPanEvent,
  didSucceed?: boolean
): boolean {
  'worklet';
  return event.canceled ?? didSucceed === false;
}
