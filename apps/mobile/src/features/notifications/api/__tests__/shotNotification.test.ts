import {
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
} from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';
import {
  getGlobalNotificationPrefs,
  getSessionOverride,
} from '@/features/notifications/api/notificationPreferences';
import {
  cancelShotNotifications,
  scheduleShotNotifications,
} from '@/features/notifications/api/shotNotification';
import type { ShotNotificationScheduleInput } from '@/features/notifications/shotNotificationSchedule';

// Mock the wrapper module (the seam shotNotification.ts imports from), so the tests
// never load the native 'expo-notifications' barrel. jest hoists these above the
// imports, so the mocks apply.
jest.mock('@/features/notifications/api/expoNotifications', () => ({
  AndroidImportance: { MAX: 7 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/features/notifications/api/notificationPermission', () => ({
  getNotificationPermission: jest.fn(() => Promise.resolve('granted')),
}));

// In-memory SecureStore so the real notificationPreferences module (used for the pure
// resolveEffectivePrefs) loads without the native backend.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

// Keep the real pure resolveEffectivePrefs; stub only the async preference reads so each
// test controls the global prefs + per-session override.
jest.mock('@/features/notifications/api/notificationPreferences', () => {
  const actual = jest.requireActual('@/features/notifications/api/notificationPreferences');
  return {
    ...actual,
    getGlobalNotificationPrefs: jest.fn(() =>
      Promise.resolve({
        shotOclockNotificationEnabled: true,
        preWarningEnabled: true,
        preWarningMinutes: 0,
      }),
    ),
    getSessionOverride: jest.fn(() => Promise.resolve(null)),
  };
});

jest.mock('@/lib/time', () => ({ getServerTimeOffset: () => 0 }));

const mockSchedule = scheduleNotificationAsync as jest.Mock;
const mockGetAll = getAllScheduledNotificationsAsync as jest.Mock;
const mockPermission = getNotificationPermission as jest.Mock;
const mockGlobalPrefs = getGlobalNotificationPrefs as jest.Mock;
const mockSessionOverride = getSessionOverride as jest.Mock;

// Far-future deadline so the planned slots are always ahead of the real Date.now().
const FUTURE = new Date(Date.now() + 60_000).toISOString();
// Far enough out that a pre-warning lead is still in the future.
const FAR_FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();

function input(
  overrides: Partial<ShotNotificationScheduleInput> = {},
): ShotNotificationScheduleInput {
  return {
    session: { current_phase: 'countdown', phase_ends_at: FUTURE, status: 'active' },
    shotWindowSeconds: 20,
    intervalIncrementSeconds: 10,
    maxIntervalSeconds: null,
    currentRoundNumber: 3,
    currentRoundIntervalSeconds: 60,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockPermission.mockResolvedValue('granted');
  mockGlobalPrefs.mockResolvedValue({
    shotOclockNotificationEnabled: true,
    preWarningEnabled: true,
    preWarningMinutes: 0,
  });
  mockSessionOverride.mockResolvedValue(null);
});

describe('scheduleShotNotifications', () => {
  // Regression: the generation guard used to trip on the function's own pre-clear, so
  // it never reached scheduleNotificationAsync — notifications silently stopped firing.
  it('actually schedules the planned batch for a valid active game', async () => {
    await scheduleShotNotifications(input());
    expect(mockSchedule).toHaveBeenCalledTimes(8); // MAX_SCHEDULED_ROUNDS, no pre-warning
    expect(mockSchedule.mock.calls[0][0].identifier).toBe('shot-oclock-r3');
  });

  it('also schedules pre-warning notifications when a lead time is configured', async () => {
    mockGlobalPrefs.mockResolvedValue({
      shotOclockNotificationEnabled: true,
      preWarningEnabled: true,
      preWarningMinutes: 2,
    });
    await scheduleShotNotifications(
      input({
        // 5-min interval so the 2-min lead fits inside round 3's countdown (lead <
        // interval); otherwise the planner's per-round guard would skip the prewarn.
        currentRoundIntervalSeconds: 300,
        session: { current_phase: 'countdown', phase_ends_at: FAR_FUTURE, status: 'active' },
      }),
    );
    const ids = mockSchedule.mock.calls.map((c) => c[0].identifier);
    expect(ids).toContain('shot-oclock-r3');
    expect(ids).toContain('shot-oclock-prewarn-r3');
    const prewarn = mockSchedule.mock.calls.find(
      (c) => c[0].identifier === 'shot-oclock-prewarn-r3',
    )![0];
    expect(prewarn.content.body).toContain('2 minutes');
  });

  it('omits the open notification when the global master is off', async () => {
    mockGlobalPrefs.mockResolvedValue({
      shotOclockNotificationEnabled: false,
      preWarningEnabled: true,
      preWarningMinutes: 2,
    });
    await scheduleShotNotifications(
      input({
        currentRoundIntervalSeconds: 300, // lead < interval so the prewarn schedules
        session: { current_phase: 'countdown', phase_ends_at: FAR_FUTURE, status: 'active' },
      }),
    );
    const ids = mockSchedule.mock.calls.map((c) => c[0].identifier);
    expect(ids).toContain('shot-oclock-prewarn-r3'); // Heads-up still fires
    expect(ids).not.toContain('shot-oclock-r3'); // open notification suppressed
  });

  it('does not re-schedule a round\'s Heads-up once it has already fired (add-time)', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);
    mockGlobalPrefs.mockResolvedValue({
      shotOclockNotificationEnabled: true,
      preWarningEnabled: true,
      preWarningMinutes: 2,
    });

    // Round 3 window 600s out, 5-min interval, 2-min lead → prewarn 480s out (future).
    const firstEnds = new Date(realNow + 600_000).toISOString();
    await scheduleShotNotifications(
      input({
        currentRoundIntervalSeconds: 300,
        session: { current_phase: 'countdown', phase_ends_at: firstEnds, status: 'active' },
      }),
      'party-once',
    );
    expect(mockSchedule.mock.calls.map((c) => c[0].identifier)).toContain('shot-oclock-prewarn-r3');

    // Time advances past the prewarn's planned instant (it fired), then the host adds
    // time: round 3's window — and a fresh prewarn instant — move later, future again.
    mockSchedule.mockClear();
    nowSpy.mockReturnValue(realNow + 500_000); // past the 480s prewarn instant
    const laterEnds = new Date(realNow + 500_000 + 600_000).toISOString();
    await scheduleShotNotifications(
      input({
        currentRoundIntervalSeconds: 300,
        session: { current_phase: 'countdown', phase_ends_at: laterEnds, status: 'active' },
      }),
      'party-once',
    );
    // The math re-crosses the lead threshold, but round 3's Heads-up already fired —
    // so it must NOT be scheduled again (once-per-round). The open still reschedules.
    const ids = mockSchedule.mock.calls.map((c) => c[0].identifier);
    expect(ids).not.toContain('shot-oclock-prewarn-r3');
    expect(ids).toContain('shot-oclock-r3');

    nowSpy.mockRestore();
  });

  it('always uses the single channel and the OS default sound', async () => {
    await scheduleShotNotifications(input());
    const call = mockSchedule.mock.calls[0][0];
    expect(call.trigger.channelId).toBe('shot-oclock');
    expect(call.content.sound).toBe('default');
  });

  it('schedules nothing and clears when there is no active game', async () => {
    await scheduleShotNotifications(
      input({ session: { current_phase: 'countdown', phase_ends_at: FUTURE, status: 'paused' } }),
    );
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('schedules nothing when permission is not granted', async () => {
    mockPermission.mockResolvedValue('denied');
    await scheduleShotNotifications(input());
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('cancels only our own prefixed notifications, leaving others alone', async () => {
    mockGetAll.mockResolvedValue([
      { identifier: 'shot-oclock-r3' },
      { identifier: 'shot-oclock-prewarn-r3' },
      { identifier: 'some-other-app-notification' },
    ]);
    await cancelShotNotifications();
    const { cancelScheduledNotificationAsync } = jest.requireMock(
      '@/features/notifications/api/expoNotifications',
    );
    const cancelled = (cancelScheduledNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(cancelled).toEqual(['shot-oclock-r3', 'shot-oclock-prewarn-r3']);
  });
});
