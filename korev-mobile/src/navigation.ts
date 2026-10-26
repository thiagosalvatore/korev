import { router } from 'expo-router';

export function openNewWorkspace(repoId?: string) {
  router.push({ pathname: '/new', params: repoId ? { repoId } : {} });
}

export function openNewAsk() {
  router.push('/ask/new');
}

export function openExplainPullRequest() {
  router.push('/ask/explain');
}

export function openWorkspace(id: string) {
  router.push({ pathname: '/workspace/[id]', params: { id } });
}
