import type { CollapsibleSection } from '../../shared/settings';
import { announce } from '../LiveAnnouncer';
import { saveCollapsedSection, useSettings } from '../useSettings';

const COLLAPSED_BY_DEFAULT: Record<CollapsibleSection, boolean> = {
  ready: false,
  'in-progress': false,
  approved: true,
};

export interface CollapsedSections {
  isCollapsed: (section: CollapsibleSection) => boolean;
  toggle: (section: CollapsibleSection, label: string) => void;
}

export function useCollapsedSections(): CollapsedSections {
  const overrides = useSettings()?.collapsedSections ?? {};
  const isCollapsed = (section: CollapsibleSection) =>
    overrides[section] ?? COLLAPSED_BY_DEFAULT[section];
  return {
    isCollapsed,
    toggle: (section, label) => {
      const collapsed = !isCollapsed(section);
      announce(`${label} ${collapsed ? 'collapsed' : 'expanded'}`);
      void saveCollapsedSection(section, collapsed);
    },
  };
}
