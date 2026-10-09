import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONNECT_TIMEOUT_MS } from '../connection';
import { useKorev } from '../korev';
import { parsePairing } from '../pairing';
import { useTheme, type Theme } from '../theme';
import { Welcome } from '../Welcome';
import { Button } from '../ui';

const TAILSCALE_STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/tailscale/id1470499037',
  default: 'https://play.google.com/store/apps/details?id=com.tailscale.ipn',
});
const NOT_A_PAIRING_CODE =
  'That is not a Korev pairing code. Use the code in Settings → Remote access.';
const CAMERA_BLOCKED = 'Korev needs the camera to scan the pairing code.';

const MS_PER_SECOND = 1000;
const NO_ANSWER = `No answer in ${CONNECT_TIMEOUT_MS / MS_PER_SECOND} seconds.`;
const BACK_ICON_SIZE = 28;
const STEP_BADGE_SIZE = 24;
const SCAN_FRAME_SIZE = 240;

type Mode = 'welcome' | 'setup' | 'scan' | 'paste';

interface PairAttempt {
  controller: AbortController;
  cancelled: boolean;
  timedOut: boolean;
}

function unreachable(url: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Korev did not answer at ${url}. Check that Tailscale is on, on the phone, and that Korev on the Mac is signed in to the same tailnet. (${reason})`;
}

function askForCameraInSettings() {
  Alert.alert('Allow the camera', CAMERA_BLOCKED, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}

function Step({
  number,
  title,
  children,
  styles,
}: {
  number: number;
  title: string;
  children?: ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function Connecting({
  url,
  onCancel,
  styles,
}: {
  url: string;
  onCancel: () => void;
  styles: Styles;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={theme.accentText} />
      <Text style={styles.connectingTitle}>Connecting to Korev…</Text>
      <Text style={styles.connectingUrl}>{url}</Text>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={onCancel}>
        <Text style={styles.link}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function Scanner({
  onScan,
  onCancel,
  styles,
}: {
  onScan: (data: string) => void;
  onCancel: () => void;
  styles: Styles;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.scanner}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onScan(data)}
      />
      <View
        style={[
          styles.scanOverlay,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.scanHint}>
          Point the camera at the code in Korev on your Mac
        </Text>
        <View style={styles.scanFrame} />
        <Pressable
          accessibilityRole="button"
          style={styles.scanCancel}
          onPress={onCancel}
        >
          <Text style={styles.scanCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PairScreen() {
  const { pair, startDemo, unpairReason } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('welcome');
  const [pasted, setPasted] = useState('');
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<PairAttempt | null>(null);

  async function tryPair(text: string) {
    if (attemptRef.current) return;
    const pairing = parsePairing(text.trim());
    if (!pairing) {
      setMode('setup');
      setError(NOT_A_PAIRING_CODE);
      return;
    }
    const attempt: PairAttempt = {
      controller: new AbortController(),
      cancelled: false,
      timedOut: false,
    };
    attemptRef.current = attempt;
    const timer = setTimeout(() => {
      attempt.timedOut = true;
      attempt.controller.abort();
    }, CONNECT_TIMEOUT_MS);
    setConnectingTo(pairing.url);
    setError(null);
    try {
      await pair(pairing, attempt.controller.signal);
    } catch (failure) {
      if (!attempt.cancelled)
        setError(
          unreachable(pairing.url, attempt.timedOut ? NO_ANSWER : failure),
        );
      setMode((current) => (current === 'scan' ? 'setup' : current));
    } finally {
      clearTimeout(timer);
      attemptRef.current = null;
      setConnectingTo(null);
    }
  }

  function cancel() {
    const attempt = attemptRef.current;
    if (!attempt) return;
    attempt.cancelled = true;
    attempt.controller.abort();
  }

  async function startScan() {
    setError(null);
    if (permission?.granted) return setMode('scan');
    if (permission && !permission.canAskAgain) return askForCameraInSettings();
    const answer = await requestPermission();
    if (answer.granted) setMode('scan');
  }

  if (connectingTo)
    return <Connecting url={connectingTo} onCancel={cancel} styles={styles} />;

  if (mode === 'scan')
    return (
      <Scanner
        onScan={(data) => void tryPair(data)}
        onCancel={() => setMode('setup')}
        styles={styles}
      />
    );

  const message = error ?? unpairReason;

  if (mode === 'welcome')
    return (
      <Welcome
        message={message}
        onStart={() => setMode('setup')}
        onTryDemo={startDemo}
      />
    );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.back}
          onPress={() => setMode('welcome')}
        >
          <ChevronLeft size={BACK_ICON_SIZE} color={theme.fg1} />
        </Pressable>
        <Text style={styles.title}>Pair with your Mac</Text>
        <View style={styles.steps}>
          <Step number={1} title="Get Tailscale on this phone" styles={styles}>
            <Text style={styles.stepText}>
              Sign in with the account Korev uses on your Mac.
            </Text>
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              onPress={() => void Linking.openURL(TAILSCALE_STORE_URL)}
            >
              <Text style={styles.link}>Get Tailscale</Text>
            </Pressable>
          </Step>
          <Step
            number={2}
            title="Show the pairing code on your Mac"
            styles={styles}
          >
            <Text style={styles.stepText}>
              In Korev, open Settings → Remote access, turn it on and click Show
              code.
            </Text>
          </Step>
          <Step number={3} title="Scan it with this phone" styles={styles} />
        </View>
        {message ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
      </ScrollView>
      <View style={styles.actions}>
        {mode === 'paste' ? (
          <>
            <TextInput
              style={styles.input}
              value={pasted}
              onChangeText={setPasted}
              placeholder='{"url":"http://…","token":"…"}'
              placeholderTextColor={theme.fg4}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              multiline
            />
            <Button
              label="Pair"
              large
              disabled={!pasted.trim()}
              onPress={() => void tryPair(pasted)}
            />
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setMode('setup')}
            >
              <Text style={styles.secondaryAction}>Scan the code instead</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button
              label="Scan the pairing code"
              large
              onPress={() => void startScan()}
            />
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setMode('paste')}
            >
              <Text style={styles.secondaryAction}>Paste the code instead</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    page: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
    back: { alignSelf: 'flex-start', marginLeft: -6, marginBottom: 8 },
    title: { color: theme.fg1, fontSize: 28, fontWeight: '700' },
    steps: { gap: 20, marginTop: 20, marginBottom: 8 },
    step: { flexDirection: 'row', gap: 12 },
    stepBadge: {
      width: STEP_BADGE_SIZE,
      height: STEP_BADGE_SIZE,
      borderRadius: STEP_BADGE_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accentSubtle,
    },
    stepNumber: { color: theme.accentText, fontSize: 13, fontWeight: '700' },
    stepBody: { flex: 1, gap: 4, paddingTop: 2 },
    stepTitle: { color: theme.fg1, fontSize: 16, fontWeight: '600' },
    stepText: { color: theme.fg2, fontSize: 15, lineHeight: 21 },
    error: { color: theme.dangerText, fontSize: 14, lineHeight: 20 },
    link: { color: theme.accentText, fontSize: 15, fontWeight: '600' },
    input: {
      minHeight: 72,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgRaised,
      color: theme.fg1,
    },
    actions: { paddingHorizontal: 24, paddingTop: 12, gap: 16 },
    secondaryAction: {
      color: theme.accentText,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
      backgroundColor: theme.bgApp,
    },
    connectingTitle: { color: theme.fg1, fontSize: 17, fontWeight: '600' },
    connectingUrl: { color: theme.fg3, fontSize: 13, textAlign: 'center' },
    scanner: { flex: 1, backgroundColor: '#000' },
    scanOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
    },
    scanHint: {
      color: theme.fgOnAccent,
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
    },
    scanFrame: {
      width: SCAN_FRAME_SIZE,
      height: SCAN_FRAME_SIZE,
      borderRadius: 24,
      borderWidth: 3,
      borderColor: theme.fgOnAccent,
    },
    scanCancel: { paddingHorizontal: 24, paddingVertical: 12 },
    scanCancelText: {
      color: theme.fgOnAccent,
      fontSize: 17,
      fontWeight: '600',
    },
  });
}
