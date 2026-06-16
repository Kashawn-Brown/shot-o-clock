// Drives the one-time onboarding notification priming step. Consumed by the root
// layout: 'needed' shows the NotificationPermissionGate (after name/consent, before
// the navigator), 'done' lets the app render. See api/notificationPermission.ts.

import { useCallback, useEffect, useState } from 'react';

import {
  hasPromptedForNotifications,
  recordNotificationsPrompted,
} from '@/features/notifications/api/notificationPermission';

type NotificationPromptStatus = 'loading' | 'needed' | 'done';

interface UseNotificationPromptResult {
  status: NotificationPromptStatus;
  complete: () => Promise<void>;
}

export function useNotificationPrompt(): UseNotificationPromptResult {
  const [status, setStatus] = useState<NotificationPromptStatus>('loading');

  useEffect(() => {
    let active = true;

    hasPromptedForNotifications()
      .then((prompted) => {
        if (active) setStatus(prompted ? 'done' : 'needed');
      })
      .catch((error) => {
        // Notifications are optional, not a required gate — unlike consent, a read
        // failure fails toward 'done' so a storage error can't trap the user on the
        // priming screen. Worst case it reappears next launch.
        console.error('Failed to read notification prompt state', error);
        if (active) setStatus('done');
      });

    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(async () => {
    try {
      await recordNotificationsPrompted();
    } catch (error) {
      // Persisting the flag failed; advance anyway so the user isn't stuck. The
      // priming screen may show again next launch — harmless for an optional step.
      console.error('Failed to persist notification prompt state', error);
    }
    setStatus('done');
  }, []);

  return { status, complete };
}
