import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import {
  getNotificationPermission,
  hasPromptedForNotifications,
  recordNotificationsPrompted,
  requestNotificationPermission,
} from '@/features/notifications/api/notificationPermission';

// In-memory SecureStore so the prompted flag persists within a test run.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    __store: store,
  };
});

jest.mock('expo-notifications', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const mockStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const mockGet = Notifications.getPermissionsAsync as jest.Mock;
const mockRequest = Notifications.requestPermissionsAsync as jest.Mock;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('prompted flag', () => {
  it('is false before anything is recorded', async () => {
    expect(await hasPromptedForNotifications()).toBe(false);
  });

  it('reads back true after recordNotificationsPrompted', async () => {
    await recordNotificationsPrompted();
    expect(await hasPromptedForNotifications()).toBe(true);
  });
});

describe('getNotificationPermission', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['undetermined', 'undetermined'],
  ])('normalizes OS status %s to %s', async (osStatus, expected) => {
    mockGet.mockResolvedValueOnce({ status: osStatus });
    expect(await getNotificationPermission()).toBe(expected);
  });

  it('treats any unknown OS status as undetermined', async () => {
    mockGet.mockResolvedValueOnce({ status: 'provisional' });
    expect(await getNotificationPermission()).toBe('undetermined');
  });
});

describe('requestNotificationPermission', () => {
  it('returns the normalized result of the OS dialog', async () => {
    mockRequest.mockResolvedValueOnce({ status: 'granted' });
    expect(await requestNotificationPermission()).toBe('granted');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
