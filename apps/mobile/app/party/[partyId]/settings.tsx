// Per-session in-game Settings (Surface B, D062/D064) — reached from the timer gear by
// EVERY player, host or not (no role branch). Holds alert + Heads-up overrides scoped
// to THIS party only — they default from the global settings, persist device-side keyed
// by partyId, and are discarded when the party ends; the global defaults (Surface A,
// app/settings.tsx) are never touched. The notification MASTER is global-only (not
// here). The host additionally sees a Party lock row, conditionally rendered.
//
// Role comes from usePartyRole — a one-shot read, NOT useTimerSession: the latter
// drives notification scheduling (whose unmount cancel would kill the timer's batch
// when this pushed screen closes), the advance-phase poll, and realtime subs, none of
// which this screen needs.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { OptionPicker } from '@/components/ui/OptionPicker';
import { SettingsSection } from '@/components/ui/SettingsSection';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { SHOT_SOUNDS } from '@/features/notifications/api/shotSounds';
import { useSessionOverride } from '@/features/notifications/useSessionOverride';
import {
  hostSetHeadsUp,
  HEADS_UP_LEAD_SECONDS,
  type HeadsUpLeadSeconds,
} from '@/features/party/api/hostSetHeadsUp';
import { hostSetPartyLock } from '@/features/party/api/hostSetPartyLock';
import { headsUpGate } from '@/features/party/headsUpGate';
import { usePartyRole } from '@/features/party/usePartyRole';
import { rpcErrorMessage } from '@/lib/errors';
import { serverNow } from '@/lib/time';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

// The Heads-up lead picker options, in seconds (the host RPC validates this set).
const LEAD_TIME_OPTIONS: { label: string; value: HeadsUpLeadSeconds }[] = HEADS_UP_LEAD_SECONDS.map(
  (seconds) => ({ label: `${seconds / 60} min`, value: seconds }),
);

const SOUND_OPTIONS = SHOT_SOUNDS.map((sound) => ({ label: sound.label, value: sound.id }));

