import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DiffRow } from '../../../korev-desktop/src/shared/diff';
import {
  changedFiles,
  findFilePatch,
  hunksForChange,
  uncoveredFiles,
  type CodeChange,
  type Explainer,
  type ExplainerContent,
  type FilePatch,
  type RiskLevel,
} from '../../../korev-desktop/src/shared/explainer';
import {
  richSegments,
  type GlossaryEntry,
} from '../../../korev-desktop/src/shared/glossary';
import type {
  ChatItem,
  ChatSession,
} from '../../../korev-desktop/src/shared/model';
import { attempt } from '../attempt';
import { Loading } from '../Offline';
import { useConnection } from '../korev';
import { MONO_FONT, useTheme, type Theme } from '../theme';
import { Button, CHROME_FONT_SCALE, MIN_TOUCH_TARGET } from '../ui';

type Styles = ReturnType<typeof makeStyles>;

const CHEVRON_SIZE = 16;
const MAX_CODE_ROWS = 80;
const PARAGRAPH_BREAK = /\n{2,}/;
const SIGNS: Record<DiffRow['type'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
};
const RISK_LABELS: Record<RiskLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function useExplainer(session: ChatSession): Explainer | null {
  const { api } = useConnection();
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  const status = session.explainer?.status;
  const revision = session.explainer?.revision;
  useEffect(() => {
    let current = true;
    void api
      .explainer(session.id)
      .then((loaded) => current && setExplainer(loaded))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [api, session.id, status, revision]);
  return explainer;
}

function RichText({
  text,
  glossary,
  style,
  styles,
}: {
  text: string;
  glossary: GlossaryEntry[];
  style: Styles[keyof Styles];
  styles: Styles;
}) {
  return text
    .split(PARAGRAPH_BREAK)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => (
      <Text key={index} style={style}>
        {richSegments(paragraph, glossary).map((segment, part) => {
          if (segment.kind === 'code')
            return (
              <Text key={part} style={styles.code}>
                {segment.text}
              </Text>
            );
          if (segment.kind === 'term')
            return (
              <Text
                key={part}
                accessibilityRole="button"
                accessibilityHint="Shows what this word means"
                style={styles.term}
                onPress={() => Alert.alert(segment.text, segment.meaning)}
              >
                {segment.text}
              </Text>
            );
          return segment.text;
        })}
      </Text>
    ));
}

function Heading({ title, styles }: { title: string; styles: Styles }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {title}
    </Text>
  );
}

function rowStyle(row: DiffRow, styles: Styles) {
  if (row.type === 'add') return styles.rowAdd;
  if (row.type === 'del') return styles.rowDel;
  if (row.type === 'hunk') return styles.rowHunk;
  return null;
}

