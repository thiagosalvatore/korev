import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { NewAskForm } from '../../ask/NewAskForm';
import { useAppState } from '../../hooks';

const LOADING_STYLE = { marginTop: 40 };

export default function NewAskScreen() {
  const { repoId } = useLocalSearchParams<{ repoId?: string }>();
  const state = useAppState();
  if (!state) return <ActivityIndicator style={LOADING_STYLE} />;
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
