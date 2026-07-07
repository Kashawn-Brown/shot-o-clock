// Round Results — the between-rounds breakdown. Shown after EVERY round during
// normal play and on the zero-active halt:
//   - Normal play: the server has already auto-advanced to the next countdown
//     (D014), so this screen just lingers for a beat (AUTO_ADVANCE_SECONDS) and
//     then follows the device to the timer. A "Go to timer now" button skips the
//     wait. The next countdown is already running from phase_ends_at — this
//     screen owns NO game timer (CLAUDE.md §2.1); its countdown is a local UI
//     linger only (§2.5).
//   - Halt (everyone out): the session rests in round_complete. Terminal screen —
//     no auto-advance, no timer button; the host sees End Party.
//   - Review (opened from the timer's "Round N Results" button, review=1): shows a
//     past round with no auto-advance — the user chose to look — and a Back button.
//
// Host and player views are identical in Phase 9 (read-only). Per-player override
// actions (Mark Out / Active) are Phase 10. The grouping/badges come from the pure
// deriveRoundResults; the outcome rows come from useRoundOutcomes (realtime).
//
// Round id resolution: the completed round's id is passed at navigation time
// (roundId param — current_round_number - 1 once the session is in countdown),
// falling back to session.current_round.id for a reconnect straight into the halt,
// where current_round_number hasn't advanced.

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { getRoundIdByNumber } from '@/features/game/api/roundByNumber';
import { getRoundWindow } from '@/features/game/api/roundWindow';
import {
  deriveRoundResults,
  type ResultGroupKey,
  type ResultRow,
  type RoundWindow,
} from '@/features/game/roundResults';
import { useRoundOutcomes } from '@/features/game/useRoundOutcomes';
import { useGameExit } from '@/features/party/useGameExit';
import { useBlockBack } from '@/features/party/useBlockBack';
import { useTimerSession } from '@/features/party/useTimerSession';
import { supabase } from '@/lib/supabase';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// How long the results linger before the device follows the server into the next
// round's countdown. Local UI only — not a game-state timer.
const AUTO_ADVANCE_SECONDS = 10;

const GROUP_ACCENT: Record<ResultGroupKey, string> = {
  took_shot: COLORS.success,
  used_grace: COLORS.grace,
  skipped: COLORS.textSecondary,
  missed: COLORS.textSecondary,
  out: COLORS.danger,
  left: COLORS.textSecondary,
  kicked: COLORS.danger,
};

// Vector icon shown before each section label (Ionicons — not emoji, so the
// shield renders blue on every platform and the rest stay consistently tinted to
// the group accent). checkmark = done, shield = grace, close = missed/out.
const GROUP_ICON: Record<ResultGroupKey, React.ComponentProps<typeof Ionicons>['name']> = {
  took_shot: 'checkmark-circle',
  used_grace: 'shield-outline',
  skipped: 'play-skip-forward',
  missed: 'close-circle',
  out: 'close-circle',
  left: 'exit-outline',
  kicked: 'remove-circle',
};

const GROUP_ICON_SIZE = 18;

// Personalised hero copy for the caller's own outcome.
const HERO_COPY: Record<ResultGroupKey, string> = {
  took_shot: 'You took the shot',
  used_grace: 'Used Grace',
  skipped: 'You skipped this round',
  missed: 'You missed — still in',
  out: "You're out",
  left: 'You left the party',
  kicked: 'Removed by the host',
};

