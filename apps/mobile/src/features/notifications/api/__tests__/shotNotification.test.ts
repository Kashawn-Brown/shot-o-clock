import {
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
} from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';
import { getPreWarningMinutes } from '@/features/notifications/api/notificationPreferences';
import {
  cancelShotNotifications,
  scheduleShotNotifications,
} from '@/features/notifications/api/shotNotification';
import type { ShotNotificationScheduleInput } from '@/features/notifications/shotNotificationSchedule';

// Mock the submodule wrapper (the seam shotNotification.ts imports from) — never the
// 'expo-notifications' barrel (it runs the push auto-registration side effect). jest
// hoists these above the imports, so the mocks apply.
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

jest.mock('@/features/notifications/api/notificationPreferences', () => ({
  getPreWarningMinutes: jest.fn(() => Promise.resolve(0)),
}));

jest.mock('@/lib/time', () => ({ getServerTimeOffset: () => 0 }));

const mockSchedule = scheduleNotificationAsync as jest.Mock;
const mockGetAll = getAllScheduledNotificationsAsync as jest.Mock;
const mockPermission = getNotificationPermission as jest.Mock;
const mockPreWarning = getPreWarningMinutes as jest.Mock;

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
  mockPreWarning.mockResolvedValue(0);
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
    mockPreWarning.mockResolvedValue(2);
    await scheduleShotNotifications(
      input({
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
