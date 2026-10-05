import type { ReactNode } from 'react';

export function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mt-4.5 mb-1.5 type-overline text-fg-3">{title}</h3>
      {children}
    </section>
  );
}
