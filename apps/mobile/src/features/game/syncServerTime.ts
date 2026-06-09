// Measures the device→server clock offset once and stores it in lib/time.ts, so
// serverNow()/msUntil() — and every countdown built on them — read server time
// rather than the raw device clock. The server timer stays authoritative
// (CLAUDE.md §2.1); this only aligns the *display* across devices, it never
// drives a transition.
//
// Offset = server_time − (clientStart + roundTrip / 2): we assume the server
// generated its timestamp at the midpoint of the request's round trip, which
// cancels most of the network latency. Accept ~1s residual drift (state-machine
// §8.7). See rpc-contracts.md §13.2.

import { getServerTime } from '@/features/game/api/serverTime';
import { setServerTimeOffset } from '@/lib/time';

/**
 * Sync the local clock offset to the server. Returns true on success; on any
 * failure it leaves the existing offset untouched (the device clock is still
 * within display tolerance) and returns false. Never throws — getServerTime
 * folds transport failures into an ok=false result.
 */
export async function syncServerTime(): Promise<boolean> {
  const clientStart = Date.now();
  const result = await getServerTime();
  const clientEnd = Date.now();

  if (!result.ok) return false;

  const serverMs = Date.parse(result.data.server_time);
  if (Number.isNaN(serverMs)) return false;

  const roundTrip = clientEnd - clientStart;
  const clientMidpoint = clientStart + roundTrip / 2;
  setServerTimeOffset(serverMs - clientMidpoint);
  return true;
}
