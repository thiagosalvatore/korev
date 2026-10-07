import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { cn, Icon, IconButton } from '../../design-system';
import {
  EFFORT_LEVELS,
  type AgentKind,
  type AgentModel,
} from '../../shared/model';
import { api } from '../bridge';
import { fileName } from '../format';
import { Menu } from '../ui/Menu';
import { reportFailure } from '../ui/toast';
import type { DiffComment } from '../ui-store';

const DRAFT_PREFIX = 'korev:draft:';
const SUGGESTION_LIMIT = 8;
const MAX_TEXTAREA_PX = 320;
const TOKEN_BEFORE_CARET = /(^|\s)([@/])([^\s@]*)$/;

export function loadDraft(key: string): string {
  return localStorage.getItem(DRAFT_PREFIX + key) ?? '';
}

export function saveDraft(key: string, text: string) {
  if (text) localStorage.setItem(DRAFT_PREFIX + key, text);
  else localStorage.removeItem(DRAFT_PREFIX + key);
}

export function fuzzyRank(
  query: string,
  candidates: string[],
  limit = SUGGESTION_LIMIT,
): string[] {
  const needle = query.toLowerCase();
  const scored: [number, string][] = [];
  for (const candidate of candidates) {
    const haystack = candidate.toLowerCase();
    let position = 0;
    let gaps = 0;
    for (const char of needle) {
      const found = haystack.indexOf(char, position);
      if (found === -1) {
        position = -1;
        break;
      }
      gaps += found - position;
      position = found + 1;
    }
    if (position === -1) continue;
    const nameBonus = fileName(haystack).startsWith(needle) ? -1000 : 0;
    scored.push([nameBonus + gaps * 2 + candidate.length, candidate]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, candidate]) => candidate);
}

export function formatComments(comments: DiffComment[]): string {
  if (!comments.length) return '';
  const lines = comments.map(
    (comment) =>
      `- ${comment.file}:${comment.line} \`${comment.code.trim()}\`\n  ${comment.body}`,
  );
  return `\n\nReview comments on the diff:\n${lines.join('\n')}`;
}

function formatAttachments(paths: string[]): string {
  if (!paths.length) return '';
  return `\n\nAttached files (read them):\n${paths.map((file) => `- ${file}`).join('\n')}`;
}

