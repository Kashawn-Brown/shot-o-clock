// Loads the party-creation defaults and exposes save + restore. Used two ways:
//   - Create Party reads `defaults` to seed its form (via the outer/inner split).
//   - The party-defaults editor renders controlled by `defaults`, calling save() on
//     each change and restore() for the header "Restore defaults" action.
// save/restore update local state optimistically so the editor's controls reflect a
// change immediately while the write persists.

import { useCallback, useEffect, useState } from 'react';

import {
  clearPartyCreateDefaults,
  FACTORY_PARTY_CREATE_DEFAULTS,
  getPartyCreateDefaults,
  setPartyCreateDefaults,
  type PartyCreateDefaults,
} from '@/features/party/partyDefaults';

interface UsePartyCreateDefaultsResult {
  defaults: PartyCreateDefaults | null; // null while loading
  save: (next: PartyCreateDefaults) => void;
  restore: () => void;
}

export function usePartyCreateDefaults(): UsePartyCreateDefaultsResult {
  const [defaults, setLocal] = useState<PartyCreateDefaults | null>(null);

  useEffect(() => {
    let active = true;
    getPartyCreateDefaults().then((loaded) => {
      if (active) setLocal(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback((next: PartyCreateDefaults) => {
    setLocal(next);
    void setPartyCreateDefaults(next);
  }, []);

  const restore = useCallback(() => {
    setLocal(FACTORY_PARTY_CREATE_DEFAULTS);
    void clearPartyCreateDefaults();
  }, []);

  return { defaults, save, restore };
}
