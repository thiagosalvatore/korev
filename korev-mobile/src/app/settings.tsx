import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useKorev } from '../korev';
import { confirmUnpair } from '../Offline';
import { TYPE, useTheme, type Theme } from '../theme';
import { MIN_TOUCH_TARGET } from '../ui';

const URL_SCHEME = /^[a-z]+:\/\//i;
const ROW_HEIGHT = MIN_TOUCH_TARGET + 4;

type Styles = ReturnType<typeof makeStyles>;

function Section({
  title,
  footer,
  children,
  styles,
}: {
  title: string;
  footer?: string;
  children: ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

function InfoRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: Styles;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionRow({
  label,
  destructive = false,
  onPress,
  styles,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={destructive ? styles.destructive : styles.action}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const styles = makeStyles(useTheme());
  const { pairing, demo, unpair } = useKorev();
  const version = Constants.expoConfig?.version ?? '';
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      {demo ? (
        <Section
          title="Demo"
          footer="Nothing in the demo runs on a real Mac. Pair your Mac to see your own agents."
          styles={styles}
        >
          <ActionRow
            label="Pair your Mac"
            onPress={() => void unpair()}
            styles={styles}
          />
        </Section>
      ) : (
        <Section title="Mac" styles={styles}>
          <InfoRow
            label="Paired with"
            value={pairing?.url.replace(URL_SCHEME, '') ?? ''}
            styles={styles}
          />
          <ActionRow
            label="Unpair this phone"
            destructive
            onPress={() => confirmUnpair(unpair)}
            styles={styles}
          />
        </Section>
      )}
      <Section
        title="Notifications"
        footer="Korev tells you when an agent needs you or finishes."
        styles={styles}
      >
        <ActionRow
          label="Notification settings"
          onPress={() => void Linking.openSettings()}
          styles={styles}
        />
      </Section>
      <Text style={styles.version}>Korev {version}</Text>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    page: { padding: 16, gap: 24 },
    section: { gap: 6 },
    sectionTitle: {
      ...TYPE.footnote,
      paddingHorizontal: 16,
      color: theme.fg3,
      textTransform: 'uppercase',
    },
    group: {
      overflow: 'hidden',
      borderRadius: 14,
      backgroundColor: theme.bgSurface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: ROW_HEIGHT,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    pressed: { backgroundColor: theme.bgHover },
    label: { ...TYPE.body, color: theme.fg1 },
    value: {
      ...TYPE.body,
      flex: 1,
      textAlign: 'right',
      color: theme.fg3,
    },
    action: { ...TYPE.body, color: theme.accentText },
    destructive: { ...TYPE.body, color: theme.dangerText },
    footer: { ...TYPE.footnote, paddingHorizontal: 16, color: theme.fg3 },
    version: { ...TYPE.footnote, textAlign: 'center', color: theme.fg4 },
  });
}