interface Suggestions {
  trigger: '@' | '/';
  start: number;
  options: string[];
  selected: number;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface ComposerProps {
  draftKey: string;
  agent: AgentKind;
  models: AgentModel[];
  model: string;
  effort: string;
  planMode: boolean;
  running: boolean;
  workspaceId: string | null;
  comments?: DiffComment[];
  placeholder?: string;
  autoFocus?: boolean;
  onModelChange(model: string): void;
  onEffortChange(effort: string): void;
  onPlanModeChange(planMode: boolean): void;
  onSend(text: string): Promise<boolean>;
  onStop?(): void;
  onClearComments?(): void;
}

export function Composer(props: ComposerProps) {
  const { draftKey, workspaceId, running, planMode, comments = [] } = props;
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [attachments, setAttachments] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const files = useRef<string[] | null>(null);
  const commands = useRef<string[] | null>(null);

  useEffect(() => {
    setText(loadDraft(draftKey));
    setAttachments([]);
    files.current = null;
    commands.current = null;
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

  async function candidates(trigger: '@' | '/'): Promise<string[]> {
    if (!workspaceId) return [];
    if (trigger === '@') {
      files.current ??= await api.listFiles(workspaceId).catch(() => []);
      return files.current;
    }
    commands.current ??= await api.slashCommands(workspaceId).catch(() => []);
    return commands.current;
  }

  async function refreshSuggestions(value: string, caret: number) {
    const match = TOKEN_BEFORE_CARET.exec(value.slice(0, caret));
    if (!match) {
      setSuggestions(null);
      return;
    }
    const trigger = match[2] as '@' | '/';
    const query = match[3];
    const options = fuzzyRank(query, await candidates(trigger));
    setSuggestions(
      options.length
        ? { trigger, start: caret - query.length - 1, options, selected: 0 }
        : null,
    );
  }

  function accept(option: string) {
    if (!suggestions || !input.current) return;
    const caret = input.current.selectionStart;
    const inserted = `${suggestions.trigger}${option} `;
    const next =
      text.slice(0, suggestions.start) + inserted + text.slice(caret);
    update(next);
    setSuggestions(null);
    const position = suggestions.start + inserted.length;
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(position, position),
    );
  }

  async function addFiles(list: FileList | File[]) {
    if (!workspaceId) return;
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

  async function send() {
    const body = text.trim();
    if ((!body && !comments.length) || sending || running) return;
    setSending(true);
    const message =
      body + formatComments(comments) + formatAttachments(attachments);
    const sent = await props.onSend(message);
    setSending(false);
    if (!sent) return;
    update('');
    setAttachments([]);
    props.onClearComments?.();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const count = suggestions.options.length;
        setSuggestions({
          ...suggestions,
          selected: (suggestions.selected + step + count) % count,
        });
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        accept(suggestions.options[suggestions.selected]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggestions(null);
        return;
      }
    }
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      props.onPlanModeChange(!planMode);
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
    if (!event.clipboardData.files.length || !workspaceId) return;
    event.preventDefault();
    void addFiles(event.clipboardData.files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.files.length || !workspaceId) return;
    event.preventDefault();
    void addFiles(event.dataTransfer.files);
  }

  const modelLabel =
    props.models.find((entry) => entry.id === props.model)?.label ??
    props.model;
  const picker = useRef<HTMLInputElement>(null);

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
              key={option}
              type="button"
              role="option"
              aria-selected={index === suggestions.selected}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left font-mono text-xs text-fg-2 aria-selected:bg-active aria-selected:text-fg-1"
              onMouseDown={(event) => {
                event.preventDefault();
                accept(option);
              }}
            >
              <Icon
                name={suggestions.trigger === '@' ? 'file' : 'slash'}
                size={13}
                className="text-fg-3"
              />
              <span className="truncate">{option}</span>
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
        {attachments.length || comments.length ? (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
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
          </div>
        ) : null}
        <textarea
          ref={input}
          data-composer
          aria-label="Message"
          rows={2}
          value={text}
          placeholder={
            props.placeholder ??
            'Ask to make changes, @mention files, run /commands'
          }
          className="block max-h-80 min-h-14 w-full resize-none border-0 bg-transparent focus-visible:shadow-none px-3.5 pt-3 pb-1 font-sans text-md text-fg-1 outline-none placeholder:text-fg-4"
          onChange={(event) => {
            update(event.target.value);
            void refreshSuggestions(
              event.target.value,
              event.target.selectionStart,
            );
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => setTimeout(() => setSuggestions(null), 100)}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <Menu
            label="Composer options"
            side="top"
            items={[
              ...(workspaceId
                ? [
                    {
                      id: 'attach',
                      label: 'Add attachment',
                      icon: 'paperclip' as const,
                      hint: '⌘U',
                      onSelect: () => picker.current?.click(),
                    },
                  ]
                : []),
              {
                id: 'plan',
                label: 'Plan mode',
                icon: 'list-checks',
                hint: '⇧Tab',
                checked: planMode,
                onSelect: () => props.onPlanModeChange(!planMode),
              },
            ]}
            trigger={({ toggle }) => (
              <IconButton
                icon="plus"
                label="More options"
                size="sm"
                onClick={toggle}
              />
            )}
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
          <Menu
            label="Model"
            side="top"
            items={props.models.map((entry) => ({
              id: entry.id,
              label: entry.label,
              checked: entry.id === props.model,
              onSelect: () => props.onModelChange(entry.id),
            }))}
            trigger={({ toggle }) => (
              <button
                type="button"
                aria-label="Model"
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-2 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg-1"
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
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-2 text-xs text-fg-3 hover:bg-hover hover:text-fg-1"
                onClick={toggle}
              >
                <Icon name="brain" size={13} />
                {props.effort}
              </button>
            )}
          />
          {planMode ? (
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
          {running ? (
            <button
              type="button"
              aria-label="Stop agent"
              title="Stop (⌘⇧⌫)"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-fg-1 text-app"
              onClick={props.onStop}
            >
              <Icon name="square" size={11} className="fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send"
              disabled={(!text.trim() && !comments.length) || sending}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-accent text-fg-on-accent disabled:cursor-default disabled:bg-active disabled:text-fg-4"
              onClick={() => void send()}
            >
              <Icon name="arrow-up" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
