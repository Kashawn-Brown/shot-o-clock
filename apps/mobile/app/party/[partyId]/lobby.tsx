// Lobby — pre-game waiting room. Single file that adapts for host vs player
// (CLAUDE.md screen inventory): host sees the join code + Start Game, a player
// sees "Waiting for host to start" + Leave Party.
//
// Phase 3 placeholder: renders the host layout with mock roster and no role
// detection. Real role-based rendering + realtime roster land in Phase 6.
// "Start Game" navigates to the placeholder timer.
//
// Phase 5 addition: a real back/leave control with a confirmation gate, so a
// host can end the party (or a guest can leave) and return home instead of being
// trapped here by the launch reconnect. Role isn't loaded yet, so exit tries
// end_party and falls back to leave_party on NOT_HOST. The full role-aware lobby
// is Phase 6.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { endParty } from '@/features/party/api/endParty';
import { leaveParty } from '@/features/party/api/leaveParty';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const MOCK_PLAYERS = [
  { name: 'Alex (You)', isHost: true },
  { name: 'Jordan', isHost: false },
  { name: 'Casey', isHost: false },
  { name: 'Morgan', isHost: false },
];

export default function LobbyScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const [leaving, setLeaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Exit the party and return home. We don't know the caller's role yet, so try
  // end_party (host) and fall back to leave_party (guest) on NOT_HOST. end_party
  // is idempotent if the party is already ended.
  const handleExit = useCallback(async () => {
    if (!partyId || leaving) return;

    setErrorMessage(null);
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
      setErrorMessage(rpcErrorMessage(left.error_code));
      setLeaving(false);
      return;
    }

    setErrorMessage(rpcErrorMessage(ended.error_code));
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={confirmExit} accessibilityRole="button" hitSlop={8} disabled={leaving}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Lobby</Text>
      </View>

      <Text style={styles.partyName}>Friday Night Shots</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Join Code</Text>
        <Text style={styles.code}>ABC123</Text>
        <Button label="Copy / Share Code" variant="outline" onPress={() => {}} />
      </View>

      <Text style={styles.sectionTitle}>Players ({MOCK_PLAYERS.length})</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {MOCK_PLAYERS.map((player) => (
          <View key={player.name} style={styles.playerRow}>
            <View style={styles.avatar} />
            <View>
              <Text style={styles.playerName}>{player.name}</Text>
              {player.isHost ? <Text style={styles.hostBadge}>Host</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <ErrorBanner message={errorMessage} />
        <Button label="Start Game" onPress={() => router.push(`/party/${partyId}/timer`)} />
      </View>
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
});
