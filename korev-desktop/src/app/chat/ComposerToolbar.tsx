import type { ReactNode } from 'react';
import { cn, Icon, IconButton } from '../../design-system';
import {
  AGENT_LABELS,
  EFFORT_LEVELS,
  type AgentKind,
  type ModelChoice,
  type TurnUsage,
} from '../../shared/model';
import { Menu, type MenuItem } from '../ui/Menu';
import { ContextMeter } from './ContextMeter';

export interface ComposerToolbarProps {
  agent: AgentKind;
  models: ModelChoice[];
  loadout: ModelChoice[];
  model: string;
  effort: string;
  fast: boolean;
  planMode: boolean;
  hasSnippets: boolean;
  running: boolean;
  canSend: boolean;
  usage?: TurnUsage;
  contextPicker?: ReactNode;
  dictation?: ReactNode;
  onAttach(): void;
  onInsertSnippet(): void;
  onModelChange(choice: ModelChoice): void;
  onEffortChange(effort: string): void;
  onFastChange(fast: boolean): void;
  onPlanModeChange(planMode: boolean): void;
  onSend(): void;
  onStop?(): void;
}

const CHIP =
  'flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-2 text-xs text-fg-3 hover:bg-hover hover:text-fg-1';

function optionItems(props: ComposerToolbarProps): MenuItem[] {
  const snippets: MenuItem[] = props.hasSnippets
    ? [
        {
          id: 'snippet',
          label: 'Insert snippet',
          icon: 'text-quote',
          hint: '⌘;',
          onSelect: props.onInsertSnippet,
        },
      ]
    : [];
  return [
    {
      id: 'attach',
      label: 'Add attachment',
      icon: 'paperclip',
      hint: '⌘U',
      onSelect: props.onAttach,
    },
    ...snippets,
    {
      id: 'plan',
      label: 'Plan mode',
      icon: 'list-checks',
      hint: '⇧Tab',
      checked: props.planMode,
      onSelect: () => props.onPlanModeChange(!props.planMode),
    },
    {
      id: 'fast',
      label: 'Fast mode',
      icon: 'zap',
      hint: '⌘⇧E',
      checked: props.fast,
      onSelect: () => props.onFastChange(!props.fast),
    },
  ];
}

function isCurrent(props: ComposerToolbarProps, choice: ModelChoice) {
  return choice.agent === props.agent && choice.id === props.model;
}

function modelItems(props: ComposerToolbarProps): MenuItem[] {
  const loadout = props.loadout.map((entry, index) => ({
    id: `loadout:${entry.agent}:${entry.id}`,
    label: entry.label,
    hint: `⌃⌘${index + 1}`,
    section: 'Loadout',
    checked: isCurrent(props, entry),
    onSelect: () => props.onModelChange(entry),
  }));
  const all = props.models.map((entry) => ({
    id: `${entry.agent}:${entry.id}`,
    label: entry.label,
    section: AGENT_LABELS[entry.agent],
    checked: isCurrent(props, entry) && !loadout.length,
    onSelect: () => props.onModelChange(entry),
  }));
  return [...loadout, ...all];
}

export function ComposerToolbar(props: ComposerToolbarProps) {
  const modelLabel =
    props.models.find((entry) => isCurrent(props, entry))?.label ?? props.model;
  const showStop = props.running && !props.canSend;
  return (
    <div className="flex items-center gap-1 px-2 pb-2">
      <Menu
        label="Composer options"
        side="top"
        items={optionItems(props)}
        trigger={({ toggle }) => (
          <IconButton
            icon="plus"
            label="More options"
            size="sm"
            onClick={toggle}
          />
        )}
      />
      <IconButton
        icon="paperclip"
        label="Add attachment"
        title="Add attachment (⌘U)"
        size="sm"
        onClick={props.onAttach}
      />
      {props.contextPicker}
      <Menu
        label="Model"
        side="top"
        items={modelItems(props)}
        trigger={({ toggle }) => (
          <button
            type="button"
            aria-label="Model"
            className={cn(CHIP, 'font-medium text-fg-2')}
            onClick={toggle}
          >
            <Icon
              name={props.agent === 'claude' ? 'sparkle' : 'hexagon'}
              size={13}
            />
            {modelLabel}
            <Icon name="chevron-down" size={12} className="text-fg-4" />
          </button>
        )}
      />
      <Menu
        label="Effort"
        side="top"
        items={EFFORT_LEVELS[props.agent].map((level) => ({
          id: level,
          label: level,
          checked: level === props.effort,
          onSelect: () => props.onEffortChange(level),
        }))}
        trigger={({ toggle }) => (
          <button
            type="button"
            aria-label="Effort"
            title="Effort (⌘⇧/ cycles)"
            className={CHIP}
            onClick={toggle}
          >
            <Icon name="brain" size={13} />
            {props.effort}
          </button>
        )}
      />
      <button
        type="button"
        aria-label="Fast mode"
        aria-pressed={props.fast}
        title="Fast mode (⌘⇧E)"
        className={cn(
          CHIP,
          props.fast &&
            'bg-warning-subtle text-warning-text hover:text-warning-text',
        )}
        onClick={() => props.onFastChange(!props.fast)}
      >
        <Icon name="zap" size={13} />
        {props.fast ? 'Fast' : null}
      </button>
      {props.planMode ? (
        <button
          type="button"
          className="flex h-6 cursor-pointer items-center gap-1 rounded-sm border-0 bg-accent-subtle px-2 text-xs font-medium text-accent-text"
          onClick={() => props.onPlanModeChange(false)}
        >
          <Icon name="list-checks" size={12} />
          Plan mode
        </button>
      ) : null}
      <div className="flex-1" />
      {props.usage ? (
        <ContextMeter
          context={props.usage.context}
          limits={props.usage.limits}
        />
      ) : null}
      {props.running && props.canSend ? (
        <span className="mr-1 text-2xs text-fg-4">
          {props.agent === 'claude'
            ? 'Steers the running agent'
            : 'Queued until the agent finishes'}
        </span>
      ) : null}
      {props.dictation}
      {props.running && props.onStop ? (
        <button
          type="button"
          aria-label="Stop agent"
          title="Stop (⌘⇧⌫)"
          className={cn(
            'flex size-7 cursor-pointer items-center justify-center rounded-full border-0',
            showStop ? 'bg-fg-1 text-app' : 'bg-active text-fg-2',
          )}
          onClick={props.onStop}
        >
          <Icon name="square" size={11} className="fill-current" />
        </button>
      ) : null}
      {showStop ? null : (
        <button
          type="button"
          aria-label="Send"
          disabled={!props.canSend}
          className="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-accent text-fg-on-accent disabled:cursor-default disabled:bg-active disabled:text-fg-4"
          onClick={props.onSend}
        >
          <Icon name="arrow-up" size={15} />
        </button>
      )}
    </div>
  );
}
