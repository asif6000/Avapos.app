import { Redirect } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

/**
 * Entry gate. The splash screen is this route: it holds while the stored
 * session is validated, then hands off to the tabs or the auth stack.
 */
export default function Index() {
  const status = useAuthStore((state) => state.status);

  if (status === 'loading') return null;
  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/(auth)/login'} />;
}
