// Local "I left this party" marker, persisted on-device.
//
// When a player taps Leave Party mid-game we mark them self_out (so their shot
// history is preserved and the roster shows them Out) and route home — but they
// are still a party member, so the launch reconnect (useActiveParty →
// getActiveParty, RLS-scoped to active/out members) would pull them straight back
// in. This flag records the party they chose to leave so the reconnect is
// suppressed for it. It is cleared once they are no longer in that party, or when
// they deliberately re-enter a party (create/join). Single value — a guest is in
// at most one party at a time.

import * as SecureStore from 'expo-secure-store';

const LEFT_PARTY_KEY = 'shotoclock.party.leftPartyId';

export async function getLeftPartyId(): Promise<string | null> {
  return SecureStore.getItemAsync(LEFT_PARTY_KEY);
}

export async function setLeftPartyId(partyId: string): Promise<void> {
  await SecureStore.setItemAsync(LEFT_PARTY_KEY, partyId);
}

export async function clearLeftPartyId(): Promise<void> {
  await SecureStore.deleteItemAsync(LEFT_PARTY_KEY);
}
