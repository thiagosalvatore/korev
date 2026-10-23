import { Button, Icon, type IconName } from '../design-system';
import type { AutomationDraft } from '../shared/model';
import { describeSchedule, WEEKDAYS } from '../shared/schedule';

interface Step {
  icon: IconName;
  title: string;
  detail: string;
}

interface Example {
  icon: IconName;
  draft: AutomationDraft;
}

const STEPS: Step[] = [
  {
    icon: 'clock',
    title: 'Runs on your schedule',
    detail: 'Every 10 minutes, or at 09:00 on weekdays, while Korev is open.',
  },
  {
    icon: 'search',
    title: 'Checks your tools',
    detail:
      'Tickets, pull requests and alerts, through your MCP servers and gh.',
  },
  {
    icon: 'git-branch',
    title: 'Opens workspaces',
    detail: 'One for each piece of work, and never two for the same ticket.',
  },
];

const EXAMPLES: Example[] = [
  {
    icon: 'life-buoy',
    draft: {
      name: 'Support tickets',
      prompt:
        'Read my open support tickets. For each one assigned to me that is not in progress and needs a code change, open a workspace to fix it.',
      schedule: {
        kind: 'interval',
        minutes: 10,
        days: WEEKDAYS,
        window: { from: '09:00', until: '18:00' },
      },
      repoIds: [],
      enabled: true,
    },
  },
  {
    icon: 'git-pull-request',
    draft: {
      name: 'Morning PR review',
      prompt:
        'List the pull requests on GitHub that wait for my review. For each one, say what it changes and what I should look at first. Do not open workspaces.',
      schedule: { kind: 'times', times: ['09:00'], days: WEEKDAYS },
      repoIds: [],
      enabled: true,
    },
  },
  {
    icon: 'package',
    draft: {
      name: 'Dependency updates',
      prompt:
        'Check my repositories for outdated dependencies that have security fixes. For each one, open a workspace that updates it and runs the tests.',
      schedule: { kind: 'times', times: ['10:00'], days: [1] },
      repoIds: [],
      enabled: true,
    },
  },
];

function StepCard({ step }: { step: Step }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border-1 bg-surface p-4">
      <Icon name={step.icon} size={18} className="text-accent-text" />
      <span className="text-sm font-semibold text-fg-1">{step.title}</span>
      <span className="text-xs text-fg-3">{step.detail}</span>
    </li>
  );
}

function ExampleCard({
  example,
  onPick,
}: {
  example: Example;
  onPick(draft: AutomationDraft): void;
}) {
  return (
    <button
      type="button"
      className="flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border border-border-1 bg-surface p-4 text-left transition-colors duration-(--dur-fast) ease-out hover:border-accent-border hover:bg-hover focus-visible:shadow-focus"
      onClick={() => onPick(example.draft)}
    >
      <Icon name={example.icon} size={18} className="text-fg-2" />
      <span className="text-sm font-semibold text-fg-1">
        {example.draft.name}
      </span>
      <span className="text-xs text-fg-3">
        {describeSchedule(example.draft.schedule)}
      </span>
    </button>
  );
}

export function AutomationsEmptyState({
  onCreate,
}: {
  onCreate(draft?: AutomationDraft): void;
}) {
  return (
    <section
      aria-labelledby="automations-empty-title"
      className="flex flex-col items-center gap-8 py-8"
    >
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
          <Icon name="calendar-clock" size={26} />
        </div>
        <h2 id="automations-empty-title" className="m-0 type-h2 text-fg-1">
          Put agents on a schedule
        </h2>
        <p className="m-0 text-sm text-fg-3">
          An automation sends a prompt to an agent on the schedule you pick. The
          agent looks for work, and Korev opens a workspace for each piece it
          finds.
        </p>
        <Button variant="primary" icon="plus" onClick={() => onCreate()}>
          New automation
        </Button>
      </div>
      <ol className="m-0 grid w-full list-none grid-cols-3 gap-3 p-0">
        {STEPS.map((step) => (
          <StepCard key={step.title} step={step} />
        ))}
      </ol>
      <div className="flex w-full flex-col gap-3">
        <h3 className="m-0 type-label text-fg-2">Start from an example</h3>
        <div className="grid grid-cols-3 gap-3">
          {EXAMPLES.map((example) => (
            <ExampleCard
              key={example.draft.name}
              example={example}
              onPick={onCreate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
