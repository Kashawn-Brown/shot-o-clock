// Pure validation + parsing for the Create Party form.
//
// The screen collects raw text (party name, intervals, shot window) plus an
// elimination toggle and a grace-mode choice, then calls create_party with
// seconds. This module is the seam between the two: it validates the raw input
// against the rpc-contracts.md §2.3 bounds, converts the minute-based interval
// fields to the seconds the RPC expects, and produces a ready-to-send
// CreatePartyParams — or a single user-facing message naming the bad field.
//
// Kept pure (no React, no network) so the bounds + conversion are unit-tested
// directly. The server re-validates every field; this is the first line, not
// the only one. See docs/specs/rpc-contracts.md §2.

import { isValidDisplayName } from '@/features/auth/api/displayName';
import type { CreatePartyParams } from '@/features/party/api/createParty';
import type { Database } from '@/types/db.generated';

export type GraceMode = Database['public']['Enums']['grace_mode'];

const SECONDS_PER_MINUTE = 60;

// Party-name bounds mirror the create_party CHECK (§2.3: length 1–60).
export const PARTY_NAME_MIN_LENGTH = 1;
export const PARTY_NAME_MAX_LENGTH = 60;

// Interval fields are chosen with steppers in whole minutes. The minute bounds
// sit inside the RPC's second bounds (§2.3): starting interval 10–3600s,
// increment 0–600s. A 1-minute floor (60s) is a deliberate product floor —
// finer than a minute isn't a sensible drinking-game cadence. The increment max
// (10 min = 600s) is the RPC's hard cap, not a soft choice — create_party
// rejects anything above it with INVALID_PARAM.
export const STARTING_INTERVAL_MIN_MINUTES = 1;
export const STARTING_INTERVAL_MAX_MINUTES = 60;
export const STARTING_INTERVAL_STEP_MINUTES = 1;
export const INTERVAL_INCREMENT_MIN_MINUTES = 0;
export const INTERVAL_INCREMENT_MAX_MINUTES = 10;
export const INTERVAL_INCREMENT_STEP_MINUTES = 1;

// Shot window is chosen in seconds. The 15s stepper floor is a product choice
// that sits inside the RPC's wider 5–300s bound (§2.3); the step is 15s.
export const SHOT_WINDOW_MIN_SECONDS = 15;
export const SHOT_WINDOW_MAX_SECONDS = 300;
export const SHOT_WINDOW_STEP_SECONDS = 15;

// Defaults prefill the form so the happy path is one tap.
export const DEFAULT_STARTING_INTERVAL_MINUTES = 5;
export const DEFAULT_INTERVAL_INCREMENT_MINUTES = 1;
export const DEFAULT_SHOT_WINDOW_SECONDS = 60;
export const DEFAULT_ELIMINATION_ENABLED = true;

// Single-phone mode is off by default — the common path is a multi-device party
// where others join by code (D040).
export const DEFAULT_HOST_ONLY = false;

// Default party name, e.g. "Shot O'Clock 06/08/26". Prefilled on Create so a
// host can ship without naming the party; the field clears on first focus for
// free typing. Date is passed in (not read here) to keep this pure/testable.
export function formatDefaultPartyName(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `Shot O'Clock ${mm}/${dd}/${yy}`;
}

// Grace-mode segmented control: display label paired with the enum value the
// RPC stores, plus a one-line description shown under the selector. Only shown
// when elimination is on (the whole section is hidden otherwise). The `unlimited`
// enum value still exists in the schema but is no longer a UI choice.
export const GRACE_MODE_OPTIONS: readonly {
  label: string;
  value: GraceMode;
  description: string;
}[] = [
  { label: 'No Grace', value: 'disabled', description: "Miss a shot and you're out" },
  { label: 'Grace', value: 'enabled', description: 'First miss is forgiven, second means out' },
];

// Elimination-toggle hint text, switched on the toggle's value.
export const ELIMINATION_ON_HINT = 'Players who don\'t take their shot are eliminated';
export const ELIMINATION_OFF_HINT = 'Misses are tracked but nobody is eliminated';

