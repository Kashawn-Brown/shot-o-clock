// Pure validation + normalization for the Join Party form.
//
// The screen collects a join code and a display name; this module sanitizes the
// code as it's typed (uppercase, allowed alphabet only, capped length),
// validates both fields against the join_party contract, and produces a
// ready-to-send JoinPartyParams — or a single user-facing message naming the bad
// field.
//
// Kept pure (no React, no network) so the alphabet + length rules are unit-tested
// directly. The server re-validates; this is the first line, not the only one.
// See docs/specs/rpc-contracts.md §3 and docs/specs/schema.md §2.

import { isValidDisplayName, normalizeDisplayName } from '@/features/auth/api/displayName';
import type { JoinPartyParams } from '@/features/party/api/joinParty';

export const JOIN_CODE_LENGTH = 6;

// Allowed alphabet excludes visually ambiguous characters (0/O/I/1). Mirrors the
// party_sessions.join_code regex (schema.md §2) and rpc-contracts.md §3.3.
const JOIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const JOIN_CODE_DISALLOWED = /[^A-HJ-NP-Z2-9]/g;

// Uppercase and drop any character outside the allowed alphabet, capped at the
// code length. Used as the TextInput transform so only valid codes can be typed.
export function sanitizeJoinCodeInput(raw: string): string {
  return raw.toUpperCase().replace(JOIN_CODE_DISALLOWED, '').slice(0, JOIN_CODE_LENGTH);
}

export function isValidJoinCode(raw: string): boolean {
  return JOIN_CODE_PATTERN.test(raw);
}

export type JoinPartyFormInput = {
  joinCode: string;
  displayName: string;
};

export type JoinPartyFormResult =
  | { ok: true; params: JoinPartyParams }
  | { ok: false; error: string };

export function validateJoinPartyForm(input: JoinPartyFormInput): JoinPartyFormResult {
  const joinCode = sanitizeJoinCodeInput(input.joinCode);
  if (!isValidJoinCode(joinCode)) {
    return { ok: false, error: `Enter the ${JOIN_CODE_LENGTH}-character join code.` };
  }

  const displayName = normalizeDisplayName(input.displayName);
  if (!isValidDisplayName(displayName)) {
    return { ok: false, error: 'Enter a display name (1–40 characters).' };
  }

  return { ok: true, params: { joinCode, displayName } };
}
