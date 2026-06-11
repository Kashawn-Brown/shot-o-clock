// RosterSheet — the in-game roster, opened from the timer screen. A bottom sheet
// (React Native Modal, no extra dependency) over the live get_party_state roster
// carried by useTimerSession. Read-only for players; for the host each row also
// carries the player-target controls:
//   - active player → Mark Out (host_mark_player_out, §11.2) + Remove
//     (host_remove_player, §11.3)
//   - out player    → Reinstate (host_mark_player_active, §11.1 — restores grace
//     if they were out by missed_after_grace, and can un-stick the zero-active
//     halt)
// The host's own row never shows actions: a host can't mark out or remove
// themselves (they leave by ending the party).
//
// No drag-to-dismiss handle — RN's Modal has no built-in pan-to-close and a fake
// handle would be a lie (bug 1). Dismissal is the Close button, the header ✕, the
// backdrop tap, and Android back (onRequestClose).
//
// Each action takes a per-row in-flight lock and surfaces failures through the
// shared ErrorBanner (§5.7). On success the sheet calls onApplied so the host's
// own roster re-pulls immediately; the realtime party_players sub propagates the
// change to every other device.

import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { hostMarkPlayerActive } from '@/features/party/api/hostMarkPlayerActive';
import { hostMarkPlayerOut } from '@/features/party/api/hostMarkPlayerOut';
import { hostRemovePlayer } from '@/features/party/api/hostRemovePlayer';
import { deriveTimerRoster } from '@/features/party/timerRoster';
import { rpcErrorMessage } from '@/lib/errors';
import type { RpcResult } from '@/types/api';
import type { Database } from '@/types/db.generated';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];

// Dim behind the sheet — a one-off overlay, no semantic token for it.
const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.4)';

type RosterSheetProps = {
  visible: boolean;
  onClose: () => void;
  players: PlayerRow[];
  /** The caller's auth id — flags their own row so host controls hide on it. */
  currentUserId: string | null;
  /** Whether the caller holds the host role — gates the per-row controls. */
  isHost: boolean;
  /** Re-pull the snapshot after a successful action (parent's silent refresh). */
  onApplied: () => void;
};

export function RosterSheet({
  visible,
  onClose,
  players,
  currentUserId,
  isHost,
  onApplied,
}: RosterSheetProps): React.JSX.Element {
  const roster = deriveTimerRoster(players, currentUserId);

  // The player id whose action is in flight, or null. Locks just that row's
  // buttons so a double-tap can't fire two host_* calls at the target.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (playerId: string, call: () => Promise<RpcResult<unknown>>): Promise<void> => {
      if (busyId !== null) return;
      setError(null);
      setBusyId(playerId);

      const result = await call();
      setBusyId(null);

      if (result.ok) {
        onApplied();
        return;
      }
      setError(rpcErrorMessage(result.error_code));
    },
    [busyId, onApplied],
  );

  const handleMarkOut = useCallback(
    (playerId: string) => {
      void run(playerId, () => hostMarkPlayerOut({ partyPlayerId: playerId }));
    },
    [run],
  );

  const handleReinstate = useCallback(
    (playerId: string) => {
      void run(playerId, () => hostMarkPlayerActive({ partyPlayerId: playerId }));
    },
    [run],
  );

  // Removal is permanent — the player can't rejoin this party (D028) — so it sits
  // behind a confirmation gate.
  const handleRemove = useCallback(
    (playerId: string, displayName: string) => {
      Alert.alert(
        `Remove ${displayName}?`,
        'They will be removed from the party and cannot rejoin.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => void run(playerId, () => hostRemovePlayer({ partyPlayerId: playerId })),
          },
        ],
      );
    },
    [run],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tap the dim backdrop to dismiss; the sheet swallows the press. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Roster</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {roster.map((entry) => {
              const locked = busyId !== null;
              const showActions = isHost && !entry.isSelf;

              return (
                <View key={entry.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <View style={styles.nameCol}>
                      <Text style={styles.name}>
                        {entry.displayName}
                        {entry.isSelf ? ' (You)' : ''}
                        {entry.isHost ? ' · Host' : ''}
                      </Text>
                      <Text style={styles.meta}>
                        {entry.status === 'active' ? 'Active' : 'Out'} · {entry.shotsCompleted}{' '}
                        {entry.shotsCompleted === 1 ? 'shot' : 'shots'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusDot,
                        entry.status === 'active' ? styles.dotActive : styles.dotOut,
                      ]}
                    />
                  </View>

                  {showActions ? (
                    <View style={styles.actions}>
                      {entry.status === 'active' ? (
                        <>
                          <ActionChip
                            label="Mark Out"
                            onPress={() => handleMarkOut(entry.id)}
                            disabled={locked}
                          />
                          <ActionChip
                            label="Remove"
                            variant="danger"
                            onPress={() => handleRemove(entry.id, entry.displayName)}
                            disabled={locked}
                          />
                        </>
                      ) : (
                        <ActionChip
                          label="Reinstate"
                          onPress={() => handleReinstate(entry.id)}
                          disabled={locked}
                        />
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          <ErrorBanner message={error} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Compact inline action button — the shared Button primitive is sized for
// full-width primary actions, too large for a roster row.
function ActionChip({
  label,
  onPress,
  variant = 'neutral',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'neutral' | 'danger';
  disabled?: boolean;
}): React.JSX.Element {
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.chip,
        isDanger && styles.chipDanger,
        pressed && styles.chipPressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text style={[styles.chipLabel, isDanger && styles.chipLabelDanger]}>{label}</Text>
    </Pressable>
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  close: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: SPACING.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameCol: {
    flex: 1,
    gap: SPACING.xs,
  },
  name: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
    marginLeft: SPACING.md,
  },
  dotActive: {
    backgroundColor: COLORS.success,
  },
  dotOut: {
    backgroundColor: COLORS.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  chip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.buttonOutlineBorder,
  },
  chipDanger: {
    borderColor: COLORS.danger,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.buttonOutlineText,
  },
  chipLabelDanger: {
    color: COLORS.danger,
  },
});
