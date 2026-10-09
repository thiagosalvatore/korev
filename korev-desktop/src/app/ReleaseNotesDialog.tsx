import { useEffect, useId, type ReactNode } from 'react';
import { Button, cn, Dialog, Icon, type IconName } from '../design-system';
import { CHANGELOG_URL } from '../shared/links';
import type { AppState, ReleaseInfo } from '../shared/model';
import { api } from './bridge';
import { Markdown } from './chat/Markdown';
import {
  parseReleaseNotes,
  type ReleaseSection,
  type ReleaseSectionKind,
} from './release-notes';
import { reportFailure } from './ui/toast';
import { setUi, useUi } from './ui-store';

const DIALOG_WIDTH = 560;

interface SectionStyle {
  label: string;
  icon: IconName;
  iconClass: string;
  itemClass: string;
}

const SECTION_STYLES: Record<ReleaseSectionKind, SectionStyle> = {
  new: {
    label: 'New',
    icon: 'sparkles',
    iconClass: 'bg-accent-subtle text-accent-text',
    itemClass: '',
  },
  fixed: {
    label: 'Fixed',
    icon: 'wrench',
    iconClass: 'bg-active text-fg-3',
    itemClass: 'type-ui text-fg-2',
  },
};

function Section({ section }: { section: ReleaseSection }) {
  const style = SECTION_STYLES[section.kind];
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-5 place-items-center rounded-sm',
            style.iconClass,
          )}
        >
          <Icon name={style.icon} size={12} />
        </span>
        <h3 id={labelId} className="m-0 type-label text-fg-1">
          {style.label}
        </h3>
        <span className="type-label text-fg-3">{section.items.length}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 pl-7">
        {section.items.map((item) => (
          <li key={item}>
            <Markdown text={item} className={style.itemClass} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReleaseNotesView({
  release,
  label,
  actions,
  onClose,
}: {
  release: ReleaseInfo;
  label: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  const { summary, sections } = parseReleaseNotes(release.notes);
  return (
    <Dialog
      open
      onClose={onClose}
      width={DIALOG_WIDTH}
      title={summary || label}
      description={summary ? label : undefined}
      footer={
        <>
          <Button
            variant="ghost"
            iconRight="external-link"
            className="mr-auto"
            onClick={() =>
              void api.openExternal(`${CHANGELOG_URL}#v${release.version}`)
            }
          >
            All releases
          </Button>
          {actions}
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-5 overflow-auto">
        {sections.map((section) => (
          <Section key={section.kind} section={section} />
        ))}
      </div>
    </Dialog>
  );
}

function WhatsNew({ release }: { release: ReleaseInfo }) {
  const dismiss = () => void api.dismissWhatsNew();
  return (
    <ReleaseNotesView
      release={release}
      label={`What's new in Korev ${release.version}`}
      onClose={dismiss}
      actions={
        <Button variant="primary" onClick={dismiss}>
          Got it
        </Button>
      }
    />
  );
}

function UpdateAvailable({ release }: { release: ReleaseInfo }) {
  const close = () => setUi({ updateOpen: false });
  return (
    <ReleaseNotesView
      release={release}
      label={`Korev ${release.version} is available`}
      onClose={close}
      actions={
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
    />
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
