import { describe, expect, it } from 'vitest';
import type { ChatItem } from '../../../korev-desktop/src/shared/model';
import {
  activityLabel,
  foldActivity,
  type ActivityRow,
  type ToolItem,
} from './activity';

const AT = '2026-11-22T12:00:00.000Z';

function tool(
  id: string,
  name: string,
  summary: string,
  output: string | null = 'ok',
): ToolItem {
  return { id, kind: 'tool', name, summary, detail: '', output, failed: false };
}

const user: ChatItem = {
  id: 'u1',
  kind: 'user',
  text: 'Fix it',
  at: AT,
  checkpoint: null,
};
const reply: ChatItem = { id: 'a1', kind: 'assistant', text: 'Done.' };
const thinking: ChatItem = { id: 'th1', kind: 'thinking', text: 'Hmm' };
const todos: ChatItem = {
  id: 'td1',
  kind: 'todos',
  todos: [{ text: 'Find the bug', status: 'completed' }],
};
const laterTodos: ChatItem = {
  id: 'td2',
  kind: 'todos',
  todos: [
    { text: 'Find the bug', status: 'completed' },
    { text: 'Add a test', status: 'in_progress' },
  ],
};

function activity(rows: ReturnType<typeof foldActivity>): ActivityRow[] {
  return rows.filter((row) => row.kind === 'activity');
}

describe('foldActivity', () => {
  it('folds the tools, thinking and todos between two messages into one row', () => {
    const rows = foldActivity([
      user,
      thinking,
      tool('t1', 'Grep', 'returnTo'),
      todos,
      tool('t2', 'Read', 'src/auth/state.ts'),
      reply,
    ]);
    expect(rows.map((row) => row.kind)).toEqual(['item', 'activity', 'item']);
    expect(activity(rows)[0]).toMatchObject({
      id: 'th1',
      tools: [{ id: 't1' }, { id: 't2' }],
      thinking: ['Hmm'],
      todos: todos.todos,
    });
  });

  it('keeps only the latest todo list of a run', () => {
    const [row] = activity(
      foldActivity([todos, tool('t1', 'Bash', 'npm test'), laterTodos]),
    );
    expect(row.todos).toEqual(laterTodos.todos);
  });

  it('starts a new run after a message', () => {
    const rows = foldActivity([
      tool('t1', 'Read', 'a.ts'),
      reply,
      tool('t2', 'Read', 'b.ts'),
    ]);
    expect(activity(rows).map((row) => row.id)).toEqual(['t1', 't2']);
  });

  it('leaves subagent tools out of the run', () => {
    const subagent: ChatItem = {
      ...tool('t2', 'Read', 'x.ts'),
      parentToolId: 't1',
    };
    const [row] = activity(
      foldActivity([tool('t1', 'Task', 'Explore'), subagent]),
    );
    expect(row.tools.map((item) => item.id)).toEqual(['t1']);
  });
});

describe('activityLabel', () => {
  const [run] = activity(
    foldActivity([
      tool('t1', 'Grep', 'returnTo'),
      tool('t2', 'Read', 'src/auth/callback.ts'),
      tool('t3', 'Read', 'src/auth/state.ts'),
    ]),
  );

  it('sums up a finished run by what the agent did', () => {
    expect(activityLabel(run, false)).toBe('Explored 3 files');
    const [mixed] = activity(
      foldActivity([
        tool('t1', 'Read', 'a.ts'),
        tool('t2', 'Edit', 'a.ts'),
        tool('t3', 'Edit', 'a.ts'),
        tool('t4', 'Bash', 'npm test'),
        tool('t5', 'Bash', 'npm run lint'),
      ]),
    );
    expect(activityLabel(mixed, false)).toBe(
      'Explored 1 file, edited 1 file, ran 2 commands',
    );
  });

  it('names the step in progress while the agent runs', () => {
    const [editing] = activity(
      foldActivity([
        tool('t1', 'Read', 'a.ts'),
        tool('t2', 'Edit', 'src/auth/state.ts', null),
      ]),
    );
    expect(activityLabel(editing, true)).toBe('Editing state.ts');
    expect(activityLabel(run, true)).toBe('Reading state.ts');
  });

  it('says the agent thought when a run has no tools', () => {
    const [thought] = activity(foldActivity([thinking]));
    expect(activityLabel(thought, false)).toBe('Thought');
    expect(activityLabel(thought, true)).toBe('Thinking');
  });
});
