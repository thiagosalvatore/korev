import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionPanel } from './QuestionPanel';

afterEach(cleanup);

describe('QuestionPanel', () => {
  it('renders the question as markdown with its line breaks', () => {
    render(
      <QuestionPanel
        questions={[
          {
            question: 'First line\nSecond **bold**',
            header: 'Q',
            options: [{ label: 'Yes', description: '' }],
            multiSelect: false,
          },
        ]}
        picks={{}}
        onPick={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    const group = screen.getByRole('group', { name: /First line/ });
    expect(group.querySelector('br')).not.toBeNull();
    expect(group.querySelector('strong')?.textContent).toBe('bold');
  });
});
