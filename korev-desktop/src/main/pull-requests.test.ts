import { describe, expect, it } from 'vitest';
import { parsePrStatus } from './pull-requests';

describe('PR status', () => {
  it('maps check runs and status contexts to check states', () => {
    const status = parsePrStatus(
      JSON.stringify({
        number: 7,
        url: 'https://github.com/acme/web/pull/7',
        title: 'Add login',
        state: 'OPEN',
        isDraft: false,
        mergeable: 'CONFLICTING',
        statusCheckRollup: [
          { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci/1' },
          { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci/2' },
          { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '', detailsUrl: '' },
          { __typename: 'StatusContext', context: 'deploy', state: 'ERROR', targetUrl: 'https://ci/3' },
        ],
      }),
    );
    expect(status?.mergeable).toBe('CONFLICTING');
    expect(status?.checks.map((check) => [check.name, check.state])).toEqual([
      ['lint', 'success'],
      ['test', 'failure'],
      ['e2e', 'pending'],
      ['deploy', 'failure'],
    ]);
  });

  it('returns null when there is no PR', () => {
    expect(parsePrStatus('no pull requests found')).toBeNull();
  });
});
