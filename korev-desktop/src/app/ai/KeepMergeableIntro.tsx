import { Button, Dialog } from '../../design-system';

const PROMISES = [
  'Merges the base branch in when it conflicts',
  'Fixes failing checks',
  'Addresses comments from people with write access',
  'Pushes signed commits as you',
  'Never force-pushes',
  "Asks you when it isn't sure",
];

export interface KeepMergeableIntroProps {
  number: number | null;
  onTurnOn: () => void;
  onCancel: () => void;
}

export function KeepMergeableIntro({
  number,
  onTurnOn,
  onCancel,
}: KeepMergeableIntroProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title={
        number === null
          ? 'Keep all your PRs mergeable?'
          : `Keep #${number} mergeable?`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" autoFocus onClick={onTurnOn}>
            Turn on
          </Button>
        </>
      }
    >
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 type-ui text-fg-2">
        {PROMISES.map((promise) => (
          <li key={promise}>{promise}</li>
        ))}
      </ul>
    </Dialog>
  );
}
