import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/authStore';
import { DEMO_MODE } from '../src/demo/mode';
import { MoveProvider } from '../src/state/moveStore';
import { colors } from '../src/ui/theme';

/**
 * What the browser tab says. Matches the <title> in app/+html.tsx, which is what
 * crawlers and link unfurls read from the served HTML.
 */
const DOCUMENT_TITLE = 'Loadsy — Right size truck. Right price. Right plan.';

/**
 * Keeps the tab title from going blank on web.
 *
 * React Navigation manages document.title itself, and in this configuration it
 * sets it to an empty string — on hydration and again on every navigation. The
 * served HTML has the right title, so a shared link still unfurls correctly, but
 * anyone who actually opens it sees an unnamed tab. Reasserting it after each
 * route change is the smallest thing that survives both.
 */
function useDocumentTitle() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.title !== DOCUMENT_TITLE) document.title = DOCUMENT_TITLE;
  }, [pathname]);
}

/**
 * Sends signed-out visitors to the sign-in screen, and signed-in ones away from it.
 *
 * Only under DEMO_MODE. There is no real authentication in this app — see
 * src/auth/demoCredentials.ts — and putting a bundled password in front of a
 * shipped build would be security theatre that protects nothing while making the
 * product worse. The gate exists so a demo link opens where a product opens,
 * and so a URL passed around a room does not drop the next person into the last
 * person's half-finished move.
 */
function useAuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!DEMO_MODE) return;
    // Never redirect before the stored session has been read: doing so bounces a
    // returning visitor to sign-in for a frame and then back again.
    if (status === 'loading') return;

    const onLogin = segments[0] === 'login';
    if (status === 'signedOut' && !onLogin) router.replace('/login');
    else if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, segments, router]);
}

export default function RootLayout() {
  useDocumentTitle();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MoveProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </MoveProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  useAuthGate();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: 'My Move' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture Room' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="truck" options={{ title: 'Truck Size' }} />
      <Stack.Screen name="prices" options={{ title: 'Local Prices' }} />
      <Stack.Screen name="packing" options={{ title: 'Packing Plan' }} />
      <Stack.Screen name="layout-view" options={{ title: 'Truck Layout' }} />
      <Stack.Screen
        name="quote/[id]"
        options={{ title: 'Price Breakdown', presentation: 'modal' }}
      />
    </Stack>
  );
}
