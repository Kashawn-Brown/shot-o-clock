// RosterSheet — the in-game roster, opened from the timer screen. A draggable
// bottom sheet over the live get_party_state roster carried by useTimerSession.
// It opens at half height, drags up to (near) full screen, and drags down to
// dismiss — built on PanResponder + Animated so it needs no extra dependency and
// no GestureHandlerRootView.
//
// Layout is sectioned (Active / Out); a row is just the player's name and shot
// count — the section already says active vs out. Read-only for players. For the
// host each row carries minimal text actions:
//   - active → Mark Out (host_mark_player_out, §11.2) · Remove (host_remove_player,
//     §11.3, behind a confirm — removal is permanent, D028)
//   - out    → Reinstate (host_mark_player_active, §11.1 — restores grace if they
//     were out by missed_after_grace, can un-stick the zero-active halt)
// The host's own row never shows actions (can't mark out / remove yourself).
//
// Each action takes a per-row in-flight lock and surfaces failures through the
// shared ErrorBanner (§5.7). On success onApplied re-pulls the host's snapshot;
// the realtime party_players sub propagates to every other device.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { hostMarkPlayerActive } from '@/features/party/api/hostMarkPlayerActive';
import { hostMarkPlayerOut } from '@/features/party/api/hostMarkPlayerOut';
import { hostRemovePlayer } from '@/features/party/api/hostRemovePlayer';
import { deriveTimerRoster, type TimerRosterEntry } from '@/features/party/timerRoster';
import { rpcErrorMessage } from '@/lib/errors';
import type { RpcResult } from '@/types/api';
import type { Database } from '@/types/db.generated';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '@/styles/tokens';

type PlayerRow = Database['public']['Tables']['party_players']['Row'];
type OutcomeRow = Database['public']['Tables']['round_player_outcomes']['Row'];
type GraceMode = Database['public']['Enums']['grace_mode'];

// Dim behind the sheet — a one-off overlay, no semantic token for it.
const BACKDROP_COLOR = 'rgba(0, 0, 0, 0.4)';
// Sheet covers most of the screen at full height; opens at half.
const SHEET_SCREEN_FRACTION = 0.92;
const SLIDE_DURATION_MS = 220;
// Grace shield in the roster tag — sized to sit alongside the xs tag text.
const GRACE_ICON_SIZE = 13;

type RosterSheetProps = {
  visible: boolean;
  onClose: () => void;
  players: PlayerRow[];
  /** Current-round outcomes — a self_out this round shows the player as Out now. */
  currentRoundOutcomes: OutcomeRow[];
  /** Session's current round — dims a self-out's Reinstate only in that same round. */
  currentRoundNumber: number;
  /** Party grace setting — derives each player's remaining-grace tag. */
  graceMode: GraceMode;
  /** The caller's auth id — flags their own row so host controls hide on it. */
  currentUserId: string | null;
  /** Whether the caller holds the host role — gates the per-row controls. */
  isHost: boolean;
  /** Re-pull the snapshot after a successful action (parent's silent refresh). */
  onApplied: () => void;
};

