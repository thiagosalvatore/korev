import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CONNECT_TIMEOUT_MS } from '../connection';
import { useKorev } from '../korev';
import { parsePairing } from '../pairing';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';

const NOT_A_PAIRING_CODE =
  'That is not a Korev pairing code. Use the code in Settings → Remote access.';

const MS_PER_SECOND = 1000;
const NO_ANSWER = `No answer in ${CONNECT_TIMEOUT_MS / MS_PER_SECOND} seconds.`;

interface PairAttempt {
  controller: AbortController;
  cancelled: boolean;
  timedOut: boolean;
}

function unreachable(url: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Korev did not answer at ${url}. Check that Tailscale is on, on the phone, and that Korev on the Mac is signed in to the same tailnet. (${reason})`;
}

export default function PairScreen() {
  const { pair, unpairReason } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [permission, requestPermission] = useCameraPermissions();
  const [pasted, setPasted] = useState('');
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<PairAttempt | null>(null);

  async function tryPair(text: string) {
    if (attemptRef.current) return;
    const pairing = parsePairing(text.trim());
    if (!pairing) {
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

  const busy = connectingTo !== null;
  const scanning = !busy && !error;

  function renderScanner() {
    if (connectingTo) {
      return (
        <View style={styles.connecting}>
          <ActivityIndicator size="large" color={theme.accentText} />
          <Text style={styles.connectingTitle}>Connecting to Korev…</Text>
          <Text style={styles.connectingUrl}>{connectingTo}</Text>
          <Pressable accessibilityRole="button" onPress={cancel}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      );
    }
    if (permission && !permission.granted && !permission.canAskAgain) {
      return (
        <Button
          label="Allow the camera in Settings"
          onPress={() => void Linking.openSettings()}
        />
      );
    }
    if (!permission?.granted) {
      return (
        <Button
          label="Use the camera"
          onPress={() => void requestPermission()}
        />
      );
    }
    return (
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          scanning ? ({ data }) => void tryPair(data) : undefined
        }
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      {unpairReason && !error ? (
        <Text style={styles.error}>{unpairReason}</Text>
      ) : null}
      <Text style={styles.body}>
        On your Mac, open Korev, go to Settings → Remote access, turn it on and
        click Show code. Then scan the code here.
      </Text>
      {renderScanner()}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => setError(null)}>
            <Text style={styles.link}>Scan again</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.label}>Or paste the code</Text>
      <TextInput
        style={styles.input}
        value={pasted}
        onChangeText={setPasted}
        placeholder='{"url":"http://…","token":"…"}'
        placeholderTextColor={theme.fg4}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <Button
        label="Pair"
        disabled={busy || !pasted.trim()}
        onPress={() => void tryPair(pasted)}
      />
    </ScrollView>
  );
}

const cameraBox = { width: '100%', aspectRatio: 1, borderRadius: 12 } as const;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 20, gap: 16 },
    body: { color: theme.fg2, fontSize: 15, lineHeight: 21 },
    camera: cameraBox,
    connecting: {
      ...cameraBox,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 20,
      backgroundColor: theme.bgRaised,
    },
    connectingTitle: { color: theme.fg1, fontSize: 17, fontWeight: '600' },
    connectingUrl: { color: theme.fg3, fontSize: 13, textAlign: 'center' },
    label: { color: theme.fg3, fontSize: 13, marginTop: 8 },
    input: {
      minHeight: 72,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border2,
      backgroundColor: theme.bgRaised,
      color: theme.fg1,
    },
    errorBox: { gap: 8 },
    error: { color: theme.dangerText, fontSize: 14, lineHeight: 20 },
    link: { color: theme.accentText, fontSize: 14, fontWeight: '600' },
  });
}
