import { Stack } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { Alert, StyleSheet, Text } from 'react-native';
import type { RemotePairing } from '../../../../../korev-desktop/src/shared/model';
import { useKorev } from '../../../korev';
import { confirmUnpair } from '../../../Offline';
import { HEADER_ICON_SIZE, HeaderButton, TabStack } from '../../../TabStack';
import { TYPE, useTheme, type Theme } from '../../../theme';
import { CHROME_FONT_SCALE } from '../../../ui';

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

function DemoBadge() {
  const styles = makeStyles(useTheme());
  return (
    <Text maxFontSizeMultiplier={CHROME_FONT_SCALE} style={styles.demo}>
      Demo
    </Text>
  );
}

export default function WorkspacesStack() {
  const theme = useTheme();
  const { pairing, demo, unpair } = useKorev();
  return (
    <TabStack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Workspaces',
          headerLeft: demo ? () => <DemoBadge /> : undefined,
          headerRight: () => (
            <HeaderButton
              label="Settings"
              onPress={() =>
                demo ? showDemo(unpair) : showPairing(pairing, unpair)
              }
            >
              <Settings size={HEADER_ICON_SIZE} color={theme.fg1} />
            </HeaderButton>
          ),
        }}
      />
    </TabStack>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    demo: {
      ...TYPE.footnote,
      paddingHorizontal: 8,
      color: theme.accentText,
      fontWeight: '600',
    },
  });
}
