// Reset this device (D018) — the remount mechanism.
//
// The onboarding gates (useConsent / useDisplayName / useNotificationPrompt) and
// AuthProvider read storage only on mount, so clearing storage isn't enough to
// return to first launch — the identity tree must remount. This provider holds an
// "identity epoch" and exposes reset(): reset() wipes device state (resetDevice)
// then bumps the epoch. The consumer keys the AuthProvider subtree on that epoch
// (see app/_layout.tsx), so a bump remounts it — the gates re-read the now-empty
// storage and AuthProvider bootstraps a fresh anonymous guest, reproducing a first
// launch. The provider itself sits ABOVE the keyed subtree, so reset() stays stable
// across the remount.
//
// children is a render prop receiving the current epoch so the consumer can use it
// as the remount key.

import { createContext, useCallback, useContext, useState } from 'react';

import { resetDevice } from '@/features/auth/api/resetDevice';

interface ResetContextValue {
  /** Wipe this device's state and remount into a fresh first-launch flow. */
  reset: () => Promise<void>;
}

const ResetContext = createContext<ResetContextValue | undefined>(undefined);

export function ResetProvider({
  children,
}: {
  children: (epoch: number) => React.ReactNode;
}): React.JSX.Element {
  const [epoch, setEpoch] = useState(0);

  const reset = useCallback(async () => {
    await resetDevice();
    setEpoch((prev) => prev + 1);
  }, []);

  return <ResetContext.Provider value={{ reset }}>{children(epoch)}</ResetContext.Provider>;
}

export function useReset(): ResetContextValue {
  const context = useContext(ResetContext);
  if (context === undefined) {
    throw new Error('useReset must be used within a ResetProvider');
  }
  return context;
}
