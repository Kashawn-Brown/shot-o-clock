// Pure derivation of the "I'm Out" / "Skip" button + confirmation copy, shared by
// the timer and Shot O'Clock screens so the two never drift. The wording tracks
// what opting out will actually DO this round (D034 grace-aware skip):
//   - elimination off       → "Skip", no consequence (misses are tracked, nobody out)
//   - grace in hand          → "Skip this shot", which consumes the one grace
//   - otherwise              → "I'm Out", a permanent elimination
//
// Grace only matters when elimination is on (the finalizer's elimination-off branch
// returns before consulting grace — game-rules.md §4.4 / §7), so elimination-off is
// checked first.

import type { Database } from '@/types/db.generated';

type GraceMode = Database['public']['Enums']['grace_mode'];

export interface SelfOutCopy {
  // Button label.
  label: string;
  // False when opting out has no consequence (elimination off): the screen skips
  // the confirmation dialog and acts immediately. True for the grace-consuming and
  // permanent cases, where the player should confirm first.
  requiresConfirm: boolean;
  confirmTitle: string;
  confirmMessage: string;
  confirmButton: string;
}

export function selfOutCopy(params: {
  eliminationEnabled: boolean | null | undefined;
  graceMode: GraceMode | null | undefined;
  usedGrace: boolean | null | undefined;
  // True once the player's self_out is recorded for the round (button reflects the
  // done state).
  selfOutRecorded: boolean;
}): SelfOutCopy {
  const eliminationOff = params.eliminationEnabled === false;
  const hasGrace = params.graceMode === 'enabled' && params.usedGrace === false;
  // Both read as a "skip" rather than "I'm Out": opting out won't eliminate you
  // this round.
  const isSkip = eliminationOff || hasGrace;

  const label = params.selfOutRecorded
    ? isSkip
      ? 'Skipped'
      : "You're out"
    : eliminationOff
      ? 'Skip'
      : hasGrace
        ? 'Skip this shot'
        : "I'm Out";

  // Elimination off skips the dialog (requiresConfirm = false), so its message is
  // never shown; the other two are one short line each — just what happens.
  const confirmMessage = eliminationOff
    ? 'Sit out this round.'
    : hasGrace
      ? 'Uses your grace for this round.'
      : "You'll be out for the rest of the game.";

  return {
    label,
    requiresConfirm: !eliminationOff,
    confirmTitle: isSkip ? 'Skip this round?' : "I'm Out?",
    confirmMessage,
    confirmButton: isSkip ? 'Skip' : "I'm Out",
  };
}
