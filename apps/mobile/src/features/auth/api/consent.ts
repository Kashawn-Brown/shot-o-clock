// Local persistence of the guest's age + terms confirmation.
//
// Per plan.md Phase 4 the gate runs once on first launch and is skipped on later
// launches, so the flags are stored on-device. There is intentionally no DB write:
// `terms_acceptances` is a reserved/future table (docs/specs/schema.md §10), not
// part of MVP. Flags are device-level (not tied to auth.uid) — enough to satisfy
// "first launch gates, second launch skips them".

import * as SecureStore from 'expo-secure-store';

const AGE_CONFIRMED_KEY = 'shotoclock.consent.ageConfirmed';
const TERMS_ACCEPTED_KEY = 'shotoclock.consent.termsAccepted';

export interface ConsentState {
  ageConfirmed: boolean;
  termsAccepted: boolean;
}

/** True only when both the age and terms confirmations have been recorded. */
export function hasGivenConsent(state: ConsentState): boolean {
  return state.ageConfirmed && state.termsAccepted;
}

export async function getConsent(): Promise<ConsentState> {
  const [age, terms] = await Promise.all([
    SecureStore.getItemAsync(AGE_CONFIRMED_KEY),
    SecureStore.getItemAsync(TERMS_ACCEPTED_KEY),
  ]);
  return { ageConfirmed: age === 'true', termsAccepted: terms === 'true' };
}

/** Record both confirmations. Called once when the gate is accepted. */
export async function recordConsent(): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(AGE_CONFIRMED_KEY, 'true'),
    SecureStore.setItemAsync(TERMS_ACCEPTED_KEY, 'true'),
  ]);
}
