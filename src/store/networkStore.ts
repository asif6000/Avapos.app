import * as Network from 'expo-network';
import { create } from 'zustand';

type Listener = (online: boolean) => void;

interface NetworkState {
  online: boolean;
  lastCheckedAt: number | null;
  isConnectionExpensive: boolean;
  setOnline: (online: boolean, expensive?: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  online: true,
  lastCheckedAt: null,
  isConnectionExpensive: false,
  setOnline: (online, expensive = false) =>
    set({ online, isConnectionExpensive: expensive, lastCheckedAt: Date.now() }),
}));

const subscribers = new Set<Listener>();

export function subscribeToNetwork(listener: Listener): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export async function currentNetworkState(): Promise<{
  online: boolean;
  expensive: boolean;
}> {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      online: Boolean(state.isConnected) && state.isInternetReachable !== false,
      expensive: state.type === Network.NetworkStateType.CELLULAR,
    };
  } catch {
    return { online: true, expensive: false };
  }
}

/**
 * Watches connectivity. Going back online triggers exactly one refetch, so the
 * UI resynchronizes with the backend instead of guessing state locally.
 */
export function startNetworkWatcher(onOnline: () => void): () => void {
  let cancelled = false;

  const apply = (online: boolean, expensive: boolean) => {
    const wasOffline = !useNetworkStore.getState().online;
    useNetworkStore.getState().setOnline(online, expensive);
    if (online && wasOffline && !cancelled) onOnline();
  };

  void currentNetworkState().then(({ online, expensive }) => {
    if (!cancelled) apply(online, expensive);
  });

  const subscription = Network.addNetworkStateListener((state) => {
    const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
    apply(online, state.type === Network.NetworkStateType.CELLULAR);
  });

  const unsubscribe = subscribeToNetwork((online) => {
    if (online) onOnline();
  });

  return () => {
    cancelled = true;
    subscription.remove();
    unsubscribe();
  };
}
