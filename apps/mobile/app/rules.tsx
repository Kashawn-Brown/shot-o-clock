// Rules / How to Play — static explainer reached from Home.
//
// Six collapsible sections (D049): the first is always open, the rest default
// closed and toggle their own state. Content is current to the shipped behavior —
// grace-aware skip (D034), mid-game joining (D041/D042), Out vs Left (D037), and
// host-only mode (D050). No animation library: a section just shows/hides its body
// with a chevron indicator.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// One card. `alwaysOpen` renders expanded with no chevron and can't be collapsed;
// the rest start closed and manage their own open state.
function CollapsibleSection({
  title,
  alwaysOpen = false,
  children,
}: {
  title: string;
  alwaysOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const expanded = alwaysOpen || open;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={alwaysOpen ? undefined : () => setOpen((prev) => !prev)}
        disabled={alwaysOpen}
        accessibilityRole={alwaysOpen ? undefined : 'button'}
        style={styles.cardHeader}
      >
        <Text style={styles.cardTitle}>{title}</Text>
        {alwaysOpen ? null : (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={CHEVRON_SIZE}
            color={COLORS.textSecondary}
          />
        )}
      </Pressable>
      {expanded ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

// A "• " bulleted line; the dot sits in its own column so wrapped text stays
// aligned under the first word rather than under the bullet.
function Bullet({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

function Faq({ q, a }: { q: string; a: string }): React.JSX.Element {
  return (
    <View style={styles.faqItem}>
      <Text style={styles.faqQuestion}>{q}</Text>
      <Text style={styles.body}>{a}</Text>
    </View>
  );
}

export default function RulesScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title="Rules / How to Play" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <CollapsibleSection title="How Shot O'Clock works" alwaysOpen>
          <Text style={styles.body}>
            Shot O&apos;Clock is a synced drinking-game timer for groups. One person hosts a party,
            everyone else joins with a code, and a shared countdown runs between shots. When it hits
            zero, it&apos;s <Text style={styles.bold}>Shot O&apos;Clock!</Text> All active players take
            a shot together, mark themselves Done in time, and the next round begins automatically.
          </Text>
        </CollapsibleSection>

        <CollapsibleSection title="Starting a party">
          <Text style={styles.body}>When you create a party, you choose how it plays:</Text>
          <Bullet>
            <Text style={styles.bold}>Starting interval</Text> — how long the first countdown runs
            before the first Shot O&apos;Clock.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Interval increment</Text> — how much longer each round&apos;s
            countdown gets than the last.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Shot window</Text> — how long players have to take their shot
            and tap Done once Shot O&apos;Clock hits.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Elimination</Text> — whether missing a shot can knock you out
            (see Elimination).
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Grace mode</Text> — how forgiving elimination is (only matters
            when elimination is on).
          </Bullet>
          <Text style={styles.body}>
            While the game runs, the host can pause and resume the countdown, add time to it, mark a
            player out or reinstate one, remove a player, and end the party.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>Host-only mode: </Text>one phone runs the whole game. No one
            else joins and no one&apos;s shots are tracked. The host&apos;s screen becomes the shared
            display for the game and the loop runs until the host ends it.
          </Text>
        </CollapsibleSection>

        <CollapsibleSection title="Joining a party">
          <Bullet>Get the join code from the host — they can share it in one tap from the lobby.</Bullet>
          <Bullet>Enter the code on the Join screen to join the party.</Bullet>
          <Bullet>
            You can join even <Text style={styles.bold}>after the game has started</Text> — you&apos;ll
            drop straight into the live round.
          </Bullet>
          <Bullet>
            You can even <Text style={styles.bold}>join mid-game</Text> and you&apos;ll
            drop straight into the live round.
          </Bullet>
          <View style={styles.subList}>
            <Bullet>
            <Text style={styles.italic}>Heads up: you&apos;re dropped right in the middle of a live game immediately 
              so don&apos;t join as the shot window is closing. Instead wait for the next full round to start</Text>
            </Bullet>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="The round loop">
          <Bullet>A countdown runs between shots, getting a little longer each round.</Bullet>
          <Bullet>When it hits zero, the full-screen Shot O&apos;Clock moment appears.</Bullet>
          <Bullet>
            During the shot window, take your shot and tap <Text style={styles.bold}>Done</Text>. 
            <Text style={styles.italic}> Or tap <Text style={styles.bold}>I&apos;m Out</Text> to skip the shot.</Text>
          </Bullet>
          <Bullet>
            When the window closes, the round results will show briefly, while the next round&apos;s
            countdown starts automatically.
          </Bullet>
        </CollapsibleSection>

        <CollapsibleSection title="Elimination">
          <Bullet>
            <Text style={styles.bold}>Elimination off</Text> — skip or miss shots freely; no one is
            eliminated. The game just tracks who took each shot.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Elimination on</Text> — missing a shot has consequences,
            softened by the party&apos;s grace mode:
          </Bullet>
          <View style={styles.subList}>
            <Bullet>
              <Text style={styles.bold}>No Grace</Text> — miss once and you&apos;re out.
            </Bullet>
            <Bullet>
              <Text style={styles.bold}>Grace</Text> — one free skip/miss. You can opt-out once per game by
              choosing to <Text style={styles.bold}>Use Grace</Text>.
            </Bullet>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="FAQ">
          <Faq
            q="What if I miss a shot by accident?"
            a="The host can reinstate you to bring you back in."
          />
          <Faq
            q="Can a removed player rejoin?"
            a="No — once the host removes you from the lobby or game, you can't rejoin."
          />
          <Faq
            q="What if I join right when Shot O'Clock triggers?"
            a="You'll be in for that round immediately — better to wait for the next countdown to start fresh."
          />
          <Faq q="Can the host play too?" a="Yes — the host plays as a normal player, with game controls on top." />
          <Faq
            q="What's the difference between Out and Left?"
            a="Out means eliminated. Left means you chose to leave — you can come back by rejoining with the code."
          />
        </CollapsibleSection>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Got It" onPress={() => router.back()} />
        <Text style={styles.footerNote}>
          Shot O&apos;Clock is meant to be fun. Know your limits, look out for each other, and
          it&apos;s always okay to tap I&apos;m Out.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const CHEVRON_SIZE = 20; // collapsible section expand/collapse indicator

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  cardTitle: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  cardBody: {
    gap: SPACING.sm,
    paddingTop: SPACING.md,
  },
  body: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  bold: {
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  italic: {
    fontStyle: 'italic',
  },
  bulletRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bulletDot: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  // Nested bullets (the grace modes under "Elimination on") indent under the parent.
  subList: {
    gap: SPACING.sm,
    paddingLeft: SPACING.lg,
  },
  faqItem: {
    gap: SPACING.xs,
  },
  faqQuestion: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  footerNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 18,
  },
});