export function RosterSheet({
  visible,
  onClose,
  players,
  currentRoundOutcomes,
  currentRoundNumber,
  graceMode,
  currentUserId,
  isHost,
  onApplied,
}: RosterSheetProps): React.JSX.Element {
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * SHEET_SCREEN_FRACTION);
  const halfY = Math.round(sheetHeight * 0.5); // translateY for the half-open rest

  // translateY: 0 = full screen, sheetHeight = fully hidden. Animated manually,
  // so the Modal uses animationType="none".
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  // The last COMMITTED rest position (sheetHeight = hidden, halfY = half-open,
  // 0 = full), set explicitly at every rest transition below. We deliberately do
  // NOT derive it from a translateY.addListener: with useNativeDriver the JS
  // listener fires unreliably, so after a close it was left stale at sheetHeight,
  // and the next grant captured the bottom — dragging slammed the sheet down on
  // reopen. The pan delta is cumulative from grant, so rest + dy is all we need.
  const restY = useRef(sheetHeight);
  const dragStart = useRef(sheetHeight);
  // Snap metrics, refreshed each render so the once-created PanResponder sees the
  // current screen height.
  const metrics = useRef({ sheetHeight, halfY });
  metrics.current = { sheetHeight, halfY };

  const animateTo = useCallback(
    (toValue: number, onDone?: () => void) => {
      Animated.timing(translateY, {
        toValue,
        duration: SLIDE_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    },
    [translateY],
  );

  // Mounted as long as `visible`; close slides down first, then unmounts.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => {
    restY.current = metrics.current.sheetHeight;
    animateTo(metrics.current.sheetHeight, () => onCloseRef.current());
  }, [animateTo]);

  // The pan handlers are created once but call the latest close/animateTo via refs.
  const closeRef = useRef(close);
  closeRef.current = close;
  const animateToRef = useRef(animateTo);
  animateToRef.current = animateTo;

  // Slide up to half whenever the sheet becomes visible. Reset position state
  // first so a reopen always starts from a known hidden rest, never a stale one.
  useEffect(() => {
    if (visible) {
      translateY.setValue(metrics.current.sheetHeight);
      restY.current = metrics.current.halfY;
      animateTo(metrics.current.halfY);
    }
  }, [visible, translateY, animateTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          // Anchor the drag to the last committed rest, not a listener-derived
          // value — that is what makes reopen reliable.
          dragStart.current = restY.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const { sheetHeight: maxY } = metrics.current;
          const next = Math.min(Math.max(dragStart.current + gesture.dy, 0), maxY);
          translateY.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          const { sheetHeight: maxY, halfY: half } = metrics.current;
          const current = Math.min(Math.max(dragStart.current + gesture.dy, 0), maxY);
          // A strong downward fling, or dragged well past the half rest, dismisses.
          if (gesture.vy > 1.2 || current > half + maxY * 0.18) {
            closeRef.current();
            return;
          }
          // Otherwise snap to whichever rest is nearer: full (0) or half, and
          // commit it so the next grant anchors correctly.
          const target = current < half * 0.5 ? 0 : half;
          restY.current = target;
          animateToRef.current(target);
        },
      }),
    [translateY],
  );

  const roster = deriveTimerRoster(
    players,
    currentUserId,
    graceMode,
    currentRoundOutcomes,
    currentRoundNumber,
  );
  const active = roster.filter((entry) => entry.status === 'active');
  const out = roster.filter((entry) => entry.status === 'out');
  const left = roster.filter((entry) => entry.status === 'left');

  // The player id whose action is in flight, or null. Locks just that row's
  // actions so a double-tap can't fire two host_* calls at the target.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (playerId: string, call: () => Promise<RpcResult<unknown>>): Promise<void> => {
      if (busyId !== null) return;
      setError(null);
      setBusyId(playerId);

      const result = await call();
      setBusyId(null);

      if (result.ok) {
        onApplied();
        return;
      }
      setError(rpcErrorMessage(result.error_code));
    },
    [busyId, onApplied],
  );

  const handleMarkOut = useCallback(
    (playerId: string) => void run(playerId, () => hostMarkPlayerOut({ partyPlayerId: playerId })),
    [run],
  );
  const handleReinstate = useCallback(
    (playerId: string) =>
      void run(playerId, () => hostMarkPlayerActive({ partyPlayerId: playerId })),
    [run],
  );
  const handleRemove = useCallback(
    (playerId: string, displayName: string) => {
      Alert.alert(
        `Remove ${displayName}?`,
        "They won't be able to rejoin.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => void run(playerId, () => hostRemovePlayer({ partyPlayerId: playerId })),
          },
        ],
      );
    },
    [run],
  );

  const renderRow = (entry: TimerRosterEntry): React.JSX.Element => {
    const locked = busyId !== null;
    const isOut = entry.status === 'out';
    const isLeft = entry.status === 'left';
    const muted = isOut || isLeft;
    // A left player is already gone — no host actions on them (Mark Out / Reinstate
    // / Remove are pointless), per the "Left players do not need Remove" rule.
    const showActions = isHost && !entry.isSelf && !isLeft;

    // RN opacity is a group property, so we can't fade the row and keep the action
    // buttons crisp — instead fade only the avatar + info, leaving the actions at
    // full weight (Remove always; Reinstate dimmed per entry.reinstatable).
    return (
      <View key={entry.id} style={styles.row}>
        <View style={muted ? styles.fadedContent : undefined}>
          <PlayerAvatar id={entry.id} name={entry.displayName} />
        </View>

        <View style={[styles.info, muted && styles.fadedContent]}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.displayName}
          </Text>
          <View style={styles.tags}>
            {entry.isHost ? <Text style={styles.hostPill}>Host</Text> : null}
            {entry.isSelf && !entry.isHost ? <Text style={styles.youPill}>You</Text> : null}
            {/* Grace only matters while a player is still in — don't tag an out/left row.
                Vector icon (not the 🛡️ emoji) so the shield renders blue on every
                platform — Apple draws the emoji silver. */}
            {!muted && entry.graceAvailable ? (
              <View style={styles.graceTag}>
                <Ionicons name="shield-outline" size={GRACE_ICON_SIZE} color={COLORS.grace} />
                <Text style={styles.graceTagText}>Grace</Text>
              </View>
            ) : null}
            <Text style={styles.shotsTag}>
              {entry.shotsCompleted} {entry.shotsCompleted === 1 ? 'shot' : 'shots'}
            </Text>
          </View>
        </View>

        {showActions ? (
          <View style={styles.actions}>
            {isOut ? (
              // An out player is still in the party — host can Reinstate or Remove.
              // Reinstate reads dimmed unless it's the host's to undo (host-marked-out
              // or a left-and-rejoined player); it stays tappable either way.
              <TextAction
                label="Reinstate"
                onPress={() => handleReinstate(entry.id)}
                disabled={locked}
                dimmed={!entry.reinstatable}
              />
            ) : (
              <TextAction label="Mark Out" onPress={() => handleMarkOut(entry.id)} disabled={locked} />
            )}
            <TextAction
              label="Remove"
              danger
              onPress={() => handleRemove(entry.id, entry.displayName)}
              disabled={locked}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" />

        <Animated.View style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
          {/* Drag zone: handle + centred title. The whole strip pans the sheet. */}
          <View style={styles.dragZone} {...panResponder.panHandlers}>
            <View style={styles.handle} />
            <Text style={styles.title}>Players</Text>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {active.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, styles.activeTitle]}>● Active ({active.length})</Text>
                {active.map(renderRow)}
              </>
            ) : null}

            {out.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, styles.outTitle]}>● Out ({out.length})</Text>
                {out.map(renderRow)}
              </>
            ) : null}

            {left.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, styles.leftTitle]}>● Left ({left.length})</Text>
                {left.map(renderRow)}
              </>
            ) : null}

            {roster.length === 0 ? <Text style={styles.empty}>No players yet.</Text> : null}
          </ScrollView>

          <ErrorBanner message={error} />

          <View style={styles.footer}>
            <Button label="Close" variant="outline" onPress={close} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Minimal underlined text action — lighter than the Button primitive, which is
