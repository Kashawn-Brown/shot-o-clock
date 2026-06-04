// Final Summary — shown to every device when the party ends. Trophy, last
// standing, total rounds, and the ranked final standings.
//
// This screen is terminal and read-only: it performs no mutations. The camera
// affordance in the wireframe is a post-MVP party-album hook and is rendered
// inert here. Phase 3 placeholder: mock standings, no data. "Back to Home"
// resets the navigation stack to the launch screen.

import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const STANDINGS = [
  { rank: 1, name: 'Alex', detail: '8 shots completed', out: false },
  { rank: 2, name: 'Jordan', detail: '8 shots completed', out: false },
  { rank: 3, name: 'Morgan', detail: '5 shots completed', out: true },
  { rank: 4, name: 'Casey', detail: '3 shots completed', out: true },
  { rank: 5, name: 'Sam', detail: '2 shots completed', out: true },
];

export default function SummaryScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Party Complete!</Text>
        <Text style={styles.partyName}>Friday Night Shots</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.heroLabel}>Last Standing</Text>
          <Text style={styles.heroNames}>Alex &amp; Jordan</Text>
        </View>

        <View style={styles.roundsCard}>
          <Text style={styles.roundsNumber}>8</Text>
          <Text style={styles.roundsLabel}>Total Rounds</Text>
        </View>

        <Text style={styles.sectionTitle}>Final Standings</Text>
        {STANDINGS.map((entry) => (
          <View key={entry.name} style={[styles.standingRow, entry.out && styles.standingOut]}>
            <Text style={styles.rank}>{entry.rank}</Text>
            <View style={styles.avatar} />
            <View style={styles.standingInfo}>
              <Text style={styles.standingName}>{entry.name}</Text>
              <Text style={styles.standingDetail}>{entry.detail}</Text>
            </View>
            <Text style={styles.standingBadge}>{entry.out ? 'Out' : '🏆'}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Back to Home" onPress={() => router.replace('/')} />
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
    backgroundColor: COLORS.buttonFilled,
    paddingVertical: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.buttonFilledText,
  },
  partyName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.buttonFilledText,
    opacity: 0.7,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  hero: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  trophy: {
    fontSize: FONT_SIZE.xl,
  },
  heroLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  heroNames: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.warning,
  },
  roundsCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
  },
  roundsNumber: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  roundsLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  standingOut: {
    opacity: 0.6,
  },
  rank: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
    width: 20,
    textAlign: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  standingInfo: {
    flex: 1,
  },
  standingName: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  standingDetail: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  standingBadge: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  footer: {
    padding: SPACING.lg,
  },
});
