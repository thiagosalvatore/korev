import { router, SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { KorevProvider, useKorev } from '../korev';
import { ConnectionAnnouncer, withOfflineStrip } from '../Offline';
import { HeaderTextButton } from '../TabStack';
import { useTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();
const FILL = { flex: 1 };
const SHEET_DETENTS = [0.62, 1];

const closeButton = (label: string, bold = false) =>
  function CloseButton() {
    return <HeaderTextButton label={label} bold={bold} onPress={router.back} />;
  };

const TASK_SHEET = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: SHEET_DETENTS,
  headerLeft: closeButton('Cancel'),
} as const;

const CHAT_SHEET = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.5, 1],
  sheetGrabberVisible: true,
};

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
        screenLayout={withOfflineStrip}
        screenOptions={{
          headerStyle: { backgroundColor: theme.bgSurface },
          headerTintColor: theme.fg1,
          headerTitleStyle: { color: theme.fg1 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.bgApp },
        }}
      >
        <Stack.Protected guard={connection !== null}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="workspace/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="new"
            options={{ ...TASK_SHEET, title: 'New workspace' }}
          />
          <Stack.Screen
            name="ask/new"
            options={{ ...TASK_SHEET, title: 'Ask a question' }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Settings',
              presentation: 'modal',
              headerRight: closeButton('Done', true),
            }}
          />
          <Stack.Screen name="ask/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="changes/[id]/index"
            options={{ title: 'Changes' }}
          />
          <Stack.Screen name="changes/[id]/diff" options={{ title: '' }} />
          <Stack.Screen
            name="threads/[id]"
            options={{ title: 'Review comments' }}
          />
          <Stack.Screen name="scripts/[id]" options={{ title: '' }} />
          <Stack.Screen
            name="checks/[id]"
            options={{ title: 'Checks', ...CHAT_SHEET }}
          />
          <Stack.Screen
            name="session/[id]/options"
            options={{ title: 'Chat options', ...CHAT_SHEET }}
          />
        </Stack.Protected>
        <Stack.Protected guard={connection === null}>
          <Stack.Screen name="pair" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {connection ? <ConnectionAnnouncer /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={FILL}>
      <KeyboardProvider>
        <KorevProvider>
          <Screens />
        </KorevProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
