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
const PILL_ICON_SIZE = 14;
const PILL_MAX_WIDTH = 220;
const PILL_HEIGHT = 28;
const PILL_GAP = 8;
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

function OfflineBanner({
  panelShown,
  screenTop,
}: {
  panelShown: boolean;
  screenTop: number;
}) {
  const connection = useConnection();
  const { unpair } = useKorev();
  const { state } = useConnectionStatus();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const headerOverlap = Math.max(0, useHeaderHeight() - screenTop);
  const top = headerOverlap + PILL_GAP;
  if (state !== 'offline' || panelShown) return null;
  return (
    <View pointerEvents="box-none" style={[styles.bannerSlot, { top }]}>
      <Animated.View
        entering={FadeIn.duration(FADE_MS)}
        exiting={FadeOut.duration(FADE_MS)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={OFFLINE_SHORT}
          accessibilityHint="Shows what to check"
          style={styles.pill}
          onPress={() => showOfflineHelp(() => connection.open(), unpair)}
        >
          <WifiOff size={PILL_ICON_SIZE} color={theme.warningText} />
          <Text
            style={styles.pillText}
            numberOfLines={1}
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
          >
            {OFFLINE_SHORT}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ScreenWithOfflineBanner({ children }: { children: ReactElement }) {
  const [panelShown, setPanelShown] = useState(false);
  const [screenTop, setScreenTop] = useState(0);
  const screen = useRef<View>(null);
  const { connection } = useKorev();
  const styles = makeStyles(useTheme());
  const measureScreenTop = () =>
    screen.current?.measureInWindow((_x, y) => setScreenTop(y));
  return (
    <OfflinePanelShown value={setPanelShown}>
      <View ref={screen} style={styles.screen} onLayout={measureScreenTop}>
        {children}
        {connection ? (
          <OfflineBanner panelShown={panelShown} screenTop={screenTop} />
        ) : null}
      </View>
    </OfflinePanelShown>
  );
}

export function withOfflineBanner({
  options,
  children,
}: {
  options: { headerShown?: boolean };
  children: ReactElement;
}) {
  if (options.headerShown === false) return children;
  return <ScreenWithOfflineBanner>{children}</ScreenWithOfflineBanner>;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
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
    bannerSlot: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    pill: {
      maxWidth: PILL_MAX_WIDTH,
      height: PILL_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: PILL_HEIGHT / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgRaised,
    },
    pillText: {
      flexShrink: 1,
      color: theme.warningText,
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
