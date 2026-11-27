import { WifiOff } from 'lucide-react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { ConnectionState } from './connection';
import { useConnectionStatus } from './hooks';
import { useConnection, useKorev } from './korev';
import { useTheme, type Theme } from './theme';
import { Button, CHROME_FONT_SCALE } from './ui';

const OFFLINE_TITLE = "Can't reach Korev on your Mac";
const OFFLINE_SHORT = 'Not connected to your Mac';
const BACK_ONLINE = 'Connected to your Mac';
const OFFLINE_CHECKLIST = [
  'Korev is open on your Mac',
  'Tailscale is connected on this phone',
  'Your Mac is awake and on Tailscale',
];
const PANEL_ICON_SIZE = 28;
const STRIP_ICON_SIZE = 14;
const STRIP_HEIGHT = 32;
const PANEL_MAX_WIDTH = 360;
const FADE_MS = 150;

export function confirmUnpair(unpair: () => Promise<void>) {
  Alert.alert(
    'Unpair this phone?',
    'You will need to scan the code in Korev again.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: () => void unpair() },
    ],
  );
}

function showOfflineHelp(retry: () => void, unpair: () => Promise<void>) {
  Alert.alert(
    OFFLINE_TITLE,
    OFFLINE_CHECKLIST.map((item) => `• ${item}`).join('\n'),
    [
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: () => confirmUnpair(unpair),
      },
      { text: 'Try again', onPress: retry },
      { text: 'OK', style: 'cancel' },
    ],
  );
}

const OfflinePanelShown = createContext<(shown: boolean) => void>(() => {});

function useMarkPanelShown() {
  const setPanelShown = use(OfflinePanelShown);
  useEffect(() => {
    setPanelShown(true);
    return () => setPanelShown(false);
  }, [setPanelShown]);
}

function OfflinePanel() {
  const connection = useConnection();
  const { unpair } = useKorev();
  const { attempting } = useConnectionStatus();
  const theme = useTheme();
  const styles = makeStyles(theme);
  useMarkPanelShown();
  return (
    <View style={styles.panel}>
      <WifiOff size={PANEL_ICON_SIZE} color={theme.fg3} />
      <Text style={styles.title} accessibilityRole="header">
        {OFFLINE_TITLE}
      </Text>
      <View style={styles.checklist}>
        {OFFLINE_CHECKLIST.map((item) => (
          <Text key={item} style={styles.checkItem}>
            • {item}
          </Text>
        ))}
      </View>
      <Button
        label="Try again"
        pending={attempting}
        onPress={() => connection.open()}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => confirmUnpair(unpair)}
      >
        <Text style={styles.link}>Unpair this phone</Text>
      </Pressable>
    </View>
  );
}

export function Loading() {
  const { state } = useConnectionStatus();
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.center}>
      {state === 'offline' ? <OfflinePanel /> : <ActivityIndicator />}
    </View>
  );
}

function useAnnounceChanges(state: ConnectionState) {
  const previous = useRef(state);
  useEffect(() => {
    if (state === 'offline' && previous.current !== 'offline')
      AccessibilityInfo.announceForAccessibility(OFFLINE_SHORT);
    if (state === 'online' && previous.current === 'offline')
      AccessibilityInfo.announceForAccessibility(BACK_ONLINE);
    previous.current = state;
  }, [state]);
}

export function ConnectionAnnouncer() {
  const { state } = useConnectionStatus();
  useAnnounceChanges(state);
  return null;
}

function OfflineStrip() {
  const connection = useConnection();
  const { unpair } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { state } = useConnectionStatus();
  if (state !== 'offline') return null;
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={OFFLINE_SHORT}
        accessibilityHint="Shows what to check"
        style={styles.strip}
        onPress={() => showOfflineHelp(() => connection.open(), unpair)}
      >
        <WifiOff size={STRIP_ICON_SIZE} color={theme.warningText} />
        <Text
          style={styles.stripText}
          numberOfLines={1}
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
        >
          {OFFLINE_SHORT}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function ScreenWithOfflineStrip({ children }: { children: ReactElement }) {
  const [panelShown, setPanelShown] = useState(false);
  const [screenTop, setScreenTop] = useState(0);
  const screen = useRef<View>(null);
  const { connection } = useKorev();
  const styles = makeStyles(useTheme());
  const headerOverlap = Math.max(0, useHeaderHeight() - screenTop);
  const measureScreenTop = () =>
    screen.current?.measureInWindow((_x, y) => setScreenTop(y));
  return (
    <OfflinePanelShown value={setPanelShown}>
      <View
        ref={screen}
        style={[styles.screenWithStrip, { paddingTop: headerOverlap }]}
        onLayout={measureScreenTop}
      >
        <View style={styles.screen}>{children}</View>
        {connection && !panelShown ? <OfflineStrip /> : null}
      </View>
    </OfflinePanelShown>
  );
}

export function withOfflineStrip({
  options,
  children,
}: {
  options: { headerShown?: boolean };
  children: ReactElement;
}) {
  if (options.headerShown === false) return children;
  return <ScreenWithOfflineStrip>{children}</ScreenWithOfflineStrip>;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    screenWithStrip: { flex: 1, flexDirection: 'column-reverse' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    panel: {
      maxWidth: PANEL_MAX_WIDTH,
      padding: 20,
      gap: 16,
      alignItems: 'center',
    },
    title: {
      color: theme.fg1,
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
    },
    checklist: { gap: 6 },
    checkItem: { color: theme.fg2, fontSize: 15, lineHeight: 21 },
    link: { color: theme.accentText, fontSize: 14, fontWeight: '600' },
    strip: {
      height: STRIP_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgRaised,
    },
    stripText: {
      flexShrink: 1,
      color: theme.warningText,
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
