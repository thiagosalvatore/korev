import { Stack, useLocalSearchParams } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ScriptKind } from '../../../../korev-desktop/src/shared/model';
import { attempt } from '../../attempt';
import { useAppState, usePendingAction } from '../../hooks';
import { useConnection } from '../../korev';
import { HeaderTextButton } from '../../TabStack';
import { appendTerminalText, plainTerminalText } from '../../terminalText';
import { MONO_FONT, TYPE, useTheme, type Theme } from '../../theme';
import { MIN_TOUCH_TARGET } from '../../ui';

const MAX_OUTPUT_CHARS = 200_000;
const LINK_ICON_SIZE = 16;

const TITLES: Record<ScriptKind, string> = { setup: 'Setup', run: 'Run' };

function scriptRef(workspaceId: string, kind: ScriptKind): string {
  return `${workspaceId}:${kind}`;
}

function useScriptOutput(workspaceId: string, kind: ScriptKind): string | null {
  const connection = useConnection();
  const [output, setOutput] = useState<string | null>(null);
  useEffect(() => {
    const ref = scriptRef(workspaceId, kind);
    const append = (chunk: string) =>
      setOutput((current) =>
        appendTerminalText(current ?? '', chunk, MAX_OUTPUT_CHARS),
      );
    const stopOutput = connection.on('terminal-output', (event) => {
      if (event.ref === ref) append(event.data);
    });
    const stopExit = connection.on('terminal-exit', (event) => {
      if (event.ref === ref) append(`\n[Exited with code ${event.exitCode}]\n`);
    });
    void connection.api
      .scriptOutput(workspaceId, kind)
      .catch(() => null)
      .then((initial) =>
        setOutput((current) => (initial ?? '') + (current ?? '')),
      );
    return () => {
      stopOutput();
      stopExit();
    };
  }, [connection, workspaceId, kind]);
  return output;
}

export default function ScriptScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: ScriptKind }>();
  const { api } = useConnection();
  const state = useAppState();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const output = useScriptOutput(id, kind);
  const scroll = useRef<ScrollView>(null);
  const { pending, run } = usePendingAction();
  const running = Boolean(
    state?.runningTerminals.includes(scriptRef(id, kind)),
  );
  const runUrl = kind === 'run' ? state?.runtime[id]?.runUrl : null;
  const text = output === null ? '' : plainTerminalText(output);

  const toggle = () =>
    void run('toggle', () =>
      running
        ? attempt('Korev could not stop the script', () =>
            api.stopScript(id, kind),
          )
        : attempt('Korev could not start the script', () =>
            api.startScript(id, kind),
          ),
    );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: TITLES[kind],
          headerRight: () =>
            pending ? null : (
              <HeaderTextButton
                label={running ? 'Stop' : 'Start'}
                bold
                onPress={toggle}
              />
            ),
        }}
      />
      {runUrl ? (
        <Pressable
          accessibilityRole="link"
          style={styles.link}
          onPress={() => void Linking.openURL(runUrl)}
        >
          <ExternalLink size={LINK_ICON_SIZE} color={theme.accentText} />
          <Text style={styles.linkText} numberOfLines={1}>
            {runUrl}
          </Text>
        </Pressable>
      ) : null}
      <ScrollView
        ref={scroll}
        style={styles.screen}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroll.current?.scrollToEnd()}
      >
        <Text selectable style={text ? styles.output : styles.empty}>
          {text || (running ? 'Waiting for output…' : 'No output yet.')}
        </Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    content: { padding: 12 },
    output: {
      ...TYPE.caption,
      fontFamily: MONO_FONT,
      lineHeight: 17,
      color: theme.fg1,
    },
    empty: { ...TYPE.subhead, color: theme.fg3 },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
      backgroundColor: theme.bgSurface,
    },
    linkText: { ...TYPE.subhead, flex: 1, color: theme.accentText },
  });
}
