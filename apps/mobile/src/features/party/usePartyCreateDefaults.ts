// Loads the party-creation defaults and exposes save. Used two ways:
//   - Create Party reads `defaults` to seed its form (via the outer/inner split).
//   - The party-defaults editor seeds a local draft from `defaults` and calls save()
//     only when the user taps Save (edit-local / persist-on-Save). save() updates the
//     local `defaults` snapshot too, so the editor's "dirty" check resets after saving.

import { useCallback, useEffect, useState } from 'react';

import {
  getPartyCreateDefaults,
  setPartyCreateDefaults,
  type PartyCreateDefaults,
} from '@/features/party/partyDefaults';

interface UsePartyCreateDefaultsResult {
  defaults: PartyCreateDefaults | null; // null while loading
  save: (next: PartyCreateDefaults) => void;
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

  return { defaults, save };
}
