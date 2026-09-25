import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { queryClient } from '@/api/queryClient';
import { sessionManager } from '@/auth/sessionManager';

export const BACKGROUND_SYNC_TASK = 'srabon-background-sync';

/**
 * Background work is a cache refresher, nothing more. It re-reads device,
 * installment and payment status from the backend on a battery-friendly
 * schedule. It does not track location, keep a persistent service alive, or
 * make any authorization decision of its own.
 */
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (!(await sessionManager.isUsable())) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['device'] }),
      queryClient.invalidateQueries({ queryKey: ['installments'] }),
      queryClient.invalidateQueries({ queryKey: ['payments'] }),
      queryClient.invalidateQueries({ queryKey: ['customer', 'dashboard'] }),
    ]);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Available) return;
  try {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15,
    });
  } catch {
    // Unsupported on this platform or already registered. Never fatal.
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch {
    // ignore
  }
}
