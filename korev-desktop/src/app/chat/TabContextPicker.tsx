import { useState } from 'react';
import { IconButton } from '../../design-system';

import { conversationText, planOf, type ChatItem } from '../../shared/model';
import { api } from '../bridge';
import { Menu, type MenuItem } from '../ui/Menu';
import { reportFailure } from '../ui/toast';
import { readAsBase64 } from './attachments';

export type TabContextKind = 'plan' | 'transcript';

export interface TabContext {
  key: string;
  kind: TabContextKind;
  tabTitle: string;
  prompt: string;
}

export interface ContextTab {
  id: string;
  title: string;
}

export interface TabContextPickerProps {
  workspaceId: string | null;
  tabs: ContextTab[];
  onPick(context: TabContext): void;
}

const PICKER_LABEL = 'Add context from a tab';
const MENU_WIDTH = 260;

function placeholder(id: string, label: string): MenuItem[] {
  return [{ id, label, disabled: true, onSelect: () => {} }];
}

const LOADING = placeholder('loading', 'Loading tabs…');
const NOTHING = placeholder('nothing', 'No other tab has messages yet');

function planContext(tab: ContextTab, plan: string): TabContext {
  return {
    key: `plan:${tab.id}`,
    kind: 'plan',
    tabTitle: tab.title,
    prompt: `<plan from="${tab.title}">\n${plan}\n</plan>`,
  };
}

async function transcriptContext(
  workspaceId: string | null,
  tab: ContextTab,
  items: ChatItem[],
): Promise<TabContext | null> {
  const markdown = `# Chat transcript: ${tab.title}\n\n${conversationText(items)}\n`;
  const saved = await api.saveAttachment(
    workspaceId,
    `transcript-${tab.title}.md`,
    await readAsBase64(new Blob([markdown])),
  );
  if (!reportFailure(saved)) return null;
  return {
    key: `transcript:${tab.id}`,
    kind: 'transcript',
    tabTitle: tab.title,
    prompt: `Chat transcript of the "${tab.title}" tab (read it): ${saved.value}`,
  };
}

function tabItems(
  tab: ContextTab,
  items: ChatItem[],
  workspaceId: string | null,
  onPick: (context: TabContext) => void,
): MenuItem[] {
  if (!items.some((item) => item.kind === 'user')) return [];
  const plan = planOf(items);
  const planItems: MenuItem[] = plan
    ? [
        {
          id: `plan:${tab.id}`,
          label: 'Plan',
          ariaLabel: `Plan from ${tab.title}`,
          icon: 'list-checks',
          section: tab.title,
          onSelect: () => onPick(planContext(tab, plan)),
        },
      ]
    : [];
  return [
    ...planItems,
    {
      id: `transcript:${tab.id}`,
      label: 'Chat transcript',
      ariaLabel: `Chat transcript of ${tab.title}`,
      icon: 'message-square',
      section: tab.title,
      onSelect: () =>
        void transcriptContext(workspaceId, tab, items).then(
          (context) => context && onPick(context),
        ),
    },
  ];
}

export function TabContextPicker({
  workspaceId,
  tabs,
  onPick,
}: TabContextPickerProps) {
  const [items, setItems] = useState<MenuItem[]>(LOADING);

  async function load() {
    setItems(LOADING);
    const transcripts = await Promise.all(
      tabs.map((tab) => api.transcript(tab.id)),
    );
    const loaded = tabs.flatMap((tab, index) =>
      tabItems(tab, transcripts[index], workspaceId, onPick),
    );
    setItems(loaded.length ? loaded : NOTHING);
  }

  return (
    <Menu
      label={PICKER_LABEL}
      side="top"
      width={MENU_WIDTH}
      items={items}
      trigger={({ open, toggle }) => (
        <IconButton
          icon="layers"
          label={PICKER_LABEL}
          title={PICKER_LABEL}
          size="sm"
          onClick={() => {
            if (!open) void load();
            toggle();
          }}
        />
      )}
    />
  );
}
