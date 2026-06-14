// Lobby — pre-game waiting room. Single file that adapts for host vs player
// (CLAUDE.md screen inventory): the host sees the join code, a removable roster,
// and Start Game; a player sees "Waiting for host to start" and Leave Party.
// Role is read from the caller's own roster row via useLobby (lobbyView.ts).
//
// Phase 6: wired to real party state with a live roster (useLobby's realtime
// subscription). The host can remove any non-host player (host_remove_player);
// the host's own row never shows a Remove action, and the RPC rejects
// CANNOT_REMOVE_HOST as a backstop. A player leaves via leave_party. Start is
// gated on at least one active player. "Start Game" calls start_game (creating
// round 1's countdown) and routes the host into the timer on success. The host
// can copy the join code to the clipboard (expo-clipboard).
//
// Exit (back arrow + player's Leave Party) is role-agnostic by construction: it
// tries end_party (host) and falls back to leave_party (guest) on NOT_HOST, so
// it works even before the snapshot resolves.

import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { endParty } from '@/features/party/api/endParty';
import { hostRemovePlayer } from '@/features/party/api/hostRemovePlayer';
import { leaveParty } from '@/features/party/api/leaveParty';
import { startGame } from '@/features/party/api/startGame';
import type { LobbyRosterEntry } from '@/features/party/lobbyView';
import { routeForPhase } from '@/features/party/reconnectRoute';
import { useLobby } from '@/features/party/useLobby';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function LobbyScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const {
    status,
    session,
    view,
    errorMessage: loadError,
    membershipLost,
    refresh,
  } = useLobby(partyId);

  const [leaving, setLeaving] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  // Locks the Start button while start_game is in flight, so a double-tap can't
  // fire two calls (the RPC is idempotent, but the lock keeps the UI honest).
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // The id of the player currently being removed, so only that row's action
  // disables while the RPC is in flight.
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Brief "Copied!" confirmation on the join-code button.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const code = session?.join_code;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    // Toast lingers ~2s — long enough to read, short enough to feel transient.
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [session?.join_code]);

  // The host removed us — surface why, then return home. (plan.md Phase 6.)
  useEffect(() => {
    if (!membershipLost) return;
    Alert.alert(
      'Removed from party',
      "The host removed you from this party. You won't be able to rejoin.",
    );
    router.replace('/');
  }, [membershipLost]);

  // When the host starts the game, every device follows the session out of the
  // lobby — driven by the party_sessions realtime subscription in useLobby. The
  // host already navigated via handleStart; this is what unsticks the *guests*
  // from "Waiting for host to start…". Guarded so it never fires over an
  // intentional exit or a removal (those route home on their own).
  const sessionStatus = session?.status;
  const sessionPhase = session?.current_phase;
  useEffect(() => {
    if (status !== 'ready' || leaving || membershipLost || !partyId || !sessionStatus) return;
    if (sessionStatus === 'lobby') return; // still waiting for the host
    if (sessionStatus === 'ended') {
      router.replace('/'); // host cancelled from the lobby — go home
      return;
    }
    // active/paused: the game is live — go to the current phase's screen.
    router.replace(`/party/${partyId}/${routeForPhase(sessionPhase ?? 'countdown')}`);
  }, [status, sessionStatus, sessionPhase, leaving, membershipLost, partyId]);

  // Exit the party and return home. Role-agnostic so it works even before the
  // snapshot resolves: try end_party (host) and fall back to leave_party (guest)
  // on NOT_HOST. end_party is idempotent once ended.
  const handleExit = useCallback(async () => {
    if (!partyId || leaving) return;

    setExitError(null);
    setLeaving(true);

    const ended = await endParty({ partySessionId: partyId });
    if (ended.ok) {
      router.replace('/');
      return;
    }

    if (ended.error_code === 'NOT_HOST') {
      const left = await leaveParty({ partySessionId: partyId });
      if (left.ok) {
        router.replace('/');
        return;
      }
      setExitError(rpcErrorMessage(left.error_code));
      setLeaving(false);
      return;
    }

    setExitError(rpcErrorMessage(ended.error_code));
    setLeaving(false);
  }, [partyId, leaving]);

  // Confirmation gate — leaving is destructive (ends the party for a host).
  const confirmExit = useCallback(() => {
    if (leaving) return;
    Alert.alert('Leave party?', 'If you are the host, this ends the party for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: handleExit },
    ]);
  }, [leaving, handleExit]);

  // Host starts the game: start_game creates round 1's countdown, then we route
  // into the timer. router.replace (not push) because the lobby is no longer a
  // valid back target once the game is active (leave_party rejects mid-game).
  const handleStart = useCallback(async () => {
    if (!partyId || starting) return;

    setStartError(null);
    setStarting(true);

    const result = await startGame({ partySessionId: partyId });
    if (result.ok) {
      router.replace(`/party/${partyId}/timer`);
      return;
    }

    setStartError(rpcErrorMessage(result.error_code));
    setStarting(false);
  }, [partyId, starting]);

  // Host removes a player. Guarded by a confirmation; on success the silent
  // refresh drops them from the roster immediately (the row is now 'removed',
  // which deriveLobbyView filters out) without waiting on realtime.
  const handleRemove = useCallback(
    (player: LobbyRosterEntry) => {
      if (removingId) return;
      Alert.alert(
        'Remove player?',
        `Remove ${player.displayName} from the party? This is permanent — they won't be able to rejoin.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setRemoveError(null);
              setRemovingId(player.id);
              const result = await hostRemovePlayer({ partyPlayerId: player.id });
              setRemovingId(null);
              if (result.ok) {
                refresh();
                return;
              }
              setRemoveError(rpcErrorMessage(result.error_code));
            },
          },
        ],
      );
    },
    [removingId, refresh],
  );

  const isHost = view?.isHost ?? false;
  const roster = view?.roster ?? [];
  const activePlayerCount = view?.activePlayerCount ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={confirmExit} accessibilityRole="button" hitSlop={8} disabled={leaving}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Lobby</Text>
      </View>

      {status === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.textPrimary} />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centered}>
          <ErrorBanner message={loadError} />
        </View>
      ) : (
        <>
          <Text style={styles.partyName}>{session?.name}</Text>

          {isHost ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Join Code</Text>
              {/* The code itself is the tap target — the icon + hint make that
                  obvious without the host having to discover it by accident. */}
              <Pressable
                onPress={handleCopy}
                accessibilityRole="button"
                accessibilityLabel="Copy join code"
                style={styles.codeRow}
                hitSlop={8}
              >
                <Text style={styles.code}>{session?.join_code}</Text>
              </Pressable>
              <Text style={styles.codeHint} onPress={handleCopy}>Tap to copy</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Players ({roster.length})</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {roster.map((player) => {
              // Host can remove any non-host player but never themselves — the
              // host row is both isHost and isSelf, so this hides it there.
              const canRemove = isHost && !player.isHost && !player.isSelf;
              return (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.avatar} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {player.displayName}
                      {player.isSelf ? ' (You)' : ''}
                    </Text>
                    {player.isHost ? <Text style={styles.hostBadge}>Host</Text> : null}
                  </View>
                  {canRemove ? (
                    <Pressable
                      onPress={() => handleRemove(player)}
                      accessibilityRole="button"
                      hitSlop={8}
                      disabled={removingId !== null}
                    >
                      <Text style={styles.remove}>
                        {removingId === player.id ? 'Removing…' : 'Remove'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <ErrorBanner message={removeError ?? exitError ?? startError} />
            {isHost ? (
              <Button
                label={starting ? 'Starting…' : 'Start Game'}
                onPress={handleStart}
                disabled={starting || activePlayerCount < 1}
              />
            ) : (
              <>
                <Text style={styles.waiting}>Waiting for host to start…</Text>
                <Button
                  label="Leave Party"
                  variant="outline"
                  onPress={confirmExit}
                  disabled={leaving}
                />
              </>
            )}
          </View>
        </>
      )}

      {/* Brief copy confirmation. Floats above the footer and never blocks taps
          (pointerEvents none); auto-clears via the handleCopy timer. */}
      {copied ? (
        <View style={styles.toast} pointerEvents="none">
          <View style={styles.toastPill} accessibilityRole="alert">
            <Text style={styles.toastText}>✓ Join code copied!</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Floats the toast in the middle-lower area, clear of the footer / Start button.
const TOAST_BOTTOM_OFFSET = 150;

const HEADER_ICON_SIZE = 22; // header back-arrow + settings-gear icons

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  back: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  partyName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  codeCard: {
    backgroundColor: COLORS.buttonFilled,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  codeLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.buttonFilledText,
    opacity: 0.7,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  code: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 4,
    color: COLORS.buttonFilledText,
  },
  codeHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.buttonFilledText,
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  playerInfo: {
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  playerName: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  hostBadge: {
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  remove: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.danger,
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  waiting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    bottom: TOAST_BOTTOM_OFFSET,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastPill: {
    // Translucent so the toast reads as a light overlay, not a solid block.
    backgroundColor: 'rgba(26, 26, 26, 0.75)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  toastText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.buttonFilledText,
  },
});
