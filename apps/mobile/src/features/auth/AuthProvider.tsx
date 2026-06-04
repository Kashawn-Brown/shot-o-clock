// Provides the app's guest identity. Bootstraps an anonymous Supabase session on
// first launch (restored from SecureStore on later launches), keeps React state in
// sync with token refreshes, and drives Supabase's foreground-only auto-refresh.
//
// The whole app renders under this provider (app/_layout.tsx) so no screen runs
// without a resolved identity — `status` gates the navigator there.

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ensureAnonymousSession } from '@/features/auth/api/session';
import { supabase } from '@/lib/supabase';

type AuthStatus = 'loading' | 'ready' | 'error';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    ensureAnonymousSession()
      .then((next) => {
        if (!active) return;
        setSession(next);
        setStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        // No error UI component exists yet (§5.7); the root-layout gate renders an
        // error state, and this records the cause until that component lands.
        console.error('Anonymous auth bootstrap failed', error);
        setStatus('error');
      });

    // Keep state in sync with token refreshes and any future sign-out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Supabase RN requirement: only auto-refresh tokens while the app is foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    supabase.auth.startAutoRefresh();

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    userId: session?.user.id ?? null,
    status,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
