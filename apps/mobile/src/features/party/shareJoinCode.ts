// One-tap join-code sharing via the native iOS/Android share sheet (iMessage,
// WhatsApp, etc.). Uses React Native's built-in Share API — no extra dependency.
//
// The message is split into a pure builder (joinCodeShareMessage) so the wording
// is unit-testable without invoking the platform share sheet, and a thin async
// wrapper (shareJoinCode) that opens the sheet. A user dismissing the sheet is a
// normal outcome, not an error — only real failures are logged.

import { Share } from 'react-native';

// The shared text. Includes the party name when present, dropping it cleanly when
// not so we never render an empty quoted name. The host shares this so others can
// enter the code on the Join screen.
export function joinCodeShareMessage(
  partyName: string | null | undefined,
  joinCode: string,
): string {
  const named = partyName?.trim();
  return named
    ? `Join my Shot O'Clock party "${named}"! Enter join code ${joinCode} in the app.`
    : `Join my Shot O'Clock party! Enter join code ${joinCode} in the app.`;
}

export async function shareJoinCode(
  partyName: string | null | undefined,
  joinCode: string,
): Promise<void> {
  try {
    await Share.share({ message: joinCodeShareMessage(partyName, joinCode) });
  } catch (error) {
    // Dismissing the sheet resolves normally; this only catches a genuine failure
    // to open it. Log with context rather than surfacing — sharing is non-critical.
    console.error('Failed to open the join-code share sheet', error);
  }
}
