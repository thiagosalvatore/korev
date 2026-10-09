import { WifiOff } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const NAV_BAR_HEIGHT = 44;
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

function OfflinePanel() {
  const connection = useConnection();
  const { unpair } = useKorev();
  const { attempting } = useConnectionStatus();
  const theme = useTheme();
  const styles = makeStyles(theme);
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

export function Loading({ style }: { style?: StyleProp<ViewStyle> }) {
  const { state } = useConnectionStatus();
  if (state === 'offline') return <OfflinePanel />;
  return <ActivityIndicator style={style} />;
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

export function OfflineBanner() {
  const connection = useConnection();
  const { unpair } = useKorev();
  const { state } = useConnectionStatus();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const top = useSafeAreaInsets().top + (NAV_BAR_HEIGHT - PILL_HEIGHT) / 2;
  useAnnounceChanges(state);
  if (state !== 'offline') return null;
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: { padding: 20, gap: 16 },
    title: { color: theme.fg1, fontSize: 17, fontWeight: '600' },
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
