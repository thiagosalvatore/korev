import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useKorev } from '../korev';
import { parsePairing } from '../pairing';
import { useTheme, type Theme } from '../theme';
import { Button } from '../ui';

const NOT_A_PAIRING_CODE =
  'That is not a Korev pairing code. Use the code in Settings → Remote access.';

function unreachable(url: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Korev did not answer at ${url}. Check that Tailscale is on, on the phone, and that Korev on the Mac is signed in to the same tailnet. (${reason})`;
}

export default function PairScreen() {
  const { pair } = useKorev();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [permission, requestPermission] = useCameraPermissions();
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tryPair(text: string) {
    const pairing = parsePairing(text.trim());
    if (!pairing) {
      setError(NOT_A_PAIRING_CODE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pair(pairing);
    } catch (failure) {
      setError(unreachable(pairing.url, failure));
    } finally {
      setBusy(false);
    }
  }

  const scanning = !busy && !error;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.body}>
        On your Mac, open Korev, go to Settings → Remote access, turn it on and
        click Show code. Then scan the code here.
      </Text>
      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            scanning ? ({ data }) => void tryPair(data) : undefined
          }
        />
      ) : (
        <Button
          label="Use the camera"
          onPress={() => void requestPermission()}
        />
      )}
      {busy && <Text style={styles.body}>Connecting…</Text>}
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 20, gap: 16 },
    body: { color: theme.fg2, fontSize: 15, lineHeight: 21 },
    camera: { width: '100%', aspectRatio: 1, borderRadius: 12 },
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
