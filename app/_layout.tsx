import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

export default function RootLayout() {
  useDocumentTitle();

  return (
    <SafeAreaProvider>
      <MoveProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
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
      </MoveProvider>
    </SafeAreaProvider>
  );
}
