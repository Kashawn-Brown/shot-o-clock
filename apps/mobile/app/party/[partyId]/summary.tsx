// Final Summary — the whole-game wrap-up shown to every device when the party
// ends (CLAUDE.md §4.1; plan.md Phase 11). Not a repeat of the last Round Results
// (that's per-round) — this ranks the whole game by cumulative shots taken.
//
// Terminal and read-only: it performs NO mutations (Phase 11 Done-when). A single
// get_party_state read feeds the pure derivePartySummary; the screen just renders
// what it returns. Members can still read an ended party (the roster rows stay,
// is_active_party_member doesn't gate on session.status); a removed player can't,
// but they're routed home before reaching here, never to the summary.
//
// "Back to Home" resets the navigation stack to the launch screen.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useAuth } from '@/features/auth/AuthProvider';
import { getPartyState } from '@/features/party/api/partyState';
import { derivePartySummary, type PartySummaryView } from '@/features/game/partySummary';
import { deriveHostOnlySummary, type HostOnlyEndView } from '@/features/game/hostOnlySummary';
import { rpcErrorMessage } from '@/lib/errors';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type LoadStatus = 'loading' | 'ready' | 'error';

// "Alex" / "Alex & Bo" / "Alex, Bo & Cy" — for the hero when 1–3 players tie.
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function SummaryScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const { userId } = useAuth();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [view, setView] = useState<PartySummaryView | null>(null);
  // Single-phone (host_only) parties get a minimal end view instead of standings
  // — there are no tracked players to rank (D040, D050). Mutually exclusive with
  // `view`: exactly one is set once the snapshot loads.
  const [hostOnlyView, setHostOnlyView] = useState<HostOnlyEndView | null>(null);
  const [partyName, setPartyName] = useState('');
  // True only when the party was auto-ended for inactivity (server flag, set in
  // finalize_round_outcomes). host_only parties are exempt from auto-end, so this
  // is only ever true on the multi-device summary.
  const [autoEndedInactive, setAutoEndedInactive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // One-shot read on mount — the summary is terminal, so no polling / realtime /
  // routing (unlike useTimerSession). Derive the whole-game ranking from the
  // snapshot's roster.
  useEffect(() => {
    if (!partyId) {
      setStatus('error');
      setErrorMessage('Missing party.');
      return;
    }
    let active = true;
    getPartyState(partyId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setStatus('error');
          setErrorMessage(rpcErrorMessage(result.error_code));
          return;
        }
        const { session, settings, players } = result.data;
        setPartyName(session.name);
        setAutoEndedInactive(session.auto_ended_inactive);
        if (settings.host_only) {
          setHostOnlyView(
            deriveHostOnlySummary({
              currentRoundNumber: session.current_round_number,
              startedAt: session.started_at,
              endedAt: session.ended_at,
            }),
          );
          setStatus('ready');
          return;
        }
        const me = players.find((player) => player.user_id === userId) ?? null;
        setView(
          derivePartySummary(players, me?.id ?? null, {
            partyName: session.name,
            totalRounds: session.current_round_number,
            eliminationEnabled: settings.elimination_enabled,
          }),
        );
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        setErrorMessage('Could not load the summary.');
      });
    return () => {
      active = false;
    };
  }, [partyId, userId]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  if (status === 'error' || (!view && !hostOnlyView)) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ErrorBanner message={errorMessage} />
        <View style={styles.errorFooter}>
          <Button label="Back to Home" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  // Single-phone end screen: rounds played + total time elapsed, no standings
  // (D040, D050). Terminal and read-only, same as the multi-device summary below.
  if (hostOnlyView) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.partyName}>{partyName}</Text>
          <Text style={styles.title}>Game Complete!</Text>
        </View>

        <View style={styles.hostOnlyContent}>
          <View style={styles.roundsCard}>
            <Text style={styles.roundsNumber}>{hostOnlyView.rounds}</Text>
            <Text style={styles.roundsLabel}>
              {hostOnlyView.rounds === 1 ? 'Round' : 'Rounds'}
            </Text>
          </View>

          <View style={styles.roundsCard}>
            <Text style={styles.roundsNumber}>{hostOnlyView.elapsedLabel ?? '—'}</Text>
            <Text style={styles.roundsLabel}>Total time</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Button label="Back to Home" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  // From here `view` is non-null (the !view && !hostOnlyView guard above returned).
  if (!view) return <View />;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.partyName}>{view.partyName}</Text>
        <Text style={styles.title}>Game Complete!</Text>
        {autoEndedInactive ? (
          <Text style={styles.inactivityNote}>Game ended due to inactivity</Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Hero view={view} />

        <View style={styles.roundsCard}>
          <Text style={styles.roundsNumber}>{view.totalRounds}</Text>
          <Text style={styles.roundsLabel}>{view.totalRounds === 1 ? 'Round' : 'Rounds'}</Text>
        </View>

        <Text style={styles.sectionTitle}>Final Standings</Text>
        <View style={styles.standingsList}>
        {view.standings.map((standing) => {
          // Olympic rank from derivePartySummary (tied players share a rank);
          // removed players carry null and show a "Removed" badge instead.
          const rank = standing.rank;
          return (
            <View
              key={standing.playerId}
              style={[styles.standingRow, standing.isRemoved && styles.standingRemoved]}
            >
              <Text style={styles.rank}>{rank ?? '—'}</Text>
              <View style={styles.avatar} />
              <View style={styles.standingInfo}>
                <Text style={styles.standingName}>
                  {standing.displayName}
                  {standing.isYou ? ' (You)' : ''}
                </Text>
                <Text style={styles.standingDetail}>
                  {standing.shotCount} {standing.shotCount === 1 ? 'shot' : 'shots'}
                </Text>
              </View>
              {standing.isRemoved ? (
                <Text style={styles.removedBadge}>Removed</Text>
              ) : standing.isLeader ? (
                <Text style={styles.trophyBadge}>🏆</Text>
              ) : null}
            </View>
          );
        })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Back to Home" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

// The "who won" card. Names for 1–3 tied leaders, a count for 4+, and a muted
// message when nobody took a shot.
function Hero({ view }: { view: PartySummaryView }): React.JSX.Element {
  if (view.heroMode === 'none') {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{view.heroTitle}</Text>
        <Text style={styles.heroEmpty}>No shots taken this game</Text>
      </View>
    );
  }

  if (view.heroMode === 'count') {
    return (
      <View style={styles.hero}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.heroLabel}>{view.heroTitle}</Text>
        <Text style={styles.heroNames}>
          {view.leaderCount} people at {view.topShotCount}{' '}
          {view.topShotCount === 1 ? 'shot' : 'shots'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <Text style={styles.trophy}>🏆</Text>
      <Text style={styles.heroLabel}>{view.heroTitle}</Text>
      <Text style={styles.heroNames}>{joinNames(view.leaders.map((leader) => leader.displayName))}</Text>
      <Text style={styles.heroSub}>
        {view.topShotCount} {view.topShotCount === 1 ? 'shot' : 'shots'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.lg,
  },
  errorFooter: {
    alignSelf: 'stretch',
  },
  header: {
    alignItems: 'center',
    // Final Summary header — Navy surface (brand dark); the winner accent below
    // carries the Indigo pop.
    backgroundColor: COLORS.brandNavy,
    paddingVertical: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.md,
    // fontWeight: FONT_WEIGHT.bold,
    color: COLORS.buttonFilledText,
  },
  // Shown under the title only when the party was auto-ended for inactivity.
  inactivityNote: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.buttonFilledText,
    opacity: 0.7,
  },
  partyName: {
    fontSize: FONT_SIZE.custom_1,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.buttonFilledText,
    // opacity: 0.7,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  // Host-only end screen: the two stat cards centred in the available space rather
  // than scrolling a standings list.
  hostOnlyContent: {
    flex: 1,
    justifyContent: 'center',
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
    // Winner accent — brand Indigo (the "game over" pop).
    color: COLORS.champion,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  heroEmpty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
  standingsList: {
    gap: 12, // tighter than the content gap so the standings rows sit closer
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  standingRemoved: {
    opacity: 0.5,
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
  trophyBadge: {
    fontSize: FONT_SIZE.sm,
  },
  removedBadge: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
  },
  footer: {
    padding: SPACING.lg,
  },
});
