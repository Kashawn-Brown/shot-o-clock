// HostControlsSheet — the host's in-game control surface, opened from the timer
// screen. A bottom sheet (built on React Native's Modal, no extra dependency)
// holding the timer controls wired to the host_* RPCs:
//   - Pause / Resume   → host_pause_timer / host_resume_timer (§10.1 / §10.2)
//   - Add 30s / 1 min  → host_add_time (§10.3)
//
// The sheet is host-only: the parent renders it only for the host, and the RPCs
// themselves backstop with NOT_HOST, so a non-host could never drive them even
// if the UI leaked. Every action takes an in-flight lock (one at a time) and
// surfaces failures through the shared ErrorBanner (CLAUDE.md §5.7) rather than a
// raw alert. On success the sheet calls onApplied() so the parent re-pulls the
// session immediately instead of waiting on the realtime round-trip.
//
// add_time is NOT idempotent (each call adds more), so the in-flight lock is what
// stops a double-tap from stacking two extensions (hostAddTime.ts).

import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { hostAddTime } from '@/features/party/api/hostAddTime';
import { hostPauseTimer } from '@/features/party/api/hostPauseTimer';
import { hostResumeTimer } from '@/features/party/api/hostResumeTimer';
import { rpcErrorMessage } from '@/lib/errors';
import type { RpcResult } from '@/types/api';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// The two quick add-time amounts (seconds). host_add_time bounds input to 1–600.
const ADD_TIME_SHORT_SECONDS = 30;
const ADD_TIME_LONG_SECONDS = 60;

// Backdrop dim behind the sheet — a one-off overlay, no semantic token for it.
const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.4)';

type HostControlsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** session.status === 'paused' — flips the pause control to Resume. */
  isPaused: boolean;
  partySessionId: string;
  /** Re-pull the session after a successful action (parent's silent refresh). */
  onApplied: () => void;
  /** End the party — the host's useGameExit confirmExit (confirm → end_party →
   *  route home, D032). Owned by the screen so the exit path stays single. */
  onEndParty: () => void;
  /** useGameExit `leaving` — disables End Party while the exit is in flight. */
  endingParty: boolean;
};

export function HostControlsSheet({
  visible,
  onClose,
  isPaused,
  partySessionId,
  onApplied,
  onEndParty,
  endingParty,
}: HostControlsSheetProps): React.JSX.Element {
  // One action in flight at a time — disables every control so a double-tap can't
  // stack an add_time or race a pause against a resume.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared runner: lock, call the RPC, surface the error or refresh on success.
  // The response payload is unused (we only branch on ok / error_code), so the
  // call is typed against RpcResult<unknown> — that lets pause and resume, whose
  // success shapes differ, share one runner.
  const run = useCallback(
    async (call: () => Promise<RpcResult<unknown>>): Promise<void> => {
      if (busy) return;
      setError(null);
      setBusy(true);

      const result = await call();
      setBusy(false);

      if (result.ok) {
        onApplied();
        return;
      }
      setError(rpcErrorMessage(result.error_code));
    },
    [busy, onApplied],
  );

  const handlePauseResume = useCallback(() => {
    void run(() =>
      isPaused
        ? hostResumeTimer({ partySessionId })
        : hostPauseTimer({ partySessionId }),
    );
  }, [run, isPaused, partySessionId]);

  const handleAddTime = useCallback(
    (seconds: number) => {
      void run(() => hostAddTime({ partySessionId, seconds }));
    },
    [run, partySessionId],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tap the dim backdrop to dismiss; the sheet itself swallows the press. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Host Controls</Text>

          <Button
            label={isPaused ? 'Resume timer' : 'Pause timer'}
            variant="filled"
            onPress={handlePauseResume}
            disabled={busy}
          />

          <View style={styles.addTimeRow}>
            <Button
              label={`+ ${ADD_TIME_SHORT_SECONDS}s`}
              variant="outline"
              onPress={() => handleAddTime(ADD_TIME_SHORT_SECONDS)}
              disabled={busy}
              style={styles.addTime}
            />
            <Button
              label="+ 1 min"
              variant="outline"
              onPress={() => handleAddTime(ADD_TIME_LONG_SECONDS)}
              disabled={busy}
              style={styles.addTime}
            />
          </View>

          <ErrorBanner message={error} />

          {/* End Party sits below a divider, apart from the timer controls —
              it ends the game for everyone, not just nudges the clock. The
              confirmation gate lives in confirmExit (useGameExit). */}
          <View style={styles.divider} />
          <Button
            label="End Party"
            variant="outline"
            onPress={onEndParty}
            disabled={busy || endingParty}
            style={styles.endParty}
          />

          <Button label="Close" variant="outline" onPress={onClose} disabled={busy} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: BACKDROP_COLOR,
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  addTimeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  addTime: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  // Danger-tinted border marks End Party as the destructive control without
  // needing a third Button variant; the label keeps the default outline color.
  endParty: {
    borderColor: COLORS.danger,
  },
});
