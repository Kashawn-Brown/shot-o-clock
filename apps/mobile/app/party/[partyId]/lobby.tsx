// Lobby — pre-game waiting room. Single file that adapts for host vs player
// (CLAUDE.md screen inventory): the host sees the join code + Start Game, a
// player sees "Waiting for host to start." Role is read from the caller's own
// roster row via useLobby (lobbyView.ts), not assumed.
//
// Phase 6: wired to real party state. The party name, join code, and roster all
// come from get_party_state (useLobby); the Phase 3 mocks are gone. This is the
// read-only slice — the realtime party_players subscription that keeps the
// roster in sync across devices, and host remove / start gating, are the next
// Phase 6 tasks. "Start Game" still navigates to the placeholder timer (Phase 7
// owns start_game). The join-code copy button is inert pending expo-clipboard.
//
// Phase 5 carry-over: the confirmation-gated back/leave control. Role drives
// nothing here yet — exit still tries end_party (host) and falls back to
// leave_party (guest) on NOT_HOST — so it works even before the snapshot loads.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { endParty } from '@/features/party/api/endParty';
import { leaveParty } from '@/features/party/api/leaveParty';
import { useLobby } from '@/features/party/useLobby';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

export default function LobbyScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { status, session, view, errorMessage: loadError } = useLobby(partyId);

  const [leaving, setLeaving] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  // Exit the party and return home. We don't branch on role here so the control
  // works even before the snapshot resolves: try end_party (host) and fall back
  // to leave_party (guest) on NOT_HOST. end_party is idempotent once ended.
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

  const isHost = view?.isHost ?? false;
  const roster = view?.roster ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={confirmExit} accessibilityRole="button" hitSlop={8} disabled={leaving}>
          <Text style={styles.back}>←</Text>
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
              <Text style={styles.code}>{session?.join_code}</Text>
              {/* Inert until expo-clipboard is added (needs user sign-off). */}
              <Button label="Copy / Share Code" variant="outline" onPress={() => {}} />
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Players ({roster.length})</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {roster.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <View style={styles.avatar} />
                <View>
                  <Text style={styles.playerName}>
                    {player.displayName}
                    {player.isSelf ? ' (You)' : ''}
                  </Text>
                  {player.isHost ? <Text style={styles.hostBadge}>Host</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <ErrorBanner message={exitError} />
            {isHost ? (
              <Button label="Start Game" onPress={() => router.push(`/party/${partyId}/timer`)} />
            ) : (
              <Text style={styles.waiting}>Waiting for host to start…</Text>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

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
  code: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 4,
    color: COLORS.buttonFilledText,
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
  footer: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  waiting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
