// Pure derivation of the "I'm Out" / "Skip" / "Use Grace" button + confirmation
// copy, shared by the timer and Shot O'Clock screens so the two never drift. The
// wording tracks what opting out will actually DO this round (D034 grace-aware
// skip):
//   - elimination off       → "Skip", no consequence (misses are tracked, nobody out)
//   - grace in hand          → "Use Grace", which consumes the one grace (the player
//                              sits out and returns next round, shown as "Used Grace"
//                              in Round Results — roundResults.ts)
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
  // Three distinct cases — elimination-off is checked first (grace is irrelevant
  // when elimination is off). 'skip' has no consequence; 'grace' consumes the one
  // grace; 'out' is a permanent elimination. Both 'skip' and 'grace' return the
  // player to active next round, so neither reads as "I'm Out".
  const kind: 'skip' | 'grace' | 'out' = eliminationOff ? 'skip' : hasGrace ? 'grace' : 'out';

  const label = params.selfOutRecorded
    ? kind === 'skip'
      ? 'Skipped'
      : kind === 'grace'
        ? 'Grace used'
        : "You're out"
    : kind === 'skip'
      ? 'Skip'
      : kind === 'grace'
        ? 'Use Grace'
        : "I'm Out";

  // Elimination off skips the dialog (requiresConfirm = false), so its message is
  // never shown; the other two are one short line each — just what happens.
  const confirmMessage =
    kind === 'skip'
      ? 'Sit out this round.'
      : kind === 'grace'
        ? 'Uses your one grace to sit out this round.'
        : "You'll be out for the rest of the game.";

  const confirmTitle = kind === 'grace' ? 'Use your grace?' : kind === 'skip' ? 'Skip this round?' : "I'm Out?";
  const confirmButton = kind === 'grace' ? 'Use Grace' : kind === 'skip' ? 'Skip' : "I'm Out";

  return {
    label,
    requiresConfirm: kind !== 'skip',
    confirmTitle,
    confirmMessage,
    confirmButton,
  };
}
