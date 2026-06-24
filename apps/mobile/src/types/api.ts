// RPC types for Shot O'Clock.
//
// These types describe the standard return shape every Phase 2 RPC produces
// (see docs/specs/rpc-contracts.md §1.3) and the canonical list of error
// codes the database may return (see §15).
//
// When rpc-contracts.md §15 gains a new code, update `DbRpcErrorCode` below.
// TypeScript will then fail to compile apps/mobile/src/lib/errors.ts until a
// user-facing message is added for the new code.

// ─── Error codes ────────────────────────────────────────────────────────────

// Codes returned by the database inside the standard RPC shape.
// Source of truth: docs/specs/rpc-contracts.md §15.
export type DbRpcErrorCode =
  | 'INVALID_PARAM'
  | 'NOT_AUTHENTICATED'
  | 'NOT_IN_PARTY'
  | 'NOT_HOST'
  | 'SESSION_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_NOT_ACTIVE'
  | 'PLAYER_NOT_OUT'
  | 'PLAYER_REMOVED'
  | 'CANNOT_REMOVE_HOST'
  | 'HOST_CANNOT_LEAVE'
  | 'ALREADY_REMOVED'
  | 'ALREADY_HOSTING'
  | 'PARTY_NOT_JOINABLE'
  | 'PARTY_LOCKED'
  | 'JOIN_CODE_NOT_FOUND'
  | 'JOIN_CODE_COLLISION'
  | 'ILLEGAL_TRANSITION'
  | 'SHOT_WINDOW_CLOSED'
  | 'SELF_OUT_IS_STICKY'
  | 'NO_ACTIVE_PLAYERS'
  | 'REINSTATE_TOO_OLD'
  | 'HEADS_UP_LOCKED'
  | 'HEADS_UP_ALREADY_CHANGED';

// Codes the client wrapper produces when the call itself fails (network error,
// thrown exception, malformed response). Never returned by the database.
export type ClientRpcErrorCode = 'UNEXPECTED_ERROR';

export type RpcErrorCode = DbRpcErrorCode | ClientRpcErrorCode;

// ─── Result shape ───────────────────────────────────────────────────────────

export type RpcSuccess<T> = {
  ok: true;
  error_code: null;
  error_msg: null;
  data: T;
};

export type RpcError = {
  ok: false;
  error_code: RpcErrorCode;
  error_msg: string;
  data: null;
};

// Discriminated union — narrow on `result.ok` to access `data` or `error_code`.
export type RpcResult<T> = RpcSuccess<T> | RpcError;
