import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { cn, Icon } from '../../design-system';
import {
  EFFORT_LEVELS,
  LOADOUT_SIZE,
  PENDING_PLAN_PLACEHOLDER,
  type AgentKind,
  type ModelChoice,
  type PendingPlan,
  type Snippet,
  type TurnUsage,
} from '../../shared/model';
import {
  formatAttachments,
  planFileName,
  TAB_CONTEXT_HEADER,
} from '../../shared/message';
import { api } from '../bridge';
import { fileName } from '../../shared/format';
import { reportFailure } from '../ui/toast';
import type { DiffComment } from '../ui-store';
import { readAsBase64 } from './attachments';
import { ComposerToolbar } from './ComposerToolbar';
import { PlanChip } from './PlanChip';
import {
  applySuggestion,
  createSuggestionLoader,
  snippetSuggestions,
  type Suggestions,
  type SuggestionTrigger,
} from './suggestions';
import {
  TabContextPicker,
  type ContextTab,
  type TabContext,
  type TabContextKind,
} from './TabContextPicker';

const DRAFT_PREFIX = 'korev:draft:';
const MAX_TEXTAREA_PX = 320;
const SUGGESTION_ICONS: Record<
  SuggestionTrigger,
  'file' | 'slash' | 'git-pull-request' | 'text-quote'
> = {
  '@': 'file',
  '/': 'slash',
  '#': 'git-pull-request',
  snippet: 'text-quote',
};
const TAB_CONTEXT_LABELS: Record<TabContextKind, string> = {
  plan: 'Plan',
  transcript: 'Transcript',
};
const TAB_CONTEXT_ICONS: Record<
  TabContextKind,
  'list-checks' | 'message-square'
> = {
  plan: 'list-checks',
  transcript: 'message-square',
};

export function loadDraft(key: string): string {
  return localStorage.getItem(DRAFT_PREFIX + key) ?? '';
}

export function saveDraft(key: string, text: string) {
  if (text) localStorage.setItem(DRAFT_PREFIX + key, text);
  else localStorage.removeItem(DRAFT_PREFIX + key);
}

export function formatComments(comments: DiffComment[]): string {
  if (!comments.length) return '';
  const lines = comments.map(
    (comment) =>
      `- ${comment.file}:${comment.line} \`${comment.code.trim()}\`\n  ${comment.body}`,
  );
  return `\n\nReview comments on the diff:\n${lines.join('\n')}`;
}

function formatTabContext(contexts: TabContext[]): string {
  if (!contexts.length) return '';
  return `\n\n${TAB_CONTEXT_HEADER}\n\n${contexts.map((context) => context.prompt).join('\n\n')}`;
}

function nextEffort(agent: AgentKind, effort: string): string {
  const levels = EFFORT_LEVELS[agent];
  return levels[(levels.indexOf(effort) + 1) % levels.length];
}

export interface ComposerProps {
  draftKey: string;
  agent: AgentKind;
  models: ModelChoice[];
  loadout: ModelChoice[];
  snippets: Snippet[];
  model: string;
  effort: string;
  fast: boolean;
  planMode: boolean;
  running: boolean;
  workspaceId: string | null;
  repoId: string | null;
  comments?: DiffComment[];
  otherTabs?: ContextTab[];
  pendingPlan?: PendingPlan;
  placeholder?: string;
  autoFocus?: boolean;
  usage?: TurnUsage;
  onModelChange(choice: ModelChoice): void;
  onEffortChange(effort: string): void;
  onFastChange(fast: boolean): void;
  onPlanModeChange(planMode: boolean): void;
  onSend(text: string): Promise<boolean>;
  onStop?(): void;
  onClearComments?(): void;
  onDiscardPendingPlan?(): void;
}

