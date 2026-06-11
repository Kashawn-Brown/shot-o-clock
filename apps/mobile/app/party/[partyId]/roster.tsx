// Roster — full player list, presented as a modal over the timer/results
// screen. Active players on top, Out players greyed below. The host sees Mark
// Out / Mark Active / Remove actions; a player sees a read-only list.
//
// Phase 3 placeholder: mock roster, inert actions, no realtime. Close dismisses
// the modal back to wherever it was opened from.

import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { useGameExit } from '@/features/party/useGameExit';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const ACTIVE_PLAYERS = [
  { name: 'Alex', isHost: true, grace: '1 grace' },
  { name: 'Jordan', isHost: false },
  { name: 'Morgan', isHost: false },
];
const OUT_PLAYERS = [{ name: 'Casey' }, { name: 'Sam' }];

export default function RosterScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  // Close dismisses the modal back to the game; Leave Party is the direct exit
  // home so the roster is never a dead end (end_party for host, mark_self_out →
  // home for guest). See D032.
  const { leaving, confirmExit } = useGameExit(partyId);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Roster</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.partyName}>Friday Night Shots</Text>
        <Text style={styles.counts}>
          {ACTIVE_PLAYERS.length} Active · {OUT_PLAYERS.length} Out
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>● Active ({ACTIVE_PLAYERS.length})</Text>
        {ACTIVE_PLAYERS.map((player) => (
          <View key={player.name} style={styles.playerRow}>
            <View style={styles.avatar} />
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.name}</Text>
              <View style={styles.tags}>
                {player.isHost ? <Text style={styles.tag}>Host</Text> : null}
                {player.grace ? <Text style={styles.graceTag}>{player.grace}</Text> : null}
              </View>
            </View>
            {!player.isHost ? <Text style={styles.action}>Mark Out</Text> : null}
          </View>
        ))}

        <Text style={[styles.sectionTitle, styles.outTitle]}>● Out ({OUT_PLAYERS.length})</Text>
        {OUT_PLAYERS.map((player) => (
          <View key={player.name} style={[styles.playerRow, styles.outRow]}>
            <View style={styles.avatar} />
            <Text style={[styles.playerName, styles.playerInfo]}>{player.name}</Text>
            <Text style={styles.action}>Mark Active</Text>
            <Text style={[styles.action, styles.removeAction]}>Remove</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Leave Party" variant="outline" onPress={confirmExit} disabled={leaving} />
        <Button label="Close" variant="outline" onPress={() => router.back()} />
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  summary: {
    alignItems: 'center',
    paddingBottom: SPACING.md,
  },
  partyName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  counts: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.success,
  },
  outTitle: {
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  outRow: {
    opacity: 0.6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  tags: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  tag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  graceTag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },
  action: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  removeAction: {
    color: COLORS.danger,
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
});
