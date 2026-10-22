import { IconButton } from '../../design-system';
import { duration, fileName } from '../../shared/format';
import { messageParts } from '../../shared/message';
import {
  AGENT_LABELS,
  isSubagentTool,
  PLAN_TOOL,
  type ChatItem,
  type ChatSession,
  type Todo,
} from '../../shared/model';
import { api } from '../bridge';
import { BASE_STYLES, downloadHtml, standalonePage } from '../standaloneHtml';
import { staticMarkdown } from './Markdown';

const STYLES = `${BASE_STYLES}
main { max-width: 760px; gap: 16px; }
header { margin-bottom: 16px; }
a { color: var(--accent); }
.md { overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p, .md ul, .md ol, .md pre, .md blockquote, .md table { margin: 0 0 10px; }
.md h1, .md h2, .md h3, .md h4 { display: block; margin: 18px 0 8px; line-height: 1.3; }
.md h1 { font-size: 18px; } .md h2 { font-size: 16px; } .md h3, .md h4 { font-size: 14px; }
.md ul, .md ol { padding-left: 22px; }
.md li { margin: 3px 0; }
.md pre, pre.detail { background: var(--inset); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; font: 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; }
.md pre code { background: none; padding: 0; font-size: inherit; }
.md blockquote { border-left: 3px solid var(--border); padding-left: 12px; color: var(--fg-2); }
.md table { display: block; overflow-x: auto; width: auto; font: inherit; }
.md th, .md td { border: 1px solid var(--border); padding: 5px 9px; text-align: left; white-space: normal; }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }
.user { align-self: flex-end; max-width: 85%; background: var(--accent-subtle); border: 1px solid var(--accent-border); border-radius: 12px; padding: 10px 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { font: 12px ui-monospace, Menlo, monospace; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; }
.agent-message .overline { margin-top: 8px; }
details { margin: 0; }
details.tool { border-radius: 8px; }
details.tool + details.tool { margin-top: -12px; }
.tool summary { padding: 6px 12px; font-size: 13px; gap: 8px; }
.tool .name { font-weight: 600; flex: none; }
.tool .summary { min-width: 0; color: var(--fg-2); font: 12px ui-monospace, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool.failed .name { color: var(--del-fg); }
.tool pre.detail { margin: 0 12px 12px; max-height: 480px; }
.subagent { margin-left: 24px; }
.line-add { display: block; background: var(--add-bg); color: var(--add-fg); }
.line-del { display: block; background: var(--del-bg); color: var(--del-fg); }
.plan > summary { font-weight: 600; }
.plan > .md { padding: 0 16px 16px; }
.todos ul { list-style: none; padding: 0; margin: 0; }
.todos .completed { color: var(--fg-3); text-decoration: line-through; }
.todos .in_progress { color: var(--accent); }
.note { color: var(--fg-3); font-size: 12px; }
.error { color: var(--del-fg); background: var(--del-bg); border-radius: 8px; padding: 8px 12px; font-size: 13px; white-space: pre-wrap; }
footer { margin-top: 24px; }
`;

const DIFF_TOOLS = new Set(['Edit']);
const DIFF_LINE_CLASSES: Record<string, string> = {
  '+ ': 'line-add',
  '- ': 'line-del',
};
const TODO_MARKS: Record<Todo['status'], string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
};
const KOREV_URL = 'https://korev.ai';

export interface ShareContext {
  repo: string;
  branch: string | null;
}

type ItemOf<Kind extends ChatItem['kind']> = Extract<ChatItem, { kind: Kind }>;

function MarkdownBlock({ text, breaks }: { text: string; breaks?: boolean }) {
  return (
    <div
      className="md"
      dangerouslySetInnerHTML={{ __html: staticMarkdown(text, breaks) }}
    />
  );
}

function PlanCard({
  title,
  markdown,
  open,
}: {
  title: string;
  markdown: string;
  open: boolean;
}) {
  return (
    <details className="plan" open={open}>
      <summary>{title}</summary>
      <MarkdownBlock text={markdown} />
    </details>
  );
}

