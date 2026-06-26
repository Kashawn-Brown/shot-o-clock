// Intercepts the Android hardware / gesture-nav back button while a screen is
// focused, so OS back can't silently pop the navigation stack. Pair it with
// `gestureEnabled: false` on the screen (party _layout) to also disable the iOS
// edge-swipe — together they cover both platforms.
//
// Why this exists: D044 removed the in-app back arrows from the in-game screens in
// favor of explicit End Party / Leave Party buttons, but that never blocked the
// OS-level back, which kept popping the stack — stranding a host on a stale Home
// with no way back to their live party (Phase 16 bug fix). The back event is always
// consumed; pass an `onBack` to route it to the screen's explicit exit
// confirmation, or omit it to make back fully inert (e.g. the Shot O'Clock moment).

import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * @param onBack invoked on each back press while focused. The back event is always
 *   consumed (the stack is never popped); the return value is irrelevant. Omit for
 *   a fully-inert back.
 */
export function useBlockBack(onBack?: () => void): void {
  // Hold the latest handler in a ref so the listener subscribes once per focus and
  // never re-subscribes when onBack is an inline closure (e.g. confirmExit({...})).
  const handler = useRef(onBack);
  handler.current = onBack;

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handler.current?.();
        return true; // consume — never pop the stack
      });
      return () => subscription.remove();
    }, []),
  );
}
