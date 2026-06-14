// Rules / How to Play — static explainer reached from Home.
//
// Phase 3 placeholder: layout only. Content mirrors the Figma wireframe
// (how it works, basic rules, grace modes) so the structure is real even
// though copy may be refined later.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const BASIC_RULES = [
  'Host creates a party with a join code',
  'Players join using the code',
  'A countdown timer runs between shots',
  'When "Shot O\'Clock" happens, all active players take a shot',
  'Players have a set window to mark themselves as "Done"',
  'Players who miss the window or tap "I\'m Out" are eliminated (optional)',
  'Host can manage rounds and player status',
  'Game continues until host ends the party',
];

export default function RulesScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Rules / How to Play</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How Shot O&apos;Clock Works</Text>
          <Text style={styles.body}>
            Shot O&apos;Clock is a synchronized drinking game timer for groups. One person hosts,
            others join, and everyone plays together.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Basic Rules</Text>
          {BASIC_RULES.map((rule, index) => (
            <Text key={rule} style={styles.body}>
              {index + 1}. {rule}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Grace Modes</Text>
          <Text style={styles.body}>No Grace: Miss a shot, you&apos;re out</Text>
          <Text style={styles.body}>Grace: One free pass to skip a shot</Text>
          <Text style={styles.body}>Unlimited Grace: Players can skip without penalty</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Got It" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

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
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  body: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
  },
});
