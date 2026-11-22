import { router, Stack } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';
import { useKorev } from '../../../korev';
import { HEADER_ICON_SIZE, HeaderButton, TabStack } from '../../../TabStack';
import { TYPE, useTheme, type Theme } from '../../../theme';
import { CHROME_FONT_SCALE } from '../../../ui';

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
  const { demo } = useKorev();
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
              onPress={() => router.push('/settings')}
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
      color: theme.fg1,
      fontWeight: '600',
    },
  });
}
