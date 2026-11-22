import { describe, expect, it } from 'vitest';
import type { AppState } from '../../korev-desktop/src/shared/model';
import { demoWorld } from './demoContent';
import { homeSections } from './inbox';

const NOW = Date.parse('2026-11-22T12:00:00Z');

function sectionNames(state: AppState) {
  return homeSections(state).map((section) => ({
    id: section.id,
    names: section.entries.map((entry) => entry.workspace.name),
  }));
}

function statusOf(state: AppState, name: string) {
  return homeSections(state)
    .flatMap((section) => section.entries)
    .filter((entry) => entry.workspace.name === name)
    .map((entry) => entry.status);
}

describe('homeSections', () => {
  const { state } = demoWorld(NOW);

  it('puts each workspace in the section of what it needs next', () => {
    expect(sectionNames(state)).toEqual([
      { id: 'needs-you', names: ['Add billing page', 'Fix flaky checkout'] },
      { id: 'working', names: ['Fix login redirect'] },
      { id: 'ready', names: ['Speed up search'] },
      {
        id: 'other',
        names: [
          'Session refresh',
          'Session refresh',
          'Dark mode settings',
          'Onboarding copy',
          'Webhook retries',
        ],
      },
    ]);
  });

  it('describes each workspace in one status line', () => {
    expect(statusOf(state, 'Add billing page')).toEqual(['Needs your answer']);
    expect(statusOf(state, 'Fix flaky checkout')).toEqual([
      'Checks failing · #90',
    ]);
    expect(statusOf(state, 'Fix login redirect')).toEqual(['Working']);
    expect(statusOf(state, 'Speed up search')).toEqual([
      'Ready to merge · #87',
    ]);
    expect(statusOf(state, 'Onboarding copy')).toEqual(['Merged · #79']);
    expect(statusOf(state, 'Session refresh')).toEqual([
      'session-refresh',
      'Waits for the plan in acme-web',
    ]);
  });

  it('leaves out a section with no workspaces', () => {
    const quiet: AppState = {
      ...state,
      workspaces: state.workspaces.filter(
        (workspace) => workspace.name === 'Dark mode settings',
      ),
    };
    expect(sectionNames(quiet)).toEqual([
      { id: 'other', names: ['Dark mode settings'] },
    ]);
  });
});
