import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { DraxContextValue } from './types';

/** Context value with internal drag state that is not part of the public `DraxContextValue`. */
export interface DraxInternalContextValue extends DraxContextValue {
  /** Written by JS on each `handleReceiverChange`: true if the current state needs
   *  per-update dispatch (continuous callbacks or monitors). Read by the drag worklet. */
  needsUpdatesSV: SharedValue<boolean>;
  /** Set by the drag worklet when it schedules a continuous-only hop, cleared by JS
   *  when the hop runs. At most one such hop is in flight. */
  jsPendingSV: SharedValue<boolean>;
  /** Monitor ids of the last hop, joined. Lets the drag worklet detect a monitor set change. */
  lastMonitorKeySV: SharedValue<string>;
}

export const DraxContext = createContext<DraxInternalContextValue | undefined>(
  undefined
);
DraxContext.displayName = 'Drax';
