import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { InboxSnapshot } from '../shared/inbox';
import { KorevStage } from './ai/KorevStage';
import { KorevAiProvider, useKorevAi } from './ai/useKorevAi';

interface ListProps {
  snapshot: InboxSnapshot | null;
  onOpenSettings: () => void;
}

function KorevAiRoot({ list }: { list: ReactElement<ListProps> }) {
  const ai = useKorevAi(list.props.snapshot, list.props.onOpenSettings);
  return (
    <KorevAiProvider value={ai}>
      <KorevStage>{list}</KorevStage>
    </KorevAiProvider>
  );
}

export function renderList(list: ReactElement<ListProps>) {
  const utils = render(<KorevAiRoot list={list} />);
  return {
    ...utils,
    rerender: (next: ReactElement<ListProps>) =>
      utils.rerender(<KorevAiRoot list={next} />),
  };
}
