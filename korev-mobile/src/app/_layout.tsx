import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { KorevProvider, useKorev } from '../korev';
import { OfflineBanner } from '../Offline';
import { useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();
const FILL = { flex: 1 };

function Screens() {
  const { loading, connection } = useKorev();
  const theme = useTheme();
  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);
  if (loading) return null;
  return (
    <View style={FILL}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bgSurface },
          headerTintColor: theme.fg1,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.bgApp },
        }}
      >
        <Stack.Protected guard={connection !== null}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="workspace/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="new"
            options={{ title: 'New workspace', presentation: 'modal' }}
          />
          <Stack.Screen
            name="ask/new"
            options={{ title: 'Ask a question', presentation: 'modal' }}
          />
          <Stack.Screen name="ask/[id]" options={{ title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={connection === null}>
          <Stack.Screen name="pair" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {connection ? <OfflineBanner /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <KorevProvider>
      <Screens />
    </KorevProvider>
  );
}
