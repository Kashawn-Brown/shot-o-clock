// User-facing messages for every RpcErrorCode.
//
// The `Record<RpcErrorCode, string>` type means a missing code is a TypeScript
// error, not a runtime fallback. When `docs/specs/rpc-contracts.md` §15 gains
// a new code:
//   1. Add the code to `DbRpcErrorCode` in `apps/mobile/src/types/api.ts`.
//   2. TS will fail to compile this file until a message is added below.

import type { RpcErrorCode } from '@/types/api';

export const RPC_ERROR_MESSAGES: Record<RpcErrorCode, string> = {
  // ─── Database-returned codes (rpc-contracts.md §15) ─────────────────────
  INVALID_PARAM: 'Some of the information you provided is invalid.',
  NOT_AUTHENTICATED: 'You need to be signed in to do that.',
  NOT_IN_PARTY: 'You are not a member of this party.',
  NOT_HOST: 'Only the party host can do that.',
  SESSION_NOT_FOUND: 'That party could not be found.',
  PLAYER_NOT_FOUND: 'That player could not be found.',
  PLAYER_NOT_ACTIVE: 'That player is not currently active.',
  PLAYER_NOT_OUT: 'That player is not currently out.',
  PLAYER_REMOVED: 'You were removed from this party.',
  CANNOT_REMOVE_HOST: 'The host cannot be removed from their own party.',
  HOST_CANNOT_LEAVE: 'The host cannot leave the party — end it instead.',
  ALREADY_REMOVED: 'That player has already been removed.',
  ALREADY_HOSTING: 'You are already hosting another party.',
  // Overloaded code — join_party returns it for an already-started party (late
  // join off) AND for an ended party. Kept accurate for both rather than asserting
  // "started" (plan.md Phase 13 — stale/ended party messaging).
  PARTY_NOT_JOINABLE: 'This party is no longer open to join.',
  PARTY_LOCKED: 'That party is locked and not accepting new players.',
  JOIN_CODE_NOT_FOUND: 'No party found with that join code.',
  JOIN_CODE_COLLISION: 'Could not generate a unique join code. Please try again.',
  ILLEGAL_TRANSITION: 'That action is not allowed right now.',
  SHOT_WINDOW_CLOSED: 'The shot window has already closed.',
  SELF_OUT_IS_STICKY: 'You already opted out of this round.',
  NO_ACTIVE_PLAYERS: 'There are no active players left in this party.',
  REINSTATE_TOO_OLD: 'That player has been out too long to be reinstated.',
  // ─── Client-side wrapper codes (rpcClient.ts) ────────────────────────────
  UNEXPECTED_ERROR: 'Something unexpected went wrong. Please try again.',
};

export function rpcErrorMessage(code: RpcErrorCode): string {
  return RPC_ERROR_MESSAGES[code];
}
