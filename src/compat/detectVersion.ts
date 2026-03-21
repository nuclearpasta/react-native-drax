/**
 * Runtime detection of react-native-gesture-handler version.
 * Returns true if v3 hook API (usePanGesture) is available.
 * Result is cached after first call.
 */
let _isV3: boolean | null = null;

export function isGestureHandlerV3(): boolean {
  if (_isV3 !== null) return _isV3;
  try {
    const rngh = require('react-native-gesture-handler');
    _isV3 = typeof rngh.usePanGesture === 'function';
  } catch {
    _isV3 = false;
  }
  return _isV3;
}
