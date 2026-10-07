import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KorevWindow } from './KorevDemo';
import { SCENES } from './scenes';

const sceneIndex = (id: string) => SCENES.findIndex((s) => s.id === id);

function headerActionAt(scene: string, t: number) {
  const { container, unmount } = render(
    <KorevWindow sceneIndex={sceneIndex(scene)} t={t} />,
  );
  const label = container.querySelector('.km-head .kv-btn')?.textContent;
  unmount();
  return label;
}

describe('KorevWindow', () => {
  it.each([
    [500, 'Create PR'],
    [2000, 'Creating PR'],
    [4000, 'Checks running'],
    [6000, 'Fix errors'],
    [7000, 'Checks running'],
    [9000, 'Merge'],
    [10500, 'Archive'],
  ])('ship scene at %ims shows %s as the next git action', (t, label) => {
    expect(headerActionAt('ship', t)).toBe(label);
  });

  it('start scene shows the new workspace form until the workspace is created', () => {
    const { rerender } = render(
      <KorevWindow sceneIndex={sceneIndex('start')} t={2000} />,
    );
    expect(screen.getByText('New workspace', { selector: 'h4' })).toBeTruthy();
    expect(screen.queryByText('thiago/rate-limit-headers')).toBeNull();

    rerender(<KorevWindow sceneIndex={sceneIndex('start')} t={4000} />);
    expect(screen.queryByText('New workspace', { selector: 'h4' })).toBeNull();
    expect(
      screen.getAllByText('thiago/rate-limit-headers').length,
    ).toBeGreaterThan(0);
  });
});
