import {
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  setNotificationHandler,
} from '@/features/notifications/api/expoNotifications';
import { configureNotifications } from '@/features/notifications/api/shotNotification';

// Mock the wrapper module (the seam configureNotifications imports from), so the test
// never loads the native 'expo-notifications' barrel. jest hoists these above imports.
jest.mock('@/features/notifications/api/expoNotifications', () => ({
  AndroidImportance: { MAX: 7 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
}));

const mockHandler = setNotificationHandler as jest.Mock;
const mockGetAll = getAllScheduledNotificationsAsync as jest.Mock;
const mockCancel = cancelScheduledNotificationAsync as jest.Mock;

// As of Phase 16 (D063) nothing is scheduled locally — all Shot O'Clock notifications
// are server push. configureNotifications only installs the foreground handler + the
// Android channel, and cleans up any pre-push local stragglers. `configured` runs once
// per module load, so a single call exercises it.
describe('configureNotifications', () => {
  it('installs the foreground handler and clears leftover local stragglers', async () => {
    mockGetAll.mockResolvedValueOnce([
      { identifier: 'shot-oclock-r3' },
      { identifier: 'shot-oclock-prewarn-r3' },
      { identifier: 'some-other-app-notification' },
    ]);

    await configureNotifications();

    expect(mockHandler).toHaveBeenCalledTimes(1);
    // Only our prefixed stragglers are cancelled; another app's notification is left.
    const cancelled = mockCancel.mock.calls.map((c) => c[0]);
    expect(cancelled).toEqual(['shot-oclock-r3', 'shot-oclock-prewarn-r3']);
  });
});
