import { getPushToken, registerPushToken } from '@/features/notifications/api/pushToken';

// Mock the seams: the token-minting API, the permission read, the RPC layer, and
// the EAS config that supplies projectId. Each test sets its own return values.
jest.mock('@/features/notifications/api/expoNotifications', () => ({
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('@/features/notifications/api/notificationPermission', () => ({
  getNotificationPermission: jest.fn(),
}));
jest.mock('@/lib/rpcClient', () => ({
  callRpc: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } } },
}));

import { getExpoPushTokenAsync } from '@/features/notifications/api/expoNotifications';
import { getNotificationPermission } from '@/features/notifications/api/notificationPermission';
import { callRpc } from '@/lib/rpcClient';

const mockGetToken = getExpoPushTokenAsync as jest.Mock;
const mockPermission = getNotificationPermission as jest.Mock;
const mockCallRpc = callRpc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Silence the deliberate console.error paths under test.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('getPushToken', () => {
  it('returns null without minting a token when permission is not granted', async () => {
    mockPermission.mockResolvedValueOnce('denied');
    expect(await getPushToken()).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('returns the token string when permission is granted', async () => {
    mockPermission.mockResolvedValueOnce('granted');
    mockGetToken.mockResolvedValueOnce({ type: 'expo', data: 'ExponentPushToken[abc]' });
    expect(await getPushToken()).toBe('ExponentPushToken[abc]');
    expect(mockGetToken).toHaveBeenCalledWith({ projectId: 'test-project-id' });
  });

  it('returns null when minting throws (e.g. emulator / network)', async () => {
    mockPermission.mockResolvedValueOnce('granted');
    mockGetToken.mockRejectedValueOnce(new Error('no push service'));
    expect(await getPushToken()).toBeNull();
  });
});

describe('registerPushToken', () => {
  it('calls register_push_token with the token and a valid platform', async () => {
    mockCallRpc.mockResolvedValueOnce({
      ok: true,
      error_code: null,
      error_msg: null,
      data: { device_id: 'd1' },
    });

    const result = await registerPushToken('ExponentPushToken[abc]');

    expect(result.ok).toBe(true);
    expect(mockCallRpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = mockCallRpc.mock.calls[0];
    expect(fnName).toBe('register_push_token');
    expect(args.p_expo_push_token).toBe('ExponentPushToken[abc]');
    // jest-expo runs as a known platform; whatever it is, it must be enum-valid.
    expect([undefined, 'ios', 'android', 'web']).toContain(args.p_platform);
  });
});
