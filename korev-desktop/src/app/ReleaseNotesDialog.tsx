import { useEffect } from 'react';
import { Button, Dialog } from '../design-system';
import type { AppState, ReleaseInfo } from '../shared/model';
import { api } from './bridge';
import { Markdown } from './chat/Markdown';
import { reportFailure } from './ui/toast';
import { setUi, useUi } from './ui-store';

function Notes({ release }: { release: ReleaseInfo }) {
  return (
    <div className="max-h-[60vh] overflow-auto">
      <Markdown text={release.notes} />
    </div>
  );
}

function WhatsNew({ release }: { release: ReleaseInfo }) {
  const dismiss = () => void api.dismissWhatsNew();
  return (
    <Dialog
      open
      onClose={dismiss}
      title={`What's new in Korev ${release.version}`}
      footer={
        <Button variant="primary" onClick={dismiss}>
          Got it
        </Button>
      }
    >
      <Notes release={release} />
    </Dialog>
  );
}

function UpdateAvailable({ release }: { release: ReleaseInfo }) {
  const close = () => setUi({ updateOpen: false });
  return (
    <Dialog
      open
      onClose={close}
      title={`Korev ${release.version} is available`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Later
          </Button>
          <Button
            variant="primary"
            onClick={async () => reportFailure(await api.installUpdate())}
          >
            Install and restart
          </Button>
        </>
      }
    >
      <Notes release={release} />
    </Dialog>
  );
}

export function ReleaseNotesDialog({ state }: { state: AppState }) {
  const updateOpen = useUi((ui) => ui.updateOpen);
  const updateVersion = state.update?.version;
  useEffect(() => {
    if (updateVersion) setUi({ updateOpen: true });
  }, [updateVersion]);
  if (state.whatsNew) return <WhatsNew release={state.whatsNew} />;
  if (updateOpen && state.update)
    return <UpdateAvailable release={state.update} />;
  return null;
}
