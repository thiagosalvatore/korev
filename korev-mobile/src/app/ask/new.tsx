import { router, useLocalSearchParams } from 'expo-router';
import { NewAskForm } from '../../ask/NewAskForm';
import { useAppState } from '../../hooks';
import { Loading } from '../../Offline';

const LOADING_STYLE = { marginTop: 40 };

export default function NewAskScreen() {
  const { repoId } = useLocalSearchParams<{ repoId?: string }>();
  const state = useAppState();
  if (!state) return <Loading style={LOADING_STYLE} />;
  return (
    <NewAskForm
      state={state}
      initialRepoId={repoId}
      onAsked={(ask) =>
        router.replace({ pathname: '/ask/[id]', params: { id: ask.id } })
      }
    />
  );
}
