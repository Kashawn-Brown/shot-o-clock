// Loads the on-device display name and exposes a save action. Consumed by the
// root layout to gate first launch ('needed' shows NameEntryGate) and by the Join
// screen to prefill the name field. See api/displayName.ts for persistence.

import { useCallback, useEffect, useState } from 'react';

import {
  getDisplayName,
  normalizeDisplayName,
  setDisplayName,
} from '@/features/auth/api/displayName';

type DisplayNameStatus = 'loading' | 'needed' | 'ready';

interface UseDisplayNameResult {
  status: DisplayNameStatus;
  displayName: string | null;
  save: (name: string) => Promise<void>;
}

export function useDisplayName(): UseDisplayNameResult {
  const [status, setStatus] = useState<DisplayNameStatus>('loading');
  const [displayName, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getDisplayName()
      .then((stored) => {
        if (!active) return;
        setName(stored);
        setStatus(stored !== null ? 'ready' : 'needed');
      })
      .catch((error) => {
        console.error('Failed to read display name', error);
        if (active) setStatus('needed');
      });

    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (name: string) => {
    try {
      await setDisplayName(name);
      setName(normalizeDisplayName(name));
      setStatus('ready');
    } catch (error) {
      // Stay on the gate so the user can retry (invalid input or write failure).
      console.error('Failed to save display name', error);
    }
  }, []);

  return { status, displayName, save };
}
