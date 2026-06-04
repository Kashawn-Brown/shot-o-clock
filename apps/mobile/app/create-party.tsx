// Create Party — host configures a new party.
//
// Phase 3 placeholder: renders the full form shape from the Figma wireframe
// (name, intervals, shot window, elimination toggle, grace mode) but holds no
// real state and calls no RPC. "Create Party" navigates to a placeholder
// lobby. Real validation + create_party wiring land in Phase 5.

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

const PLACEHOLDER_PARTY_ID = 'test-party';
const GRACE_MODES = ['No Grace', 'Grace', 'Unlimited'] as const;

export default function CreatePartyScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>Create Party</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Party Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Friday Night Shots"
            placeholderTextColor={COLORS.textSecondary}
            editable={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Starting Interval (minutes)</Text>
          <TextInput style={styles.input} placeholder="5" editable={false} />
          <Text style={styles.hint}>Time until first shot</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interval Increase (minutes)</Text>
          <TextInput style={styles.input} placeholder="2" editable={false} />
          <Text style={styles.hint}>How much longer each round gets</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Shot Window Length (seconds)</Text>
          <TextInput style={styles.input} placeholder="30" editable={false} />
          <Text style={styles.hint}>Time players have to take their shot</Text>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.label}>Elimination Mode</Text>
            <Text style={styles.hint}>Players who miss are eliminated</Text>
          </View>
          <Switch value={false} disabled />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Grace Mode</Text>
          <View style={styles.segment}>
            {GRACE_MODES.map((mode, index) => (
              <View
                key={mode}
                style={[styles.segmentItem, index === 0 && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentLabel, index === 0 && styles.segmentLabelActive]}>
                  {mode}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Button
          label="Create Party"
          onPress={() => router.push(`/party/${PLACEHOLDER_PARTY_ID}/lobby`)}
          style={styles.submit}
        />
      </ScrollView>
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
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  field: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  toggleText: {
    gap: SPACING.xs,
    flexShrink: 1,
  },
  segment: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  segmentItemActive: {
    backgroundColor: COLORS.buttonFilled,
    borderColor: COLORS.buttonFilled,
  },
  segmentLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  segmentLabelActive: {
    color: COLORS.buttonFilledText,
    fontWeight: FONT_WEIGHT.medium,
  },
  submit: {
    marginTop: SPACING.md,
  },
});
