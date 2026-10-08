import { Button, Dialog } from '../../design-system';
import type { DictationStatus } from '../../shared/model';

const PERCENT = 100;

interface VoiceModelDialogProps {
  status: DictationStatus;
  onDownload(): void;
  onStart(): void;
  onClose(): void;
}

function DownloadProgress({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Voice model download"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={PERCENT}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-2"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs text-fg-3 tabular-nums">
        {progress}%
      </span>
    </div>
  );
}

export function VoiceModelDialog({
  status,
  onDownload,
  onStart,
  onClose,
}: VoiceModelDialogProps) {
  if (status.status === 'downloading')
    return (
      <Dialog
        open
        onClose={onClose}
        title="Downloading the voice model"
        description="You can keep working. Voice input turns on when the download finishes."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Hide
          </Button>
        }
      >
        <DownloadProgress progress={status.progress} />
      </Dialog>
    );
  if (status.status === 'ready')
    return (
      <Dialog
        open
        onClose={onClose}
        title="Voice input is ready"
        description="Speech is turned into text on this Mac, offline."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" autoFocus onClick={onStart}>
              Start voice input
            </Button>
          </>
        }
      />
    );
  const failed = status.status === 'failed';
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        failed ? 'The download did not finish' : 'Download the voice model?'
      }
      description={
        failed
          ? status.error
          : 'Voice input turns speech into text on this Mac, offline. It needs a one-time 550 MB download.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" autoFocus onClick={onDownload}>
            {failed ? 'Try again' : 'Download'}
          </Button>
        </>
      }
    />
  );
}