function UserMessage({ item }: { item: ItemOf<'user'> }) {
  const { body, plans, files, agentMessages } = messageParts(item.text);
  return (
    <section className="user">
      {agentMessages.map((message, index) => (
        <div key={index} className="agent-message">
          <span className="overline">
            {message.from} · {message.type.replaceAll('_', ' ')}
          </span>
          <MarkdownBlock text={message.body} breaks />
        </div>
      ))}
      {body ? <MarkdownBlock text={body} breaks /> : null}
      {plans.map((plan, index) => (
        <PlanCard
          key={index}
          title={plan.from ? `Plan from ${plan.from}` : plan.name}
          markdown={plan.markdown}
          open={false}
        />
      ))}
      {files.length ? (
        <div className="chips">
          {files.map((file) => (
            <span key={file} className="chip">
              {fileName(file)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ToolDetail({ item }: { item: ItemOf<'tool'> }) {
  if (!DIFF_TOOLS.has(item.name))
    return <pre className="detail">{item.detail}</pre>;
  return (
    <pre className="detail">
      {item.detail.split('\n').map((line, index) => (
        <span key={index} className={DIFF_LINE_CLASSES[line.slice(0, 2)]}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

function ToolCall({ item }: { item: ItemOf<'tool'> }) {
  if (item.name === PLAN_TOOL && item.detail)
    return <PlanCard title="Plan" markdown={item.detail} open />;
  const classes = [
    'tool',
    item.failed && 'failed',
    isSubagentTool(item) && 'subagent',
  ].filter(Boolean);
  return (
    <details className={classes.join(' ')}>
      <summary>
        <span className="name">{item.name}</span>
        <span className="summary">{item.summary}</span>
      </summary>
      {item.detail ? <ToolDetail item={item} /> : null}
    </details>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  const done = todos.filter((todo) => todo.status === 'completed').length;
  return (
    <section className="card todos">
      <span className="overline">
        Todos · {done}/{todos.length}
      </span>
      <ul>
        {todos.map((todo, index) => (
          <li key={index} className={todo.status}>
            {TODO_MARKS[todo.status]} {todo.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TurnResult({ item }: { item: ItemOf<'result'> }) {
  if (!item.ok)
    return (
      <div className="error">
        {item.text || 'The agent stopped with an error.'}
      </div>
    );
  const parts = [
    item.durationMs !== null
      ? `Completed in ${duration(item.durationMs)}`
      : 'Completed',
    item.costUsd !== null ? `$${item.costUsd.toFixed(2)}` : null,
  ].filter(Boolean);
  return <div className="note">{parts.join(' · ')}</div>;
}

function ConversationItem({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return item.queued ? null : <UserMessage item={item} />;
    case 'assistant':
      return <MarkdownBlock text={item.text} />;
    case 'tool':
      return <ToolCall item={item} />;
    case 'todos':
      return <TodoList todos={item.todos} />;
    case 'result':
      return <TurnResult item={item} />;
    case 'notice':
      return <div className="note">{item.text}</div>;
    case 'permission':
      return (
        <div className="note">
          {item.tool}: {item.summary} · {item.status}
        </div>
      );
    case 'thinking':
      return null;
  }
}

function sharedOn(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en', { dateStyle: 'medium' });
}

export function ConversationDocument({
  session,
  items,
  context,
}: {
  session: ChatSession;
  items: ChatItem[];
  context: ShareContext;
}) {
  const meta = [
    AGENT_LABELS[session.agent],
    session.model,
    context.repo,
    context.branch,
    sharedOn(session.createdAt),
  ].filter(Boolean);
  return (
    <main>
      <header>
        <span className="meta">{meta.join(' · ')}</span>
        <h1>{session.title}</h1>
      </header>
      {items.map((item) => (
        <ConversationItem key={item.id} item={item} />
      ))}
      <footer>
        Shared from <a href={KOREV_URL}>Korev</a>
      </footer>
    </main>
  );
}

export function conversationHtml(
  session: ChatSession,
  items: ChatItem[],
  context: ShareContext,
): string {
  return standalonePage(
    session.title,
    STYLES,
    <ConversationDocument session={session} items={items} context={context} />,
  );
}

export async function shareConversation(
  session: ChatSession,
  context: ShareContext,
) {
  const items = await api.transcript(session.id);
  downloadHtml(
    session.title,
    'conversation',
    conversationHtml(session, items, context),
  );
}

export function ShareChatButton({
  session,
  context,
  className,
}: {
  session: ChatSession;
  context: ShareContext;
  className?: string;
}) {
  return (
    <IconButton
      icon="share"
      label="Share chat"
      size="sm"
      className={className}
      onClick={() => void shareConversation(session, context)}
    />
  );
}
