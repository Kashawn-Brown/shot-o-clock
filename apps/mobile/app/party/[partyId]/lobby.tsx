// Lobby — pre-game waiting room. Single file that adapts for host vs player
// (CLAUDE.md screen inventory): host sees the join code + Start Game, a player
// sees "Waiting for host to start" + Leave Party.
//
// Phase 3 placeholder: renders the host layout with mock roster and no role
// detection. Real role-based rendering + realtime roster land in Phase 6.
// "Start Game" navigates to the placeholder timer.

import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const MOCK_PLAYERS = [
  { name: 'Alex (You)', isHost: true },
  { name: 'Jordan', isHost: false },
  { name: 'Casey', isHost: false },
  { name: 'Morgan', isHost: false },
];

export default function LobbyScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
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
  },
});
