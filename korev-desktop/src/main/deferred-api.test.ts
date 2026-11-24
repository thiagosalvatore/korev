import { describe, expect, it } from 'vitest';
import type { KorevApi } from '../shared/api';
import { deferredApi } from './deferred-api';

describe('deferred api', () => {
  it('holds a call until the core is ready, then answers it', async () => {
    let ready!: (api: Partial<KorevApi>) => void;
    const api = deferredApi(new Promise((resolve) => (ready = resolve)));

    const pending = api.listBranches!('repo-1');
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    ready({ listBranches: async (repoId) => [`main-of-${repoId}`] });
    await expect(pending).resolves.toEqual(['main-of-repo-1']);
  });
});
