import { useState, type ReactNode } from 'react';
import { cn, Dialog } from '../../design-system';
import { Markdown } from './Markdown';

const PREVIEW_WIDTH = 'min(820px, calc(100vw - 32px))';

export function PlanChip({
  name,
  markdown,
  className,
  children,
}: {
  name: string;
  markdown: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={`Preview ${name}`}
        className={cn('cursor-pointer', className)}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        width={PREVIEW_WIDTH}
      >
        <div className="max-h-[66vh] overflow-auto">
          <Markdown text={markdown} />
        </div>
      </Dialog>
    </>
  );
}
