import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KorevProvider, useKorev } from '../korev';
import { useTheme } from '../theme';

function Screens() {
  const { loading, connection } = useKorev();
  const theme = useTheme();
  if (loading) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bgSurface },
          headerTintColor: theme.fg1,
          contentStyle: { backgroundColor: theme.bgApp },
        }}
      >
        <Stack.Protected guard={connection !== null}>
          <Stack.Screen name="index" options={{ title: 'Korev' }} />
          <Stack.Screen name="workspace/[id]" options={{ title: '' }} />
          <Stack.Screen name="new" options={{ title: 'New workspace' }} />
        </Stack.Protected>
        <Stack.Protected guard={connection === null}>
          <Stack.Screen name="pair" options={{ title: 'Pair with Korev' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <KorevProvider>
      <Screens />
    </KorevProvider>
  );
}
