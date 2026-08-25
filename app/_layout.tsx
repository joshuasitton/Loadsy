import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MoveProvider } from '../src/state/moveStore';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
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
