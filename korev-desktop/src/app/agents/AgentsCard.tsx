import { useEffect, useState } from 'react';
import { Badge, Button, Card, Select, Tabs } from '../../design-system';
import {
  AGENT_INFO,
  isAgentProvider,
  type AgentModel,
  type AgentPreference,
  type AgentProvider,
  type AgentRunResult,
  type AgentStatus,
} from '../../shared/agents';
import { korev } from '../bridge';
import { saveAgent } from '../useSettings';
import { useAgentStatuses, type AgentStatuses } from './useAgentStatuses';

const CLI_DEFAULT_MODEL = '';
const CLI_DEFAULT_LABEL = 'CLI default';

type AgentModels = AgentPreference['models'];

function describe(status: AgentStatus): string {
  if (!status.installed) return 'Not found on this Mac';
  const version = status.version ? `Version ${status.version}` : null;
  return [version, status.plan].filter(Boolean).join(' · ');
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status.signedIn) return <Badge tone="success">Signed in</Badge>;
  if (status.installed) return <Badge tone="warning">Signed out</Badge>;
  return <Badge>Not installed</Badge>;
}

function TerminalSignIn({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
      Run
      <code className="rounded-xs bg-inset px-1.5 py-0.5 font-mono text-fg-1 select-all">
        {command}
      </code>
      in Terminal, then check again.
      <Button size="sm" variant="ghost" onClick={() => void copyCommand()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function TestResult({ result }: { result: AgentRunResult }) {
  if (!result.ok) {
    return <p className="m-0 text-xs text-danger-text">{result.message}</p>;
  }
  return (
    <p className="m-0 text-xs text-success-text">
      It works. The agent replied “{result.output.trim()}”.
    </p>
  );
}

interface AgentActionProps {
  status: AgentStatus;
  agents: AgentStatuses;
  testing: boolean;
  onTest: () => void;
}

function AgentAction({ status, agents, testing, onTest }: AgentActionProps) {
  const { provider } = status;
  if (!status.installed) {
    return (
      <>
        <Button
          variant="ghost"
          iconRight="external-link"
          onClick={() => void korev().shell.openAgentInstall(provider)}
        >
          Install
        </Button>
        <Button onClick={agents.refresh}>Check again</Button>
      </>
    );
  }
  if (status.signedIn) {
    return (
      <Button loading={testing} onClick={onTest}>
        Test
      </Button>
    );
  }
  if (AGENT_INFO[provider].terminalSignInCommand) {
    return <Button onClick={agents.refresh}>Check again</Button>;
  }
  if (agents.signingIn === provider) {
    return (
      <>
        <Button loading disabled>
          Waiting for browser…
        </Button>
        <Button variant="ghost" onClick={agents.cancelSignIn}>
          Cancel
        </Button>
      </>
    );
  }
  return (
    <Button
      variant="primary"
      disabled={agents.signingIn !== null}
      onClick={() => agents.signIn(provider)}
    >
      Sign in
    </Button>
  );
}

interface AgentRowProps {
  status: AgentStatus;
  agents: AgentStatuses;
}

function AgentRow({ status, agents }: AgentRowProps) {
  const { provider } = status;
  const info = AGENT_INFO[provider];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AgentRunResult | null>(null);
  const terminalCommand =
    status.installed && !status.signedIn ? info.terminalSignInCommand : null;

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await korev().agents.test(provider));
    } finally {
      setTesting(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border-1 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="type-h3 text-fg-1">{info.label}</span>
            <StatusBadge status={status} />
          </div>
          <div className="mt-0.5 text-xs text-fg-3">{describe(status)}</div>
        </div>
        <AgentAction
          status={status}
          agents={agents}
          testing={testing}
          onTest={() => void test()}
        />
      </div>
      {terminalCommand ? <TerminalSignIn command={terminalCommand} /> : null}
      {status.problem ? (
        <p className="m-0 text-xs text-danger-text">{status.problem}</p>
      ) : null}
      {testResult ? <TestResult result={testResult} /> : null}
    </li>
  );
}

function useAgentModels(provider: AgentProvider): AgentModel[] {
  const [models, setModels] = useState<AgentModel[]>([]);
  useEffect(() => {
    let current = true;
    setModels([]);
    void korev()
      .agents.models(provider)
      .then((loaded) => {
        if (current) setModels(loaded);
      });
    return () => {
      current = false;
    };
  }, [provider]);
  return models;
}

function modelOptions(models: AgentModel[], saved: string) {
  const known = models.some((model) => model.id === saved);
  const savedOption = saved && !known ? [{ value: saved, label: saved }] : [];
  return [
    { value: CLI_DEFAULT_MODEL, label: CLI_DEFAULT_LABEL },
    ...savedOption,
    ...models.map((model) => ({ value: model.id, label: model.label })),
  ];
}

function withModel(
  models: AgentModels,
  provider: AgentProvider,
  model: string,
): AgentModels {
  const next = { ...models };
  if (model === CLI_DEFAULT_MODEL) delete next[provider];
  else next[provider] = model;
  return next;
}

interface ModelSelectProps {
  provider: AgentProvider;
  preference: AgentPreference;
}

function ModelSelect({ provider, preference }: ModelSelectProps) {
  const models = useAgentModels(provider);
  const saved = preference.models[provider] ?? CLI_DEFAULT_MODEL;

  function choose(model: string) {
    void saveAgent({
      ...preference,
      models: withModel(preference.models, provider, model),
    });
  }

  return (
    <Select
      label="Model"
      value={saved}
      options={modelOptions(models, saved)}
      onChange={choose}
      className="min-w-48"
    />
  );
}

interface AgentChoiceProps {
  preference: AgentPreference;
  statuses: AgentStatus[];
}

function AgentChoice({ preference, statuses }: AgentChoiceProps) {
  const signedIn = statuses
    .filter((status) => status.signedIn)
    .map((status) => status.provider);
  const { provider } = preference;

  if (signedIn.length === 0) {
    return (
      <p className="mt-3 mb-0 text-xs text-fg-3">
        Sign in to Claude Code or Codex to choose which one runs AI tasks.
      </p>
    );
  }

  function choose(id: string) {
    if (isAgentProvider(id)) void saveAgent({ ...preference, provider: id });
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border-1 pt-3.5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-2">
            Run AI tasks with
          </div>
          <Tabs
            variant="pill"
            value={provider ?? ''}
            onChange={choose}
            tabs={signedIn.map((id) => ({ id, label: AGENT_INFO[id].label }))}
          />
        </div>
        {provider ? (
          <ModelSelect provider={provider} preference={preference} />
        ) : null}
      </div>
      {provider && !signedIn.includes(provider) ? (
        <p className="m-0 text-xs text-warning-text">
          {AGENT_INFO[provider].label} is signed out. AI tasks will fail until
          you sign in again or choose another agent.
        </p>
      ) : null}
    </div>
  );
}

export function AgentsCard({ preference }: { preference: AgentPreference }) {
  const agents = useAgentStatuses();
  const { statuses } = agents;
  return (
    <Card title="AI agents">
      <p className="mt-0 mb-3.5 text-xs text-fg-3">
        Korev runs AI tasks with the Claude Code or Codex app on this Mac, so
        they use your own subscription.
      </p>
      {statuses ? (
        <>
          <ul className="m-0 list-none p-0">
            {statuses.map((status) => (
              <AgentRow key={status.provider} status={status} agents={agents} />
            ))}
          </ul>
          <AgentChoice preference={preference} statuses={statuses} />
        </>
      ) : (
        <p className="m-0 text-xs text-fg-3">
          Looking for Claude Code and Codex…
        </p>
      )}
    </Card>
  );
}
