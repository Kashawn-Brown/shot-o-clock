// Round Results — per-round outcome breakdown. Single file that adapts for
// host vs player: the host sees grouped lists (Completed / Missed / Used Grace
// / Out) with per-player override actions; a player sees their own result hero
// plus the other players' badges.
//
// NOTE: there is deliberately NO "Start Next Round" button (D014 — rounds
// auto-advance server-side). The next round's timer appears on its own; the
// host's only terminal action here is End Party. The "next round starting"
// affordance below stands in for that automatic transition so the placeholder
// flow stays tappable.
//
// Phase 3 placeholder: mock outcomes, override actions are inert, no realtime.

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type Outcome = {
  title: string;
  accent: string;
  players: { name: string; action?: string }[];
};

const OUTCOME_GROUPS: Outcome[] = [
  {
    title: 'Completed (2)',
    accent: COLORS.success,
    players: [{ name: 'Alex (You)' }, { name: 'Jordan', action: 'Mark Out' }],
  },
  {
    title: 'Missed (1)',
    accent: COLORS.danger,
    players: [{ name: 'Casey', action: 'Mark Active' }],
  },
  {
    title: 'Used Grace (1)',
    accent: COLORS.warning,
    players: [{ name: 'Morgan', action: 'Mark Out' }],
  },
  {
    title: 'Out (1)',
    accent: COLORS.textSecondary,
    players: [{ name: 'Sam', action: 'Mark Active' }],
  },
];

export default function ResultsScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Round 3 Results</Text>
        <Text style={styles.subtitle}>Shot #3</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {OUTCOME_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={[styles.groupTitle, { color: group.accent }]}>{group.title}</Text>
            {group.players.map((player) => (
              <View key={player.name} style={[styles.playerRow, { borderLeftColor: group.accent }]}>
                <View style={styles.avatar} />
                <Text style={styles.playerName}>{player.name}</Text>
                {player.action ? <Text style={styles.action}>{player.action}</Text> : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {/* Stands in for the server-driven auto-advance (D014). */}
        <Pressable onPress={() => router.push(`/party/${partyId}/timer`)} style={styles.waiting}>
          <Text style={styles.waitingText}>● Next round starting…</Text>
        </Pressable>
        <Button
          label="End Party"
          variant="outline"
          onPress={() => router.push(`/party/${partyId}/summary`)}
        />
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
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  group: {
    gap: SPACING.sm,
  },
  groupTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderLeftWidth: 3,
    padding: SPACING.md,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  playerName: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  action: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  waiting: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  waitingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
  },
});