export default function ResultsScreen(): React.JSX.Element {
  const { partyId, roundId, roundNumber, review } = useLocalSearchParams<{
    partyId: string;
    roundId?: string;
    roundNumber?: string;
    review?: string;
  }>();

  const { status, session, currentRound, players, me, errorMessage } = useTimerSession(partyId);
  // Shared exit hook — also backs the halt's End Party (host → end_party → Final
  // Summary, guest → mark_self_out → home). See D032. The halt uses exitNow (no
  // confirmation): when everyone is out, End Party is the only logical next step.
  const { leaving, exitNow } = useGameExit(partyId);

  const isHalt = session?.current_phase === 'round_complete';
  const isReview = review === '1';
  const isHost = me?.permission_role === 'host';

  // OS back: in review mode (opened from the timer / reconnect recap), back returns
  // to the timer like the "Back to timer" button. In the auto-advancing post-round
  // results and the zero-active halt, back is inert — exits go through End Party.
  useBlockBack(isReview ? () => router.back() : undefined);

  const shownRoundNumber =
    roundNumber ??
    (currentRound?.round_number != null ? String(currentRound.round_number) : undefined);

  // Round id resolution. Priority: an explicit roundId param (the normal
  // shot-oclock → results hand-off) > a roundNumber param resolved to its id (the
  // reconnect recap and the timer's "Round N Results" button, which know the number
  // but not the id) > the current round (the halt, where no param is passed).
  const needsLookup =
    !roundId &&
    roundNumber != null &&
    currentRound?.round_number != null &&
    Number(roundNumber) !== currentRound.round_number;
  // undefined while looking up; null when not found — both keep shownRoundId off the
  // current round so we never flash the wrong round's (empty) outcomes.
  const [lookedUpRoundId, setLookedUpRoundId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!needsLookup || !partyId || roundNumber == null) {
      setLookedUpRoundId(undefined);
      return;
    }
    let active = true;
    setLookedUpRoundId(undefined);
    getRoundIdByNumber(partyId, Number(roundNumber))
      .then((id) => {
        if (active) setLookedUpRoundId(id);
      })
      .catch(() => {
        if (active) setLookedUpRoundId(null);
      });
    return () => {
      active = false;
    };
  }, [needsLookup, partyId, roundNumber]);

  const shownRoundId = roundId ?? (needsLookup ? (lookedUpRoundId ?? undefined) : currentRound?.id);

  const { outcomes } = useRoundOutcomes(partyId, shownRoundId);

  // The shown round's window, so Left / Kicked are scoped to the round they
  // happened in (they don't leak into later rounds' results).
  const [roundWindow, setRoundWindow] = useState<RoundWindow>({
    startedAt: null,
    completedAt: null,
  });
  useEffect(() => {
    if (!shownRoundId) {
      setRoundWindow({ startedAt: null, completedAt: null });
      return;
    }
    let active = true;
    getRoundWindow(shownRoundId)
      .then((window) => {
        if (active) setRoundWindow(window);
      })
      .catch(() => {
        if (active) setRoundWindow({ startedAt: null, completedAt: null });
      });
    return () => {
      active = false;
    };
  }, [shownRoundId]);

  const view = useMemo(
    () => deriveRoundResults(outcomes, players, me?.id ?? null, roundWindow),
    [outcomes, players, me?.id, roundWindow],
  );

  // Forward to the timer, carrying the round we just showed so the timer can offer
  // a "Round N Results" button back to it.
  const goToTimer = useCallback(() => {
    if (!partyId) return;
    router.replace({
      pathname: '/party/[partyId]/timer',
      params: {
        partyId,
        ...(shownRoundId ? { lastRoundId: shownRoundId } : {}),
        ...(shownRoundNumber ? { lastRoundNumber: shownRoundNumber } : {}),
      },
    });
  }, [partyId, shownRoundId, shownRoundNumber]);

  // Local linger countdown (see file header). One self-rescheduling timeout: ticks
  // down each second and follows the device to the timer at zero. Disabled in the
  // halt (terminal) and in review (the user chose to look), and while exiting.
  const [secondsLeft, setSecondsLeft] = useState(AUTO_ADVANCE_SECONDS);
  const autoAdvance = !isHalt && !isReview && status === 'ready' && !leaving;
  useEffect(() => {
    if (!autoAdvance) return;
    if (secondsLeft <= 0) {
      goToTimer();
      return;
    }
    const id = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [autoAdvance, secondsLeft, goToTimer]);

  // If the party has already ended by the time this screen loads, route to the
  // Final Summary (Phase 11).
  const currentPhase = session?.current_phase;
  useEffect(() => {
    if (leaving || status !== 'ready' || !partyId) return;
    if (currentPhase === 'ended') {
      router.replace(`/party/${partyId}/summary`);
    }
  }, [leaving, status, partyId, currentPhase]);

  // Live end-of-party detection. The halt is terminal, and useTimerSession's
  // advance poll is a no-op in round_complete, so without this a guest waiting on
  // the halt screen would never learn the host pressed End Party. Watch the session
  // row directly: an UPDATE to status = 'ended' routes every device to the Final
  // Summary (Phase 11). RLS (rls-rules.md §2) gates delivery to members; requires
  // party_sessions in the realtime publication (migration 20260610…).
  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`results:party_sessions:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'party_sessions',
          filter: `id=eq.${partyId}`,
        },
        (payload) => {
          // The session is the caller's own party row (fully visible to members),
          // so reading status off the payload is safe here — no RLS-filtered field.
          if ((payload.new as { status?: string }).status === 'ended') {
            router.replace(`/party/${partyId}/summary`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ErrorBanner message={errorMessage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {shownRoundNumber ? `Round ${shownRoundNumber} Results` : 'Round Results'}
        </Text>
        <Text style={styles.subtitle}>
          {view.stillIn} still in
          {view.outThisRound > 0 ? ` · ${view.outThisRound} out this round` : ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero — the caller's own outcome, when they played this round. */}
        {view.me ? (
          <View style={[styles.hero, { borderColor: GROUP_ACCENT[view.me.group] }]}>
            <Text style={[styles.heroBadge, { color: GROUP_ACCENT[view.me.group] }]}>
              {HERO_COPY[view.me.group]}
            </Text>
            <Text style={styles.heroSub}>{view.me.shotCount} shot(s) this game</Text>
          </View>
        ) : null}

        {view.groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <View style={styles.groupTitleRow}>
              <Ionicons
                name={GROUP_ICON[group.key]}
                size={GROUP_ICON_SIZE}
                color={GROUP_ACCENT[group.key]}
              />
              <Text style={[styles.groupTitle, { color: GROUP_ACCENT[group.key] }]}>
                {group.label} ({group.rows.length})
              </Text>
            </View>
            {group.rows.map((row: ResultRow) => (
              <View
                key={row.playerId}
                style={[styles.playerRow, { borderLeftColor: GROUP_ACCENT[group.key] }]}
              >
                <PlayerAvatar id={row.playerId} name={row.displayName} size={32} />
                <View style={styles.playerNameGroup}>
                  <Text style={styles.playerName}>
                    {row.displayName}
                    {row.isYou ? ' (You)' : ''}
                  </Text>
                </View>
                <Text style={styles.shotCount}>🥃 {row.shotCount}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {isHalt ? (
          <>
            <Text style={styles.haltNote}>No active players remaining.</Text>
            {isHost ? (
              <Button label="End Party" variant="outline" onPress={exitNow} disabled={leaving} />
            ) : (
              <Text style={styles.waitingText}>Waiting for the host…</Text>
            )}
          </>
        ) : isReview ? (
          <Button label="Back to timer" variant="outline" onPress={() => router.back()} />
        ) : (
          <>
            <Text style={styles.waitingText}>Next round starts in {secondsLeft}s…</Text>
            <Button label="Go to timer now" variant="outline" onPress={goToTimer} />
          </>
        )}
      </View>
    </SafeAreaView>
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
  hero: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  heroBadge: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  group: {
    gap: SPACING.sm,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  playerNameGroup: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  shotCount: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  footer: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  haltNote: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
    textAlign: 'center',
  },
});
