import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import {
  FolderGit2,
  MessageCircleQuestion,
  Plus,
  Settings,
} from 'lucide-react-native';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RemotePairing } from '../../../../korev-desktop/src/shared/model';
import { useAppState } from '../../hooks';
import { useKorev } from '../../korev';
import { openNewAsk, openNewWorkspace } from '../../navigation';
import { confirmUnpair } from '../../Offline';
import { useOpenTappedWorkspace } from '../../push';
import { useTheme, type Theme } from '../../theme';
import { CHROME_FONT_SCALE } from '../../ui';

const URL_SCHEME = /^[a-z]+:\/\//i;

function showPairing(
  pairing: RemotePairing | null,
  unpair: () => Promise<void>,
) {
  Alert.alert('Paired with Korev', pairing?.url.replace(URL_SCHEME, ''), [
    {
      text: 'Unpair',
      style: 'destructive',
      onPress: () => confirmUnpair(unpair),
    },
    { text: 'Done', style: 'cancel' },
  ]);
}

function showDemo(leave: () => Promise<void>) {
  Alert.alert(
    'This is the demo',
    'Nothing here runs on a real Mac. Pair your Mac to see your own agents.',
    [
      { text: 'Pair your Mac', onPress: () => void leave() },
      { text: 'Keep exploring', style: 'cancel' },
    ],
  );
}

const LOGO = require('../../../assets/icon.png');
const HEADER_ICON_SIZE = 22;
const CENTER_BUTTON_SIZE = 56;

function Brand({ demo, styles }: { demo: boolean; styles: Styles }) {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.logo} />
      <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.brandName}>
        Korev
      </Text>
      {demo ? (
        <Text
          maxFontSizeMultiplier={CHROME_FONT_SCALE}
          style={styles.demoBadge}
        >
          Demo
        </Text>
      ) : null}
    </View>
  );
}

function HeaderButton({
  label,
  onPress,
  children,
  styles,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.headerButton}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

function NewWorkspaceButton({ styles }: { styles: Styles }) {
  const theme = useTheme();
  return (
    <View style={styles.centerSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New workspace"
        style={({ pressed }) => [
          styles.centerButton,
          pressed && styles.centerButtonPressed,
        ]}
        onPress={() => openNewWorkspace()}
      >
        <Plus size={28} strokeWidth={2.5} color={theme.fgOnAccent} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { pairing, demo, unpair } = useKorev();
  const state = useAppState();
  useOpenTappedWorkspace();
  const waiting = state
    ? Object.values(state.runtime).filter((entry) => entry.status === 'waiting')
        .length
    : 0;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bgSurface },
        headerTintColor: theme.fg1,
        headerShadowVisible: false,
        headerTitleAllowFontScaling: false,
        sceneStyle: { backgroundColor: theme.bgApp },
        tabBarStyle: {
          backgroundColor: theme.bgSurface,
          borderTopColor: theme.border1,
        },
        tabBarActiveTintColor: theme.accentText,
        tabBarInactiveTintColor: theme.fg4,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Workspaces',
          headerTitle: () => <Brand demo={demo} styles={styles} />,
          headerRight: () => (
            <HeaderButton
              label="Settings"
              onPress={() =>
                demo ? showDemo(unpair) : showPairing(pairing, unpair)
              }
              styles={styles}
            >
              <Settings size={HEADER_ICON_SIZE} color={theme.fg2} />
            </HeaderButton>
          ),
          tabBarIcon: ({ color, size }) => (
            <FolderGit2 size={size} color={color} />
          ),
          tabBarBadge: waiting || undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.warning,
            color: theme.fgOnWarning,
          },
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'New workspace',
          tabBarButton: () => <NewWorkspaceButton styles={styles} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          headerRight: () => (
            <HeaderButton
              label="Ask a question"
              onPress={openNewAsk}
              styles={styles}
            >
              <Plus size={HEADER_ICON_SIZE} color={theme.fg2} />
            </HeaderButton>
          ),
          tabBarIcon: ({ color, size }) => (
            <MessageCircleQuestion size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    logo: { width: 24, height: 24, borderRadius: 6 },
    brandName: { color: theme.fg1, fontSize: 17, fontWeight: '700' },
    demoBadge: {
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: theme.accentSubtle,
      color: theme.accentText,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    headerButton: { paddingHorizontal: 16 },
    centerSlot: { flex: 1, alignItems: 'center' },
    centerButton: {
      width: CENTER_BUTTON_SIZE,
      height: CENTER_BUTTON_SIZE,
      marginTop: -CENTER_BUTTON_SIZE / 3,
      borderRadius: CENTER_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
      borderWidth: 4,
      borderColor: theme.bgSurface,
    },
    centerButtonPressed: { backgroundColor: theme.accentPress },
  });
}
