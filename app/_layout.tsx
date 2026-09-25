import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/authStore';
import { EntitlementProvider } from '../src/billing/entitlementStore';
import { DEMO_MODE } from '../src/demo/mode';
import { useWelcomeSeen } from '../src/onboarding/welcome';
import { HistoryProvider } from '../src/state/historyStore';
import { MoveProvider } from '../src/state/moveStore';
import { SignOutButton } from '../src/ui/SignOutButton';
import { colors } from '../src/ui/theme';
import { TAGLINE } from '../src/domain/site';

/**
 * What the browser tab says. Matches the <title> in app/+html.tsx, which is what
 * crawlers and link unfurls read from the served HTML.
 */
const DOCUMENT_TITLE = `Loadsy — ${TAGLINE}`;

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
 * Routes the demo's sign-in never stands in front of.
 *
 * The privacy policy and the help page are the two URLs App Store Connect carries, and
 * Apple's reviewer – and anyone else – opens them without a password. The demo gate
 * exists to give a shared link a front door; putting it in front of the policy would
 * make the policy unreadable from the one place it is required to be readable.
 */
const PUBLIC_SEGMENTS = new Set(['login', 'privacy', 'support', 'welcome']);

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
    const onPublic = PUBLIC_SEGMENTS.has(segments[0] ?? '');
    if (status === 'signedOut' && !onPublic) router.replace('/login');
    else if (status === 'signedIn' && onLogin) router.replace('/');
  }, [status, segments, router]);
}

/**
 * Sends a phone that has never seen the welcome screen there, once.
 *
 * Not under DEMO_MODE: the demo already has a front door, the sign-in screen, and a
 * walkthrough that lands on a prepared move does not need a second one. The welcome is
 * still reachable at /welcome in the demo, for looking at it. Decides nothing until the
 * flag has been read – otherwise the dashboard would flash before the redirect on every
 * cold start, which is the wrong first impression twice over.
 */
function useWelcomeGate() {
  const segments = useSegments();
  const router = useRouter();
  // Shared with the welcome screen's Get Started button, so the gate learns the flag
  // changed in the same tick and does not send the person straight back.
  const seen = useWelcomeSeen();

  useEffect(() => {
    if (DEMO_MODE || seen !== false) return;
    if (PUBLIC_SEGMENTS.has(segments[0] ?? '')) return;
    router.replace('/welcome');
  }, [seen, segments, router]);
}

export default function RootLayout() {
  useDocumentTitle();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EntitlementProvider>
          <MoveProvider>
            <HistoryProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </HistoryProvider>
          </MoveProvider>
        </EntitlementProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  useAuthGate();
  useWelcomeGate();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        // Set once, for every screen with a header, so it cannot go missing from
        // the one screen somebody happens to be stuck on. Only under demo mode:
        // nothing else can sign in, and iOS 26 draws the header's trailing slot as
        // an empty glass circle when the component in it renders nothing – which is
        // what build 4 shipped on every screen.
        ...(DEMO_MODE ? { headerRight: () => <SignOutButton /> } : {}),
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: 'My Move' }} />
      <Stack.Screen name="capture" options={{ title: 'Add Photos' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="truck" options={{ title: 'Truck Size' }} />
      <Stack.Screen name="rent" options={{ title: 'Where to Rent' }} />
      <Stack.Screen name="packing" options={{ title: 'Packing Plan' }} />
      <Stack.Screen name="premium" options={{ title: 'Loadsy Premium' }} />
      <Stack.Screen name="layout-view" options={{ title: 'Truck Layout' }} />
      <Stack.Screen name="history" options={{ title: 'Past Moves' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="support" options={{ title: 'Help' }} />
    </Stack>
  );
}