function CodeExcerpt({
  change,
  file,
  styles,
}: {
  change: CodeChange;
  file: FilePatch | undefined;
  styles: Styles;
}) {
  const rows = file ? hunksForChange(file, change).slice(0, MAX_CODE_ROWS) : [];
  return (
    <View style={styles.codeBox}>
      <Text style={styles.codeFile} numberOfLines={1}>
        {change.file}
      </Text>
      {rows.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.codeRows}
        >
          <View style={styles.codeRows}>
            {rows.map((row, index) => (
              <Text key={index} style={[styles.codeRow, rowStyle(row, styles)]}>
                {row.type === 'hunk'
                  ? row.code
                  : `${String(row.newLine ?? row.oldLine ?? '').padStart(4)} ${SIGNS[row.type]} ${row.code}`}
              </Text>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={styles.dim}>No line changes to show here.</Text>
      )}
    </View>
  );
}

function Step({
  index,
  content,
  files,
  open,
  onToggle,
  styles,
}: {
  index: number;
  content: ExplainerContent;
  files: FilePatch[];
  open: boolean;
  onToggle: () => void;
  styles: Styles;
}) {
  const theme = useTheme();
  const step = content.tour[index];
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.stepHeader}
        onPress={onToggle}
      >
        <View style={styles.number}>
          <Text
            maxFontSizeMultiplier={CHROME_FONT_SCALE}
            style={styles.numberText}
          >
            {index + 1}
          </Text>
        </View>
        <Text style={styles.stepTitle}>
          {step.title}
          {step.pr ? <Text style={styles.mono}>{`  #${step.pr}`}</Text> : null}
        </Text>
        <Chevron size={CHEVRON_SIZE} color={theme.fg3} />
      </Pressable>
      {open ? (
        <View style={styles.stepBody}>
          <RichText
            text={step.explanation}
            glossary={content.glossary}
            style={styles.body}
            styles={styles}
          />
          {step.why.trim() ? (
            <View style={styles.why}>
              <Text style={styles.whyLabel}>Why</Text>
              <RichText
                text={step.why}
                glossary={content.glossary}
                style={styles.body}
                styles={styles}
              />
            </View>
          ) : null}
          {step.changes.map((change, part) => (
            <CodeExcerpt
              key={part}
              change={change}
              file={findFilePatch(files, change.file, step.pr)}
              styles={styles}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function riskColors(theme: Theme, level: RiskLevel) {
  if (level === 'high')
    return { border: theme.riskHigh, background: theme.riskHighSubtle };
  if (level === 'medium')
    return { border: theme.riskMedium, background: theme.riskMediumSubtle };
  return { border: theme.riskLow, background: theme.riskLowSubtle };
}

function Banner({
  session,
  explainer,
  styles,
}: {
  session: ChatSession;
  explainer: Explainer;
  styles: Styles;
}) {
  const { api } = useConnection();
  const [pending, setPending] = useState(false);
  const { ref, latestRevision } = explainer;
  const update = async () => {
    setPending(true);
    await attempt('Korev could not update the explanation', () =>
      api.updateExplainer(session.id),
    );
    setPending(false);
  };
  if (ref.status === 'writing')
    return <Text style={styles.bannerNeutral}>Updating the explanation…</Text>;
  const stale = latestRevision !== null && latestRevision !== ref.revision;
  if (ref.status !== 'failed' && !stale) return null;
  return (
    <View
      style={
        ref.status === 'failed' ? styles.bannerDanger : styles.bannerWarning
      }
    >
      <Text style={styles.bannerText}>
        {ref.status === 'failed'
          ? `The last update failed: ${ref.error ?? ''}`
          : 'This change moved on since this explanation was written.'}
      </Text>
      <Button
        label={ref.status === 'failed' ? 'Try again' : 'Update'}
        variant="secondary"
        pending={pending}
        onPress={() => void update()}
      />
    </View>
  );
}

function Explanation({
  session,
  explainer,
  content,
  styles,
}: {
  session: ChatSession;
  explainer: Explainer;
  content: ExplainerContent;
  styles: Styles;
}) {
  const theme = useTheme();
  const [openStep, setOpenStep] = useState<number | null>(0);
  const files = useMemo(() => changedFiles(explainer.patch), [explainer.patch]);
  const fileCount = new Set(files.map((file) => file.path)).size;
  const summaries = new Map(
    (content.layers ?? []).map((layer) => [layer.pr, layer.summary]),
  );
  const missing = useMemo(
    () => uncoveredFiles(content, explainer.patch),
    [content, explainer.patch],
  );
  const { ref } = explainer;
  const { glossary } = content;
  const number = ref.target.kind === 'pr' ? `#${ref.target.number} · ` : '';
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Banner session={session} explainer={explainer} styles={styles} />
      <View style={styles.titleBlock}>
        <Text style={styles.meta}>
          {number}
          {ref.author ? `@${ref.author} · ` : ''}
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {ref.title}
        </Text>
        {ref.url ? (
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => void Linking.openURL(ref.url ?? '')}
          >
            Open on GitHub
          </Text>
        ) : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.overlineAccent}>IN ONE SENTENCE</Text>
        <RichText
          text={content.headline}
          glossary={glossary}
          style={styles.headline}
          styles={styles}
        />
        <RichText
          text={content.summary}
          glossary={glossary}
          style={styles.muted}
          styles={styles}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.overline}>BEFORE</Text>
        <RichText
          text={content.before}
          glossary={glossary}
          style={styles.body}
          styles={styles}
        />
      </View>
      <View style={[styles.card, styles.after]}>
        <Text style={styles.overlineAccent}>AFTER</Text>
        <RichText
          text={content.after}
          glossary={glossary}
          style={styles.body}
          styles={styles}
        />
      </View>
      {ref.stack ? (
        <View style={styles.section}>
          <Heading title="The stack" styles={styles} />
          {ref.stack.map((layer, index) => (
            <View key={layer.number} style={styles.flowRow}>
              <View style={styles.number}>
                <Text
                  maxFontSizeMultiplier={CHROME_FONT_SCALE}
                  style={styles.numberText}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={styles.flowText}>
                <Text style={styles.strong}>
                  #{layer.number} {layer.title}
                </Text>
                <RichText
                  text={summaries.get(layer.number) ?? ''}
                  glossary={glossary}
                  style={styles.muted}
                  styles={styles}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {content.flow.length ? (
        <View style={styles.section}>
          <Heading title="How it works" styles={styles} />
          {content.flow.map((stage, index) => (
            <View key={index} style={styles.flowRow}>
              <View style={styles.number}>
                <Text
                  maxFontSizeMultiplier={CHROME_FONT_SCALE}
                  style={styles.numberText}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={styles.flowText}>
                <Text style={styles.strong}>{stage.label}</Text>
                <RichText
                  text={stage.detail}
                  glossary={glossary}
                  style={styles.muted}
                  styles={styles}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <Heading title="Walkthrough" styles={styles} />
        {content.tour.map((_step, index) => (
          <Step
            key={index}
            index={index}
            content={content}
            files={files}
            open={openStep === index}
            onToggle={() => setOpenStep(openStep === index ? null : index)}
            styles={styles}
          />
        ))}
      </View>
      {content.risks.length ? (
        <View style={styles.section}>
          <Heading title="Look closely" styles={styles} />
          {content.risks.map((risk, index) => {
            const colors = riskColors(theme, risk.level);
            return (
              <View
                key={index}
                style={[
                  styles.risk,
                  {
                    borderLeftColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <Text style={styles.strong}>
                  <Text style={[styles.riskLevel, { color: colors.border }]}>
                    {RISK_LABELS[risk.level].toUpperCase()}
                  </Text>
                  {'  '}
                  {risk.title}
                </Text>
                <RichText
                  text={risk.explanation}
                  glossary={glossary}
                  style={styles.muted}
                  styles={styles}
                />
                {risk.file ? (
                  <Text style={styles.mono}>{risk.file}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {content.questions.length ? (
        <View style={styles.section}>
          <Heading title="Questions for the author" styles={styles} />
          {content.questions.map((question, index) => (
            <Text key={index} selectable style={styles.body}>
              • {question}
            </Text>
          ))}
        </View>
      ) : null}
      {missing.length || content.routine.length ? (
        <View style={styles.section}>
          <Heading title="Other files" styles={styles} />
          {missing.length ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Not explained</Text>
              <Text style={styles.body}>
                The explanation does not mention these changed files. Read them
                in the diff.
              </Text>
              {missing.map((file) => (
                <Text key={file} style={styles.mono}>
                  {file}
                </Text>
              ))}
            </View>
          ) : null}
          {content.routine.map((entry) => (
            <Text key={entry.file} style={styles.muted}>
              <Text style={styles.mono}>{entry.file}</Text> {entry.reason}
            </Text>
          ))}
        </View>
      ) : null}
      {glossary.length ? (
        <View style={styles.section}>
          <Heading title="Words used here" styles={styles} />
          {glossary.map((entry) => (
            <Text key={entry.term} style={styles.body}>
              <Text style={styles.strong}>{entry.term}</Text> {entry.meaning}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function latestActivity(items: ChatItem[] | null): string | null {
  const tool = items?.findLast((item) => item.kind === 'tool');
  return tool?.kind === 'tool' ? tool.summary || tool.name : null;
}

export function ExplainerView({
  session,
  items,
  onShowChat,
}: {
  session: ChatSession;
  items: ChatItem[] | null;
  onShowChat: () => void;
}) {
  const { api } = useConnection();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const explainer = useExplainer(session);
  const [retrying, setRetrying] = useState(false);
  const ref = session.explainer;
  if (!ref || !explainer) return <Loading style={styles.fill} />;
  if (explainer.content)
    return (
      <Explanation
        session={session}
        explainer={explainer}
        content={explainer.content}
        styles={styles}
      />
    );
  const retry = async () => {
    setRetrying(true);
    await attempt('Korev could not start the explanation again', () =>
      api.updateExplainer(session.id),
    );
    setRetrying(false);
  };
  return (
    <View style={styles.state}>
      {ref.status === 'failed' ? (
        <>
          <Text style={styles.stateTitle}>
            Korev could not build the explanation
          </Text>
          <Text style={styles.stateText}>{ref.error}</Text>
          <Button
            label="Try again"
            pending={retrying}
            onPress={() => void retry()}
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.accentText} />
          <Text style={styles.stateTitle}>
            Writing an explanation of {ref.title}
          </Text>
          <Text style={styles.stateText} numberOfLines={2}>
            {latestActivity(items) ?? 'Reading the change…'}
          </Text>
        </>
      )}
      <Button label="Open chat" variant="secondary" onPress={onShowChat} />
    </View>
  );
}

function makeStyles(theme: Theme) {
  const box = {
    gap: 6,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border2,
    backgroundColor: theme.bgSurface,
  };
  const banner = {
    gap: 8,
    padding: 12,
    borderRadius: 8,
  };
  return StyleSheet.create({
    fill: { flex: 1 },
    page: { padding: 16, gap: 14, paddingBottom: 32 },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
    },
    stateTitle: {
      color: theme.fg1,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    stateText: { color: theme.fg3, fontSize: 14, textAlign: 'center' },
    titleBlock: { gap: 4 },
    meta: { color: theme.fg3, fontSize: 13 },
    title: { color: theme.fg1, fontSize: 20, fontWeight: '700' },
    link: { color: theme.accentText, fontSize: 14 },
    card: box,
    after: { backgroundColor: theme.accentSubtle, borderColor: theme.accent },
    overline: {
      color: theme.fg3,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    overlineAccent: {
      color: theme.accentText,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    headline: {
      color: theme.fg1,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600',
    },
    body: { color: theme.fg1, fontSize: 15, lineHeight: 22 },
    muted: { color: theme.fg2, fontSize: 14, lineHeight: 20 },
    strong: { color: theme.fg1, fontSize: 15, fontWeight: '600' },
    code: { fontFamily: MONO_FONT, fontSize: 13, color: theme.fg1 },
    term: {
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textDecorationColor: theme.fg4,
    },
    mono: { fontFamily: MONO_FONT, fontSize: 12, color: theme.fg2 },
    dim: { color: theme.fg3, fontSize: 13, padding: 10 },
    section: { gap: 10 },
    heading: { color: theme.fg1, fontSize: 17, fontWeight: '700' },
    flowRow: { flexDirection: 'row', gap: 10 },
    flowText: { flex: 1, gap: 2 },
    number: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgActive,
    },
    numberText: { color: theme.fg2, fontSize: 12, fontWeight: '700' },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: MIN_TOUCH_TARGET,
    },
    stepTitle: { flex: 1, color: theme.fg1, fontSize: 15, fontWeight: '600' },
    stepBody: { gap: 10 },
    why: {
      gap: 2,
      padding: 10,
      borderRadius: 8,
      backgroundColor: theme.accentSubtle,
    },
    whyLabel: { color: theme.accentText, fontSize: 13, fontWeight: '700' },
    codeBox: {
      overflow: 'hidden',
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border2,
      backgroundColor: theme.bgApp,
    },
    codeFile: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontFamily: MONO_FONT,
      fontSize: 12,
      color: theme.fg2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border1,
    },
    codeRows: { flexGrow: 1 },
    codeRow: {
      paddingHorizontal: 8,
      fontFamily: MONO_FONT,
      fontSize: 12,
      lineHeight: 18,
      color: theme.fg1,
    },
    rowAdd: { backgroundColor: theme.diffAddBg, color: theme.diffAdd },
    rowDel: { backgroundColor: theme.diffDelBg, color: theme.diffDel },
    rowHunk: { backgroundColor: theme.diffHunkBg, color: theme.accentText },
    risk: {
      gap: 4,
      padding: 12,
      borderRadius: 8,
      borderLeftWidth: 3,
    },
    riskLevel: { fontSize: 11, fontWeight: '700' },
    warningBox: {
      gap: 4,
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.warningSubtle,
    },
    warningTitle: { color: theme.warningText, fontSize: 14, fontWeight: '700' },
    bannerNeutral: {
      ...banner,
      color: theme.fg2,
      backgroundColor: theme.bgActive,
      fontSize: 14,
    },
    bannerWarning: { ...banner, backgroundColor: theme.warningSubtle },
    bannerDanger: { ...banner, backgroundColor: theme.bgActive },
    bannerText: { color: theme.fg1, fontSize: 14 },
  });
}
