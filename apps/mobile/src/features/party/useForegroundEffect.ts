// Fires a callback when the app returns to the foreground after having been
// backgrounded. Used by the live-state hooks to refetch and reattach on resume:
// Supabase realtime (postgres_changes) does NOT replay changes missed while the app
// was suspended, and the socket may have been torn down by the OS — so on resume a
// device must re-pull authoritative state and resubscribe, or it renders stale state
// until something else happens to trigger a fetch (the reported "stale until the old
// clock runs out" bug). See useTimerSession / useLobby.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Calls `onForeground` on each real background→active transition (and the optional
 * `onBackground` when the app actually backgrounds — e.g. to snapshot state to compare
 * on resume). A pure active→inactive→active flicker (iOS control center, a system
 * prompt) never sets the backgrounded flag, so neither fires — only an actual app
 * switch / lock does. The latest callbacks are read off refs, so passing fresh closures
 * each render is fine (the listener is installed once).
 */
export function useForegroundEffect(onForeground: () => void, onBackground?: () => void): void {
  const onForegroundRef = useRef(onForeground);
  onForegroundRef.current = onForeground;
  const onBackgroundRef = useRef(onBackground);
  onBackgroundRef.current = onBackground;

  // Only fire after a genuine background — ignores the transient 'inactive' state
  // iOS reports when the app is merely obscured but not switched away.
  const wasBackgrounded = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        wasBackgrounded.current = true;
        onBackgroundRef.current?.();
      } else if (next === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        onForegroundRef.current();
      }
    });

    return () => subscription.remove();
  }, []);
}
