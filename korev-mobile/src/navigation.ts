import { router } from 'expo-router';

export function openNewWorkspace(repoId?: string) {
  router.push({ pathname: '/new', params: repoId ? { repoId } : {} });
}

export function openNewAsk() {
  router.push('/ask/new');
}
