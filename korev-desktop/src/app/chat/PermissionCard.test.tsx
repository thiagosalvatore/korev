import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionCard, PlanReview } from './PermissionCard';

afterEach(cleanup);

beforeEach(() => {
  window.korev = {
    call: vi.fn(async () => null),
    on: () => () => {},
  } as unknown as Window['korev'];
});

function renderReview() {
  const onKeepPlanning = vi.fn();
  render(
    <PlanReview
      plan="# The plan"
      showPlan
      onApprove={vi.fn()}
      onKeepPlanning={onKeepPlanning}
    />,
  );
  return {
    onKeepPlanning,
    feedback: screen.getByRole('textbox', { name: 'Feedback on the plan' }),
  };
}

describe('PlanReview feedback', () => {
  it('sends the feedback on Enter', () => {
    const { onKeepPlanning, feedback } = renderReview();

    fireEvent.change(feedback, { target: { value: 'Split step 2' } });
    fireEvent.keyDown(feedback, { key: 'Enter' });

    expect(onKeepPlanning).toHaveBeenCalledWith('Split step 2');
  });

  it('keeps Shift+Enter for a new line', () => {
    const { onKeepPlanning, feedback } = renderReview();

    fireEvent.change(feedback, { target: { value: 'Split step 2' } });
    fireEvent.keyDown(feedback, { key: 'Enter', shiftKey: true });

    expect(onKeepPlanning).not.toHaveBeenCalled();
  });

  it('ignores Enter while the feedback is empty', () => {
    const { onKeepPlanning, feedback } = renderReview();

    fireEvent.keyDown(feedback, { key: 'Enter' });

    expect(onKeepPlanning).not.toHaveBeenCalled();
  });
});

describe('PlanReview lanes across repositories', () => {
  const plan = [
    '## Lanes',
    '### korev-desktop',
    'UI.',
    '### API',
    'Endpoint.',
  ].join('\n');
  const repos = [
    { id: 'desktop', name: 'korev-desktop' },
    { id: 'api', name: 'korev-api' },
    { id: 'docs', name: 'docs' },
  ];

  function renderLanes() {
    const onApprove = vi.fn();
    render(
      <PlanReview
        plan={plan}
        showPlan={false}
        laneRepos={repos}
        onApprove={onApprove}
        onKeepPlanning={vi.fn()}
      />,
    );
    return onApprove;
  }

  it('splits each lane off to the repository it names', () => {
    const onApprove = renderLanes();

    fireEvent.click(screen.getByRole('button', { name: /split off 1 lane/ }));

    expect(onApprove).toHaveBeenCalledWith([
      { name: 'API', body: 'Endpoint.', repoId: 'api' },
    ]);
  });

  it('splits off a single lane that belongs to another repository', () => {
    const onApprove = vi.fn();
    render(
      <PlanReview
        plan={['## Lanes', '### API', 'Endpoint.'].join('\n')}
        showPlan={false}
        laneRepos={repos}
        onApprove={onApprove}
        onKeepPlanning={vi.fn()}
      />,
    );

    expect(screen.queryByText(/This workspace/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /split off 1 lane/ }));

    expect(onApprove).toHaveBeenCalledWith([
      { name: 'API', body: 'Endpoint.', repoId: 'api' },
    ]);
  });

  it('keeps the lane of its own repository here wherever it is listed', () => {
    const onApprove = vi.fn();
    render(
      <PlanReview
        plan={[
          '## Lanes',
          '### API',
          'Endpoint.',
          '### korev-desktop',
          'UI.',
        ].join('\n')}
        showPlan={false}
        laneRepos={repos}
        onApprove={onApprove}
        onKeepPlanning={vi.fn()}
      />,
    );

    expect(screen.getByText('This workspace · korev-desktop')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /split off 1 lane/ }));

    expect(onApprove).toHaveBeenCalledWith([
      { name: 'API', body: 'Endpoint.', repoId: 'api' },
    ]);
  });

  it('splits a lane off to the repository the user picks', () => {
    const onApprove = renderLanes();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Repository for API' }),
      { target: { value: 'docs' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /split off 1 lane/ }));

    expect(onApprove).toHaveBeenCalledWith([
      { name: 'API', body: 'Endpoint.', repoId: 'docs' },
    ]);
  });
});

describe('PermissionCard after a plan is resolved', () => {
  it('opens the approved plan', () => {
    render(
      <PermissionCard
        item={{
          id: 'plan-1',
          kind: 'permission',
          tool: 'ExitPlanMode',
          summary: 'Ship it',
          detail: '',
          questions: null,
          plan: '# Ship it\n\nStep one.',
          status: 'allowed',
        }}
        onRespond={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Plan/ }));

    expect(screen.getByRole('dialog').textContent).toContain('Step one.');
  });
});