// sized for full-width primary actions. `disabled` dims AND blocks (in-flight
// lock); `dimmed` only de-emphasises (still tappable) — used for a Reinstate that
// isn't the host's to undo.
function TextAction({
  label,
  onPress,
  danger = false,
  disabled = false,
  dimmed = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        pressed && styles.actionPressed,
        dimmed && styles.actionDimmed,
        disabled && styles.actionDisabled,
      ]}
    >
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheet: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  dragZone: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  activeTitle: {
    color: COLORS.success,
  },
  outTitle: {
    color: COLORS.textSecondary,
  },
  // Left players are voluntary departures, not eliminations — same muted rows as
  // Out, but their own section header keeps the two clearly distinct.
  leftTitle: {
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  // Dims the avatar + info of an out/left row (not the whole row, so the action
  // buttons keep full weight).
  fadedContent: {
    opacity: 0.6,
  },
  info: {
    flex: 1,
    gap: SPACING.xs,
  },
  name: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  hostPill: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  // Mirrors hostPill so "You" reads as a bordered chip, not loose text.
  youPill: {
    fontSize: FONT_SIZE.xs,
    // "You" self-marker — Indigo text/outline on a soft-Highlight fill.
    color: COLORS.brandPrimary,
    backgroundColor: COLORS.brandHighlightSoft,
    borderWidth: 1,
    borderColor: COLORS.brandPrimary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  graceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  graceTagText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.grace,
  },
  shotsTag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  actionTextDanger: {
    color: COLORS.danger,
  },
  actionPressed: {
    opacity: 0.5,
  },
  actionDisabled: {
    opacity: 0.4,
  },
  // De-emphasised but still tappable (a Reinstate that isn't the host's to undo).
  actionDimmed: {
    opacity: 0.4,
  },
  footer: {
    padding: SPACING.lg,
  },
  empty: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});