export function Composer(props: ComposerProps) {
  const {
    draftKey,
    workspaceId,
    repoId,
    running,
    planMode,
    comments = [],
    otherTabs = [],
    pendingPlan,
  } = props;
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [attachments, setAttachments] = useState<string[]>([]);
  const [tabContext, setTabContext] = useState<TabContext[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const loader = useMemo(
    () => createSuggestionLoader({ workspaceId, repoId }),
    [workspaceId, repoId],
  );

  useEffect(() => {
    setText(loadDraft(draftKey));
    setAttachments([]);
    setTabContext([]);
  }, [draftKey]);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [text]);

  useEffect(() => {
    if (props.autoFocus) input.current?.focus();
  }, [props.autoFocus, draftKey]);

  function update(next: string) {
    setText(next);
    saveDraft(draftKey, next);
  }

  function accept(index: number) {
    const option = suggestions?.options[index];
    if (!suggestions || !option) return;
    const applied = applySuggestion(text, suggestions, option);
    update(applied.text);
    setSuggestions(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(applied.caret, applied.caret);
    });
  }

  async function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const saved = await api.saveAttachment(
        workspaceId,
        file.name || 'pasted.png',
        await readAsBase64(file),
      );
      if (reportFailure(saved))
        setAttachments((current) => [...current, saved.value]);
    }
  }

  function addTabContext(context: TabContext) {
    setTabContext((current) =>
      current.some((entry) => entry.key === context.key)
        ? current
        : [...current, context],
    );
  }

  const canSend =
    Boolean(
      text.trim() || comments.length || tabContext.length || pendingPlan,
    ) && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const message =
      text.trim() +
      formatComments(comments) +
      formatAttachments(attachments) +
      formatTabContext(tabContext);
    const sent = await props.onSend(message);
    setSending(false);
    if (!sent) return;
    update('');
    setAttachments([]);
    setTabContext([]);
    props.onClearComments?.();
  }

  function openSnippets() {
    setSuggestions(
      snippetSuggestions(
        props.snippets,
        input.current?.selectionStart ?? text.length,
      ),
    );
  }

  function onSuggestionKey(
    event: KeyboardEvent<HTMLTextAreaElement>,
    open: Suggestions,
  ): boolean {
    const count = open.options.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSuggestions({
        ...open,
        selected: (open.selected + step + count) % count,
      });
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      accept(open.selected);
      return true;
    }
    if (event.key === 'Escape') {
      setSuggestions(null);
      return true;
    }
    return false;
  }

  function onShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Tab' && event.shiftKey)
      props.onPlanModeChange(!planMode);
    else if (command && event.shiftKey && key === 'e')
      props.onFastChange(!props.fast);
    else if (command && event.shiftKey && (key === '/' || key === '?'))
      props.onEffortChange(nextEffort(props.agent, props.effort));
    else if (command && key === 'u') picker.current?.click();
    else if (command && key === ';') openSnippets();
    else if (event.metaKey && event.ctrlKey && /^[1-5]$/.test(event.key)) {
      const entry = props.loadout[Number(event.key) - 1];
      if (entry) props.onModelChange(entry);
    } else return false;
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions && onSuggestionKey(event, suggestions)) {
      event.preventDefault();
      return;
    }
    if (onShortcut(event)) {
      event.preventDefault();
      return;
    }
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!event.clipboardData.files.length) return;
    event.preventDefault();
    void addFiles(event.clipboardData.files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
  }

  return (
    <div
      className="relative"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {suggestions ? (
        <div
          role="listbox"
          aria-label="Suggestions"
          className="absolute bottom-[calc(100%+6px)] left-0 z-40 w-full max-w-xl overflow-hidden rounded-md bg-raised p-1 shadow-pop"
        >
          {suggestions.options.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              type="button"
              role="option"
              aria-selected={index === suggestions.selected}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left font-mono text-xs text-fg-2 aria-selected:bg-active aria-selected:text-fg-1"
              onMouseDown={(event) => {
                event.preventDefault();
                accept(index);
              }}
            >
              <Icon
                name={SUGGESTION_ICONS[suggestions.trigger]}
                size={13}
                className="text-fg-3"
              />
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          'rounded-xl border bg-raised shadow-1 transition-colors focus-within:border-border-strong',
          planMode ? 'border-dashed border-accent-border' : 'border-border-2',
        )}
      >
        {attachments.length ||
        comments.length ||
        tabContext.length ||
        pendingPlan ? (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {pendingPlan ? (
              <span className="inline-flex h-6 max-w-72 items-center gap-1.5 rounded-sm bg-accent-subtle px-2 text-xs text-accent-text">
                <PlanChip
                  name={planFileName(pendingPlan.plan)}
                  markdown={pendingPlan.plan}
                  className="flex min-w-0 items-center gap-1.5 border-0 bg-transparent p-0 text-accent-text"
                >
                  <Icon name="list-checks" size={12} />
                  <span className="truncate">Plan · {pendingPlan.from}</span>
                </PlanChip>
                <button
                  type="button"
                  aria-label="Remove the handed-off plan"
                  className="cursor-pointer border-0 bg-transparent p-0 text-accent-text"
                  onClick={props.onDiscardPendingPlan}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {comments.length ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-accent-subtle px-2 text-xs text-accent-text">
                <Icon name="message-square" size={12} />
                {comments.length} diff comment{comments.length === 1 ? '' : 's'}
                <button
                  type="button"
                  aria-label="Remove comments"
                  className="cursor-pointer border-0 bg-transparent p-0 text-accent-text"
                  onClick={props.onClearComments}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {attachments.map((file) => (
              <span
                key={file}
                className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-active px-2 text-xs text-fg-2"
              >
                <Icon name="paperclip" size={12} />
                {fileName(file)}
                <button
                  type="button"
                  aria-label={`Remove ${fileName(file)}`}
                  className="cursor-pointer border-0 bg-transparent p-0 text-fg-3"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((entry) => entry !== file),
                    )
                  }
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            {tabContext.map((context) => {
              const label = `${TAB_CONTEXT_LABELS[context.kind]} · ${context.tabTitle}`;
              return (
                <span
                  key={context.key}
                  className="inline-flex h-6 max-w-72 items-center gap-1.5 rounded-sm bg-accent-subtle px-2 text-xs text-accent-text"
                >
                  <Icon name={TAB_CONTEXT_ICONS[context.kind]} size={12} />
                  <span className="truncate">{label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-accent-text"
                    onClick={() =>
                      setTabContext((current) =>
                        current.filter((entry) => entry.key !== context.key),
                      )
                    }
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
        <textarea
          ref={input}
          data-composer
          aria-label="Message"
          rows={2}
          value={text}
          placeholder={
            (pendingPlan ? PENDING_PLAN_PLACEHOLDER : props.placeholder) ??
            'Ask to make changes, @mention files, #PRs, run /commands'
          }
          className="block max-h-80 min-h-14 w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 font-sans text-md text-fg-1 outline-none placeholder:text-fg-4 focus-visible:shadow-none"
          onChange={(event) => {
            update(event.target.value);
            void loader
              .suggest(event.target.value, event.target.selectionStart)
              .then(setSuggestions);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setSuggestions(null), 100)}
        />
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) =>
            event.target.files && void addFiles(event.target.files)
          }
        />
        <ComposerToolbar
          agent={props.agent}
          models={props.models}
          loadout={props.loadout.slice(0, LOADOUT_SIZE)}
          model={props.model}
          effort={props.effort}
          fast={props.fast}
          planMode={planMode}
          hasSnippets={props.snippets.length > 0}
          running={running}
          canSend={canSend}
          usage={props.usage}
          contextPicker={
            otherTabs.length ? (
              <TabContextPicker
                workspaceId={workspaceId}
                tabs={otherTabs}
                onPick={addTabContext}
              />
            ) : null
          }
          onAttach={() => picker.current?.click()}
          onInsertSnippet={openSnippets}
          onModelChange={props.onModelChange}
          onEffortChange={props.onEffortChange}
          onFastChange={props.onFastChange}
          onPlanModeChange={props.onPlanModeChange}
          onSend={() => void send()}
          onStop={props.onStop}
        />
      </div>
    </div>
  );
}
