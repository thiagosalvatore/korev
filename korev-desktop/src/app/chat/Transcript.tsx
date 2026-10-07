import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  cn,
  Dialog,
  Icon,
  IconButton,
  type IconName,
} from '../../design-system';
import type { ChatItem, PermissionResponse, Todo } from '../../shared/model';
import { duration } from '../format';
import { Markdown } from './Markdown';
import { PermissionCard } from './PermissionCard';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const TOOL_ICONS: Record<string, IconName> = {
  Read: 'file-text',
  Edit: 'file-pen',
  MultiEdit: 'file-pen',
  Write: 'file-plus',
  Bash: 'terminal',
  Grep: 'search',
  Glob: 'folder-search',
  WebFetch: 'globe',
  WebSearch: 'globe',
  Task: 'bot',
  Agent: 'bot',
  Skill: 'sparkles',
};

const TOOL_GROUP_THRESHOLD = 3;

function ToolRow({ item, running }: { item: ToolItem; running: boolean }) {
  const [open, setOpen] = useState(false);
  const pending = item.output === null && running;
  return (
    <div className="text-sm">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-1.5 py-1 text-left text-fg-2 hover:bg-hover"
        onClick={() => setOpen((value) => !value)}
      >
        {pending ? (
          <Icon
            name="loader-circle"
            size={13}
            className="animate-spin text-fg-3"
          />
        ) : (
          <Icon
            name={
              item.failed ? 'circle-x' : (TOOL_ICONS[item.name] ?? 'wrench')
            }
            size={13}
            className={item.failed ? 'text-danger-text' : 'text-fg-3'}
          />
        )}
        <span className="font-medium text-fg-1">{item.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-3">
          {item.summary}
        </span>
        <Icon
          name="chevron-right"
          size={12}
          className={cn('text-fg-4 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open ? (
        <div className="mt-1 mb-2 ml-6 flex flex-col gap-1.5">
          {item.detail ? (
            <pre className="m-0 max-h-72 overflow-auto rounded-md border border-border-1 bg-inset p-2 font-mono text-xs whitespace-pre-wrap text-fg-2">
              {item.detail}
            </pre>
          ) : null}
          {item.output ? (
            <pre
              className={cn(
                'm-0 max-h-72 overflow-auto rounded-md border border-border-1 bg-inset p-2 font-mono text-xs whitespace-pre-wrap',
                item.failed ? 'text-danger-text' : 'text-fg-3',
              )}
            >
              {item.output}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolGroup({
  items,
  running,
}: {
  items: ToolItem[];
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const last = items.at(-1);
  if (items.length <= TOOL_GROUP_THRESHOLD || open) {
    return (
      <div className="flex flex-col">
        {items.length > TOOL_GROUP_THRESHOLD ? (
          <button
            type="button"
            className="mb-0.5 cursor-pointer self-start rounded-sm border-0 bg-transparent px-1.5 text-xs text-fg-3 hover:text-fg-1"
            onClick={() => setOpen(false)}
          >
            Collapse {items.length} tool calls
          </button>
        ) : null}
        {items.map((item) => (
          <ToolRow key={item.id} item={item} running={running} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-1.5 py-1 text-left text-sm text-fg-3 hover:bg-hover hover:text-fg-1"
        onClick={() => setOpen(true)}
      >
        <Icon name="layers" size={13} />
        {items.length - 1} tool calls
        <Icon name="chevron-right" size={12} />
      </button>
      {last ? <ToolRow item={last} running={running} /> : null}
    </div>
  );
}

const TODO_ICONS: Record<Todo['status'], IconName> = {
  pending: 'circle',
  in_progress: 'circle-dot',
  completed: 'circle-check',
};

function TodoCard({ todos }: { todos: Todo[] }) {
  const done = todos.filter((todo) => todo.status === 'completed').length;
  return (
    <div className="rounded-md border border-border-1 bg-surface p-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-fg-3">
        <Icon name="list-todo" size={13} />
        Todos · {done}/{todos.length}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {todos.map((todo, index) => (
          <li
            key={index}
            className={cn(
              'flex items-start gap-2 text-sm',
              todo.status === 'completed'
                ? 'text-fg-4 line-through'
                : 'text-fg-1',
            )}
          >
            <Icon
              name={TODO_ICONS[todo.status]}
              size={13}
              className={cn(
                'mt-0.5',
                todo.status === 'in_progress'
                  ? 'text-accent-text'
                  : 'text-fg-3',
              )}
            />
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1.5 py-1 text-sm text-fg-3 italic hover:text-fg-1"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="brain" size={13} />
        Thinking
        <Icon
          name="chevron-right"
          size={12}
          className={cn('transition-transform', open && 'rotate-90')}
        />
      </button>
      {open ? (
        <p className="m-0 ml-6 text-sm whitespace-pre-wrap text-fg-3 italic">
          {text}
        </p>
      ) : null}
    </div>
  );
}

function UserMessage({
  item,
  canRevert,
  onRevert,
}: {
  item: Extract<ChatItem, { kind: 'user' }>;
  canRevert: boolean;
  onRevert: () => void;
}) {
  return (
    <div className="group flex justify-end gap-1">
      <div className="flex items-start gap-0.5 pt-1 opacity-0 group-hover:opacity-100">
        <IconButton
          icon="copy"
          label="Copy message"
          size="sm"
          onClick={() => void navigator.clipboard.writeText(item.text)}
        />
        {canRevert && item.checkpoint ? (
          <IconButton
            icon="undo-2"
            label="Revert to before this message"
            size="sm"
            onClick={onRevert}
          />
        ) : null}
      </div>
      <div
        className={cn(
          'max-w-[85%] rounded-lg border border-border-1 bg-raised px-3.5 py-2.5 text-md whitespace-pre-wrap text-fg-1',
          item.queued && 'border-dashed opacity-60',
        )}
      >
        {item.queued ? (
          <span className="mb-1 block text-2xs font-medium tracking-wide text-fg-3 uppercase">
            Queued
          </span>
        ) : null}
        {item.text}
      </div>
    </div>
  );
}

function ResultLine({
  item,
  onRetry,
}: {
  item: Extract<ChatItem, { kind: 'result' }>;
  onRetry: (() => void) | null;
}) {
  if (!item.ok) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
        <Icon name="octagon-alert" size={14} className="mt-0.5" />
        <span className="flex-1 whitespace-pre-wrap">
          {item.text || 'The agent stopped with an error.'}
        </span>
        {onRetry ? (
          <Button
            size="sm"
            variant="secondary"
            icon="rotate-ccw"
            onClick={onRetry}
          >
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  const parts = [
    item.durationMs !== null
      ? `Completed in ${duration(item.durationMs)}`
      : 'Completed',
    item.costUsd !== null ? `$${item.costUsd.toFixed(2)}` : null,
  ].filter(Boolean);
  return <div className="px-1.5 text-xs text-fg-4">{parts.join(' · ')}</div>;
}

type Block =
  | { kind: 'item'; item: ChatItem }
  | { kind: 'tools'; items: ToolItem[] };

function toBlocks(items: ChatItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (item.kind === 'tool' && last?.kind === 'tools') last.items.push(item);
    else if (item.kind === 'tool')
      blocks.push({ kind: 'tools', items: [item] });
    else blocks.push({ kind: 'item', item });
  }
  return blocks;
}

function WorkingIndicator({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex items-center gap-2 px-1.5 text-sm text-fg-3">
      <Icon
        name="loader-circle"
        size={14}
        className="animate-spin text-accent-text"
      />
      Working…{' '}
      <span className="font-mono text-xs text-fg-4">
        {duration(now - since)}
      </span>
    </div>
  );
}

export interface TranscriptProps {
  items: ChatItem[];
  running: boolean;
  empty: ReactNode;
  onRevert: (itemId: string) => void;
  onRespond: (itemId: string, response: PermissionResponse) => void;
  onRetry: (text: string) => void;
}

const STICK_THRESHOLD_PX = 80;

export function Transcript({
  items,
  running,
  empty,
  onRevert,
  onRespond,
  onRetry,
}: TranscriptProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const lastUser = items.findLast((item) => item.kind === 'user');
  const startedAt =
    lastUser?.kind === 'user' ? Date.parse(lastUser.at) : Date.now();
  const lastUserText = lastUser?.kind === 'user' ? lastUser.text : null;
  const lastResult = items.findLast((item) => item.kind === 'result');

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && stuck.current) element.scrollTop = element.scrollHeight;
  });

  if (!items.length && !running)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {empty}
      </div>
    );

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        const element = event.currentTarget;
        stuck.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          STICK_THRESHOLD_PX;
      }}
    >
      <div className="mx-auto flex max-w-[820px] flex-col gap-3 px-6 pt-6 pb-10">
        {toBlocks(items).map((block) => {
          if (block.kind === 'tools') {
            return (
              <ToolGroup
                key={block.items[0].id}
                items={block.items}
                running={running}
              />
            );
          }
          const { item } = block;
          switch (item.kind) {
            case 'user':
              return (
                <UserMessage
                  key={item.id}
                  item={item}
                  canRevert={!running}
                  onRevert={() => setConfirming(item.id)}
                />
              );
            case 'assistant':
              return (
                <Markdown key={item.id} text={item.text} className="px-1.5" />
              );
            case 'thinking':
              return <Thinking key={item.id} text={item.text} />;
            case 'todos':
              return <TodoCard key={item.id} todos={item.todos} />;
            case 'result':
              return (
                <ResultLine
                  key={item.id}
                  item={item}
                  onRetry={
                    !running && item === lastResult && lastUserText
                      ? () => onRetry(lastUserText)
                      : null
                  }
                />
              );
            case 'permission':
              return (
                <PermissionCard
                  key={item.id}
                  item={item}
                  onRespond={(response) => onRespond(item.id, response)}
                />
              );
            case 'notice':
              return (
                <div
                  key={item.id}
                  className="px-1.5 text-sm whitespace-pre-wrap text-fg-3"
                >
                  {item.text}
                </div>
              );
            default:
              return null;
          }
        })}
        {running ? <WorkingIndicator since={startedAt} /> : null}
      </div>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Reset chat to this message?"
        description="This removes this message and everything after it, and restores your files to how they were before it. The agent forgets the removed turns."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirming) onRevert(confirming);
                setConfirming(null);
              }}
            >
              Reset chat
            </Button>
          </>
        }
      />
    </div>
  );
}
