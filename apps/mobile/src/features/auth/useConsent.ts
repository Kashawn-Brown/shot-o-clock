// Loads the on-device age/terms consent state and exposes a confirm action.
// Consumed by the root layout to gate the app: 'needed' shows the AgeTermsGate,
// 'granted' lets the navigator render. See api/consent.ts for persistence.

import { useCallback, useEffect, useState } from 'react';

import { getConsent, hasGivenConsent, recordConsent } from '@/features/auth/api/consent';

type ConsentStatus = 'loading' | 'needed' | 'granted';

interface UseConsentResult {
  status: ConsentStatus;
  confirm: () => Promise<void>;
}

export function useConsent(): UseConsentResult {
  const [status, setStatus] = useState<ConsentStatus>('loading');

  useEffect(() => {
    let active = true;

    getConsent()
      .then((state) => {
        if (active) setStatus(hasGivenConsent(state) ? 'granted' : 'needed');
      })
      .catch((error) => {
        // Fail toward re-gating rather than skipping a required confirmation.
        console.error('Failed to read consent state', error);
        if (active) setStatus('needed');
      });

    return () => {
      active = false;
    };
  }, []);

  const confirm = useCallback(async () => {
    try {
      await recordConsent();
      setStatus('granted');
    } catch (error) {
      // Persistence failed; stay on the gate so the user can retry.
      console.error('Failed to persist consent', error);
    }
  }, []);

  return { status, confirm };
}