export default function PartySettingsScreen(): React.JSX.Element {
  const { partyId } = useLocalSearchParams<{ partyId: string }>();
  const {
    status,
    isHost,
    hostOnly,
    initialLocked,
    initialHeadsUpEnabled,
    initialHeadsUpLeadSeconds,
    roundGate,
    refresh,
    errorMessage,
  } = usePartyRole(partyId);
  const {
    loaded,
    alertSoundEnabled,
    alertHapticEnabled,
    soundChoice,
    setAlertSoundEnabled,
    setAlertHapticEnabled,
    setSoundChoice,
  } = useSessionOverride(partyId);

  // Party lock — seed from the load, then own the value locally (the host is the only
  // one toggling it; this screen has no realtime). null until usePartyRole resolves.
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    if (status === 'ready') setLocked(initialLocked);
  }, [status, initialLocked]);

  const toggleLock = async (next: boolean): Promise<void> => {
    if (!partyId) return;
    const previous = locked;
    setLocked(next); // optimistic
    const result = await hostSetPartyLock({ partySessionId: partyId, locked: next });
    if (result.ok) {
      setLocked(result.data.is_locked);
      return;
    }
    setLocked(previous); // revert
    Alert.alert("Couldn't update", rpcErrorMessage(result.error_code));
  };

  // Party-wide Heads-up (host-controlled, server push). The committed value is seeded
  // from the load and updated only AFTER a successful Confirm (no optimistic flip).
  // Changes go through a single confirm dialog so "turn on + pick a lead" is one
  // round-gate-consuming RPC call (the server enforces once-per-round + a fire-window
  // lock, and may defer a too-late change to next round).
  const [headsUp, setHeadsUp] = useState<{ enabled: boolean; lead: HeadsUpLeadSeconds } | null>(
    null,
  );
  useEffect(() => {
    if (status !== 'ready') return;
    // Normalize the stored lead to one of the offered options (a legacy party could
    // hold a value outside the set); fall back to the 2-min default.
    const lead = HEADS_UP_LEAD_SECONDS.includes(initialHeadsUpLeadSeconds as HeadsUpLeadSeconds)
      ? (initialHeadsUpLeadSeconds as HeadsUpLeadSeconds)
      : 120;
    setHeadsUp({ enabled: initialHeadsUpEnabled, lead });
  }, [status, initialHeadsUpEnabled, initialHeadsUpLeadSeconds]);

  // Re-evaluate the time-based fire-window gate every second against skew-corrected
  // server time (the same clock the countdown uses), so the gate stays live while the
  // host lingers — not just at screen-open.
  const [nowMs, setNowMs] = useState(() => serverNow().getTime());
  useEffect(() => {
    const id = setInterval(() => setNowMs(serverNow().getTime()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Proactive disable: compute both gates client-side from the polled round inputs +
  // the committed Heads-up value + the live clock, so the row explains itself instead
  // of bouncing off a rejected RPC. The server still enforces.
  const gate = headsUpGate(
    {
      status: roundGate.sessionStatus,
      currentPhase: roundGate.currentPhase,
      phaseStartedAt: roundGate.phaseStartedAt,
      phaseEndsAt: roundGate.phaseEndsAt,
      enabled: headsUp?.enabled ?? false,
      leadSeconds: headsUp?.lead ?? 120,
      changedThisRound: roundGate.changedThisRound,
      sentThisRound: roundGate.sentThisRound,
    },
    nowMs,
  );

  // The confirm dialog's draft state (seeded from the committed value on open).
  const [headsUpDialogOpen, setHeadsUpDialogOpen] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftLead, setDraftLead] = useState<HeadsUpLeadSeconds>(120);
  const [savingHeadsUp, setSavingHeadsUp] = useState(false);

  const openHeadsUpDialog = (): void => {
    setDraftEnabled(headsUp?.enabled ?? false);
    setDraftLead(headsUp?.lead ?? 120);
    setHeadsUpDialogOpen(true);
  };

  const confirmHeadsUp = async (): Promise<void> => {
    if (!partyId || savingHeadsUp) return;
    setSavingHeadsUp(true);
    const result = await hostSetHeadsUp({
      partySessionId: partyId,
      enabled: draftEnabled,
      leadSeconds: draftLead,
    });
    setSavingHeadsUp(false);
    setHeadsUpDialogOpen(false);
    if (result.ok) {
      setHeadsUp({
        enabled: result.data.heads_up_enabled,
        lead: result.data.heads_up_lead_seconds as HeadsUpLeadSeconds,
      });
      // Re-read the round gate now so "already changed this round" reflects this change
      // immediately, rather than waiting up to one poll interval.
      refresh();
      if (result.data.deferred) {
        Alert.alert(
          'Saved',
          "This round's Heads-up has already passed, so it starts from the next round.",
        );
      }
      return;
    }
    Alert.alert("Couldn't update", rpcErrorMessage(result.error_code));
  };

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
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Ionicons name="arrow-back" size={HEADER_ICON_SIZE} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Party settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection
          title="Alert"
          caption="In-game alerts you get when the app is open."
        >
          <ToggleRow
            title="Alert sound"
            description="Play a sound when it's Shot O'Clock."
            value={alertSoundEnabled}
            onValueChange={setAlertSoundEnabled}
            disabled={!loaded}
          />
          {alertSoundEnabled ? (
            <View style={styles.subControl}>
              <Text style={styles.subLabel}>Sound</Text>
              <OptionPicker
                options={SOUND_OPTIONS}
                value={soundChoice}
                onChange={setSoundChoice}
                disabled={!loaded}
                compact
              />
            </View>
          ) : null}
          <View style={styles.divider} />
          <ToggleRow
            title="Alert haptic"
            description="Vibrate when it's Shot O'Clock."
            value={alertHapticEnabled}
            onValueChange={setAlertHapticEnabled}
            disabled={!loaded}
          />
        </SettingsSection>

        {/* Host-only single-phone mode has no joiners, so the lock is meaningless and
            the whole section is hidden (D040/D050). Heads-up is host-controlled and
            party-wide now (D063): only the host sees it, here. */}
        {isHost && !hostOnly ? (
          <SettingsSection
            title="Host controls"
            caption="Settings that apply to the whole party. Only Host has access."
          >
            <Pressable
              style={styles.row}
              onPress={openHeadsUpDialog}
              accessibilityRole="button"
              disabled={headsUp === null || gate.locked}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Heads-up</Text>
                <Text style={styles.rowDescription}>
                  {gate.locked ? gate.reason : "Reminder to everyone before the next Shot O'Clock."}
                </Text>
              </View>
              {!gate.locked ? (
                <Text style={styles.rowValue}>
                  {headsUp?.enabled ? `On · ${headsUp.lead / 60} min` : 'Off'}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={CHEVRON_SIZE} color={COLORS.textSecondary} />
            </Pressable>
            <View style={styles.divider} />
            <ToggleRow
              title="Lock party"
              description="Stop new players from joining party."
              value={locked ?? false}
              onValueChange={(next) => void toggleLock(next)}
              disabled={locked === null}
            />
          </SettingsSection>
        ) : null}
      </ScrollView>

      {/* One confirm dialog holding both Heads-up controls — Confirm fires a single
          host_set_heads_up (one round-gate-consuming change), Cancel does nothing. The
          row outside doesn't flip until Confirm succeeds. */}
      <Modal
        visible={headsUpDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHeadsUpDialogOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHeadsUpDialogOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Heads-up</Text>
            <Text style={styles.modalSubtitle}>
              {"Applies to all active players. Can only be changed once per round."}
            </Text>
            <ToggleRow title="Enabled" value={draftEnabled} onValueChange={setDraftEnabled} />
            {draftEnabled ? (
              <View style={styles.subControl}>
                <Text style={styles.subLabel}>Lead time</Text>
                <OptionPicker options={LEAD_TIME_OPTIONS} value={draftLead} onChange={setDraftLead} compact />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setHeadsUpDialogOpen(false)}
                disabled={savingHeadsUp}
                style={styles.modalButton}
              />
              <Button
                label={savingHeadsUp ? 'Saving…' : 'Confirm'}
                onPress={() => void confirmHeadsUp()}
                disabled={savingHeadsUp || gate.locked}
                style={styles.modalButton}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const HEADER_ICON_SIZE = 22; // header back-arrow, matching the other screens
const CHEVRON_SIZE = 20; // per-row tappable indicator

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  subControl: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  subLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  rowText: {
    flex: 1,
    gap: SPACING.xs,
  },
  rowTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textPrimary,
  },
  rowDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  rowValue: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  modalTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
    paddingTop: SPACING.md,
  },
  modalButton: {
    flex: 1,
  },
});
