import { router, Stack } from 'expo-router';
import { FolderTree, Settings } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
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
  const styles = makeStyles(theme);
  const { demo } = useKorev();
  return (
    <TabStack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Workspaces',
          headerLeft: demo ? () => <DemoBadge /> : undefined,
          headerRight: () => (
            <View style={styles.buttons}>
              <HeaderButton
                label="By repository"
                onPress={() => router.push('/repos')}
              >
                <FolderTree size={HEADER_ICON_SIZE} color={theme.fg1} />
              </HeaderButton>
              <HeaderButton
                label="Settings"
                onPress={() => router.push('/settings')}
              >
                <Settings size={HEADER_ICON_SIZE} color={theme.fg1} />
              </HeaderButton>
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="repos"
        options={{
          title: 'By repository',
          headerLargeTitleEnabled: false,
          headerStyle: { backgroundColor: theme.bgApp },
        }}
      />
    </TabStack>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    buttons: { flexDirection: 'row', gap: 12 },
    demo: {
      ...TYPE.footnote,
      paddingHorizontal: 8,
      color: theme.fg1,
      fontWeight: '600',
    },
  });
}
