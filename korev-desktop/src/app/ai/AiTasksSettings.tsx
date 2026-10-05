import { useEffect, useState } from 'react';
import { Button, Card, Field, Radio, Tabs } from '../../design-system';
import {
  AGENT_TASK_KINDS,
  AGENT_TASK_WORDS,
  DEFAULT_INSTRUCTIONS,
  type AgentTaskKind,
  type AgentTaskState,
  type AiTaskSettings,
  type ExplainFormat,
} from '../../shared/agent-tasks';
import { korev } from '../bridge';
import { announce } from '../LiveAnnouncer';
import { saveAiTasks } from '../useSettings';

const FORMAT_OPTIONS: { id: ExplainFormat; label: string }[] = [
  { id: 'html', label: 'Visual (HTML)' },
  { id: 'markdown', label: 'Text (Markdown)' },
];

const TEXTAREA_CLASS =
  'min-h-36 w-full resize-y rounded-sm border border-border-2 bg-inset p-2.5 type-ui text-fg-1 outline-none hover:border-border-strong focus:border-accent focus:shadow-halo';

const BYTE_UNITS = ['KB', 'MB', 'GB'];
const BYTES_PER_UNIT = 1024;

export function formatBytes(bytes: number): string {
  let value = bytes / BYTES_PER_UNIT;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
}

function ExplainCard({ format }: { format: ExplainFormat }) {
  return (
    <Card title="Explain">
      <div role="radiogroup" aria-label="Explain as" className="flex gap-4">
        {FORMAT_OPTIONS.map((option) => (
          <Radio
            key={option.id}
            name="explain-format"
            value={option.id}
            label={option.label}
            checked={format === option.id}
            onChange={() => void saveAiTasks({ explainFormat: option.id })}
          />
        ))}
      </div>
    </Card>
  );
}

function instructionsFor(
  settings: AiTaskSettings,
  kind: AgentTaskKind,
): string {
  return settings.instructions[kind] ?? DEFAULT_INSTRUCTIONS[kind];
}

function withInstructions(
  settings: AiTaskSettings,
  kind: AgentTaskKind,
  text: string,
): Partial<AiTaskSettings> {
  const instructions = { ...settings.instructions };
  if (text.trim() && text !== DEFAULT_INSTRUCTIONS[kind]) {
    instructions[kind] = text;
  } else {
    delete instructions[kind];
  }
  return { instructions };
}

function InstructionsCard({ settings }: { settings: AiTaskSettings }) {
  const [kind, setKind] = useState<AgentTaskKind>(AGENT_TASK_KINDS[0]);
  const saved = instructionsFor(settings, kind);
  const [draft, setDraft] = useState(saved);
  const [shownKind, setShownKind] = useState(kind);
  if (shownKind !== kind) {
    setShownKind(kind);
    setDraft(saved);
  }

  function save(text: string) {
    if (text === saved) return;
    void saveAiTasks(withInstructions(settings, kind, text));
  }

  function reset() {
    setDraft(DEFAULT_INSTRUCTIONS[kind]);
    save(DEFAULT_INSTRUCTIONS[kind]);
  }

  return (
    <Card title="Instructions">
      <Tabs
        variant="pill"
        value={kind}
        onChange={(id) => setKind(id as AgentTaskKind)}
        tabs={AGENT_TASK_KINDS.map((id) => ({
          id,
          label: AGENT_TASK_WORDS[id].name,
        }))}
      />
      <Field
        className="mt-3"
        label={`Instructions for ${AGENT_TASK_WORDS[kind].name}`}
        hint="Type /skill-name to use one of your Claude Code skills."
      >
        <textarea
          className={TEXTAREA_CLASS}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => save(draft)}
        />
      </Field>
      <Button
        className="mt-2"
        size="sm"
        variant="ghost"
        disabled={draft === DEFAULT_INSTRUCTIONS[kind]}
        onClick={reset}
      >
        Reset to default
      </Button>
    </Card>
  );
}

function CheckoutsCard({ busy }: { busy: boolean }) {
  const [size, setSize] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void korev().ai.checkoutsSize().then(setSize);
  }, []);

  async function remove() {
    const result = await korev().ai.removeCheckouts();
    setProblem(result.ok ? null : result.message);
    if (result.ok) announce('Removed checkouts');
    setSize(await korev().ai.checkoutsSize());
  }

  return (
    <Card title="Checkouts">
      <div className="flex items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-sm text-fg-2">
          Korev keeps its own copies of your repos to run AI tasks in
          {size === null ? '.' : ` · ${formatBytes(size)}`}
        </p>
        <Button
          variant="danger"
          disabled={busy}
          title={
            busy ? 'Wait for Korev to finish its running tasks' : undefined
          }
          onClick={() => void remove()}
        >
          Remove checkouts
        </Button>
      </div>
      {problem ? (
        <p className="mt-2 mb-0 text-xs text-danger-text">{problem}</p>
      ) : null}
    </Card>
  );
}

export interface AiTasksSettingsProps {
  settings: AiTaskSettings;
  tasks: Record<string, AgentTaskState>;
}

export function AiTasksSettings({ settings, tasks }: AiTasksSettingsProps) {
  const busy = Object.values(tasks).some((task) => task.status === 'running');
  return (
    <>
      <ExplainCard format={settings.explainFormat} />
      <InstructionsCard settings={settings} />
      <CheckoutsCard busy={busy} />
    </>
  );
}
