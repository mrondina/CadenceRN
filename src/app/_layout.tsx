import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DBProvider } from '@/context/DBContext';
import { ThemeProvider } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DBProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="setup"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="session"
              options={{ presentation: 'fullScreenModal', headerShown: false }}
            />
            <Stack.Screen
              name="settings"
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen
              name="this-week"
              options={{ presentation: 'modal' }}
            />
          </Stack>
        </DBProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