// Single-phone-toggle hint text, switched on the toggle's value (D040).
export const HOST_ONLY_ON_HINT = 'Run and manage the game on this phone — no one else joins';
export const HOST_ONLY_OFF_HINT = 'Others join by code on their own phones';

export const DEFAULT_GRACE_MODE: GraceMode = 'disabled';

// Raw form state as held by the screen — interval/shot-window fields are the
// literal text in the inputs so partial/invalid entries are representable.
export type CreatePartyFormInput = {
  partyName: string;
  startingIntervalMinutes: string;
  intervalIncrementMinutes: string;
  shotWindowSeconds: string;
  eliminationEnabled: boolean;
  graceMode: GraceMode;
  hostDisplayName: string | null;
  hostOnly: boolean;
};

export type CreatePartyFormResult =
  | { ok: true; params: CreatePartyParams }
  | { ok: false; error: string };

// Whole non-negative integer only — rejects empty, decimals, signs, and stray
// characters so "5.5" or "" never silently coerce.
function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function validateCreatePartyForm(input: CreatePartyFormInput): CreatePartyFormResult {
  const partyName = input.partyName.trim();
  // Count code points (not UTF-16 units) to match Postgres length().
  const nameLength = [...partyName].length;
  if (nameLength < PARTY_NAME_MIN_LENGTH || nameLength > PARTY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Party name must be ${PARTY_NAME_MIN_LENGTH}–${PARTY_NAME_MAX_LENGTH} characters.`,
    };
  }

  const startingMinutes = parseWholeNumber(input.startingIntervalMinutes);
  if (
    startingMinutes === null ||
    startingMinutes < STARTING_INTERVAL_MIN_MINUTES ||
    startingMinutes > STARTING_INTERVAL_MAX_MINUTES
  ) {
    return {
      ok: false,
      error: `Starting interval must be between ${STARTING_INTERVAL_MIN_MINUTES} and ${STARTING_INTERVAL_MAX_MINUTES} minutes.`,
    };
  }

  const incrementMinutes = parseWholeNumber(input.intervalIncrementMinutes);
  if (
    incrementMinutes === null ||
    incrementMinutes < INTERVAL_INCREMENT_MIN_MINUTES ||
    incrementMinutes > INTERVAL_INCREMENT_MAX_MINUTES
  ) {
    return {
      ok: false,
      error: `Interval increase must be between ${INTERVAL_INCREMENT_MIN_MINUTES} and ${INTERVAL_INCREMENT_MAX_MINUTES} minutes.`,
    };
  }

  const shotWindowSeconds = parseWholeNumber(input.shotWindowSeconds);
  if (
    shotWindowSeconds === null ||
    shotWindowSeconds < SHOT_WINDOW_MIN_SECONDS ||
    shotWindowSeconds > SHOT_WINDOW_MAX_SECONDS
  ) {
    return {
      ok: false,
      error: `Shot window must be between ${SHOT_WINDOW_MIN_SECONDS} and ${SHOT_WINDOW_MAX_SECONDS} seconds.`,
    };
  }

  // hostDisplayName comes from the stored guest identity, already validated at
  // capture — but guard anyway so a missing/corrupt value fails loudly here
  // rather than at the RPC.
  if (input.hostDisplayName === null || !isValidDisplayName(input.hostDisplayName)) {
    return {
      ok: false,
      error: 'Your display name is missing. Restart the app to set it up.',
    };
  }

  // Grace mode is meaningless without elimination, so collapse it to `disabled`
  // when elimination is off — keeps the stored setting unambiguous and matches
  // the UI hiding the selector in that case.
  const graceMode: GraceMode = input.eliminationEnabled ? input.graceMode : 'disabled';

  return {
    ok: true,
    params: {
      partyName,
      startingIntervalSecs: startingMinutes * SECONDS_PER_MINUTE,
      intervalIncrementSecs: incrementMinutes * SECONDS_PER_MINUTE,
      shotWindowSecs: shotWindowSeconds,
      eliminationEnabled: input.eliminationEnabled,
      graceMode,
      hostDisplayName: input.hostDisplayName,
      hostOnly: input.hostOnly,
    },
  };
}
