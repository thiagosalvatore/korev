import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAN_TOOL, type ChatItem } from '../../shared/model';
import { TabContextPicker } from './TabContextPicker';

afterEach(cleanup);

const planning: ChatItem[] = [
  {
    id: 'u1',
    kind: 'user',
    text: 'plan the login page',
    at: '',
    checkpoint: null,
  },
  {
    id: 't1',
    kind: 'tool',
    name: PLAN_TOOL,
    summary: '',
    detail: '1. Add a form',
    output: null,
    failed: false,
  },
];

const chatting: ChatItem[] = [
  {
    id: 'u2',
    kind: 'user',
    text: 'what is this repo?',
    at: '',
    checkpoint: null,
  },
  { id: 'a2', kind: 'assistant', text: 'A Mac app.' },
];

function stubApi() {
  const transcripts: Record<string, ChatItem[]> = {
    login: planning,
    question: chatting,
    empty: [],
  };
  const call = vi.fn(async (method: string, args: unknown[]) => {
    if (method === 'transcript') return transcripts[args[0] as string];
    if (method === 'saveAttachment')
      return { ok: true, value: `.context/attachments/${args[1] as string}` };
    throw new Error(`unexpected ${method}`);
  });
  window.korev = { call, on: () => () => {} } as unknown as Window['korev'];
  return call;
}

function renderPicker(onPick = vi.fn()) {
  render(
    <TabContextPicker
      workspaceId="w1"
      tabs={[
        { id: 'login', title: 'Login plan' },
        { id: 'question', title: 'Repo question' },
        { id: 'empty', title: 'New chat' },
      ]}
      onPick={onPick}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Add context from a tab' }),
  );
  return onPick;
}

describe('TabContextPicker', () => {
  it('offers a plan only for tabs that have one and skips empty tabs', async () => {
    stubApi();
    renderPicker();

    await waitFor(() =>
      screen.getByRole('menuitem', { name: /Repo question/ }),
    );
    const labels = screen
      .getAllByRole('menuitem')
      .map((item) => item.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Plan from Login plan',
      'Chat transcript of Login plan',
      'Chat transcript of Repo question',
    ]);
  });

  it('adds the plan text inline', async () => {
    stubApi();
    const onPick = renderPicker();

    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Plan from Login plan' }),
    );

    expect(onPick).toHaveBeenCalledWith({
      key: 'plan:login',
      kind: 'plan',
      tabTitle: 'Login plan',
      prompt: '<plan from="Login plan">\n1. Add a form\n</plan>',
    });
  });

  it('saves the transcript to a file and points the agent at it', async () => {
    const call = stubApi();
    const onPick = renderPicker();

    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Chat transcript of Repo question',
      }),
    );

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    const [, [, name, base64]] = call.mock.calls.find(
      ([method]) => method === 'saveAttachment',
    ) as [string, [string, string, string]];
    expect(name).toBe('transcript-Repo question.md');
    expect(atob(base64)).toContain(
      'User: what is this repo?\n\nAssistant: A Mac app.',
    );
    expect(onPick).toHaveBeenCalledWith({
      key: 'transcript:question',
      kind: 'transcript',
      tabTitle: 'Repo question',
      prompt:
        'Chat transcript of the "Repo question" tab (read it): .context/attachments/transcript-Repo question.md',
    });
  });
});
