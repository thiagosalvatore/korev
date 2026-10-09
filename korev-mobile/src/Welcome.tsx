import {
  GitPullRequest,
  MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react-native';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ListRow, ROW_ICON_SIZE } from './ListRow';
import { MONO_FONT, useTheme, type Theme } from './theme';
import { Button } from './ui';

const LOGO = require('../assets/icon.png');
const NOTIFICATION_ICON_SIZE = 20;
const BRAND_LOGO_SIZE = 28;
const ROW_ENTER_MS = 400;
const ROW_STAGGER_MS = 140;
const FIRST_ROW_DELAY_MS = 150;
const NOTIFICATION_DELAY_MS = 900;
const CARD_TILT = '-3deg';
const NO_OP = () => undefined;

type PreviewKind = 'working' | 'waiting' | 'ready';

interface PreviewRow {
  branch: string;
  status: string;
  kind: PreviewKind;
  stats?: [number, number];
}

const PREVIEW_ROWS: PreviewRow[] = [
  {
    branch: 'fix-login-redirect',
    status: 'Claude is working…',
    kind: 'working',
  },
  { branch: 'add-billing-page', status: 'Stripe or Paddle?', kind: 'waiting' },
  {
    branch: 'speed-up-search',
    status: 'Checks passed · ready to merge',
    kind: 'ready',
    stats: [128, 14],
  },
];

const KIND_ICONS: Record<Exclude<PreviewKind, 'working'>, LucideIcon> = {
  waiting: MessageCircleQuestion,
  ready: GitPullRequest,
};

function kindColor(theme: Theme, kind: PreviewKind): string {
  if (kind === 'waiting') return theme.warningText;
  if (kind === 'ready') return theme.successText;
  return theme.accentText;
}

function PreviewIcon({ kind }: { kind: PreviewKind }) {
  const theme = useTheme();
  if (kind === 'working')
    return <ActivityIndicator size="small" color={theme.accentText} />;
  const Icon = KIND_ICONS[kind];
  return <Icon size={ROW_ICON_SIZE} color={kindColor(theme, kind)} />;
}

function HeroGlow({ color }: { color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  );
}

function ProductPreview({ styles }: { styles: Styles }) {
  return (
    <View
      style={styles.preview}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        entering={FadeInDown.delay(NOTIFICATION_DELAY_MS).duration(
          ROW_ENTER_MS,
        )}
        style={styles.notification}
      >
        <Image source={LOGO} style={styles.notificationIcon} />
        <View style={styles.notificationText}>
          <Text style={styles.notificationTitle}>add-billing-page</Text>
          <Text style={styles.notificationBody} numberOfLines={1}>
            Claude has a question for you
          </Text>
        </View>
        <Text style={styles.notificationTime}>now</Text>
      </Animated.View>
      <View style={styles.card}>
        {PREVIEW_ROWS.map((row, index) => (
          <Animated.View
            key={row.branch}
            entering={FadeInUp.delay(
              FIRST_ROW_DELAY_MS + index * ROW_STAGGER_MS,
            ).duration(ROW_ENTER_MS)}
          >
            <ListRow
              accessibilityLabel={row.branch}
              icon={<PreviewIcon kind={row.kind} />}
              title={row.branch}
              highlighted={row.kind === 'waiting'}
              subtitle={row.status}
              end={
                row.stats ? (
                  <Text style={styles.stats}>
                    <Text style={styles.additions}>+{row.stats[0]}</Text>{' '}
                    <Text style={styles.deletions}>−{row.stats[1]}</Text>
                  </Text>
                ) : null
              }
              onPress={NO_OP}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

export function Welcome({
  message,
  onStart,
}: {
  message: string | null;
  onStart: () => void;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
        <HeroGlow color={theme.accent} />
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.brandLogo} />
          <Text style={styles.brandName}>Korev</Text>
        </View>
        <ProductPreview styles={styles} />
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.headline}>Your agents,{'\n'}in your pocket.</Text>
        <Text style={styles.subtitle}>
          See what every agent is doing, answer their questions and merge their
          work while you are away from your Mac.
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.cta}>
          <Button label="Pair with your Mac" large onPress={onStart} />
        </View>
      </View>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.bgApp },
    hero: { flex: 1, overflow: 'hidden', paddingHorizontal: 24 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    brandLogo: {
      width: BRAND_LOGO_SIZE,
      height: BRAND_LOGO_SIZE,
      borderRadius: BRAND_LOGO_SIZE / 4,
    },
    brandName: { color: theme.fg1, fontSize: 17, fontWeight: '700' },
    preview: { flex: 1, justifyContent: 'center', gap: 14 },
    notification: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 12,
      padding: 12,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgSurface,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    notificationIcon: {
      width: NOTIFICATION_ICON_SIZE,
      height: NOTIFICATION_ICON_SIZE,
      borderRadius: NOTIFICATION_ICON_SIZE / 4,
    },
    notificationText: { flex: 1, gap: 1 },
    notificationTitle: { color: theme.fg1, fontSize: 14, fontWeight: '600' },
    notificationBody: { color: theme.fg2, fontSize: 13 },
    notificationTime: {
      color: theme.fg4,
      fontSize: 12,
      alignSelf: 'flex-start',
    },
    card: {
      padding: 6,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgRaised,
      transform: [{ rotate: CARD_TILT }],
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    stats: { fontFamily: MONO_FONT, fontSize: 11 },
    additions: { color: theme.diffAdd },
    deletions: { color: theme.diffDel },
    footer: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
    headline: {
      color: theme.fg1,
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    subtitle: { color: theme.fg2, fontSize: 16, lineHeight: 23 },
    cta: { marginTop: 12 },
    message: { color: theme.dangerText, fontSize: 14, lineHeight: 20 },
  });
}
