import { useState, type ReactNode } from 'react';
import { Button, Toast } from '../../design-system';
import { KEEP_DAYS } from '../../inbox/keep';
import { mergePathFor } from '../../inbox/merge-path';
import type { InboxSnapshot, MyPr } from '../../shared/inbox';
import type {
  MergeMethod,
  MergeTool,
  PrActionState,
  PrTarget,
} from '../../shared/merge';
import { prRef } from '../../shared/pr-ref';
import { korev } from '../bridge';
import type { ShortcutMap } from '../keyboard';
import { announce } from '../LiveAnnouncer';
import { saveKept, useSettings } from '../useSettings';
import { useTimedToast } from '../useTimedToast';
import { CLOSED_GONE_LABEL, MERGED_GONE_LABEL } from './action-state';
import {
  CancelQueueConfirm,
  CloseConfirm,
  MergeConfirm,
} from './ActionDialogs';
import type { PanelSubject, SubjectIndex } from './list-model';
import {
  closePlan,
  isQuiet,
  mergeButtonLabel,
  mergePlan,
  numberList,
  numberSpan,
  quietStackItems,
  targetOf,
  toolName,
} from './merge-plan';
import {
  CLOSE_KEY,
  KEEP_KEY,
  MERGE_KEY,
  type KeepAction,
  type PanelActions,
} from './PanelActions';

type DialogKind = 'merge' | 'close' | 'cancel-queue';

interface OpenDialog {
  kind: DialogKind;
  key: string;
}

interface ToastAction {
  label: string;
  run: () => void;
}

interface ActionToast {
  message: string;
  action: ToastAction | null;
}

const TOAST_MS = 6000;
const SAVE_FAILED = "Couldn't save";

function reopenAction(targets: PrTarget[]): ToastAction {
  return {
    label: 'Reopen',
    run: () => targets.forEach((target) => void korev().pr.reopen(target)),
  };
}

function mineItem(subjects: SubjectIndex, key: string | null): MyPr | null {
  const subject = key ? subjects.get(key) : undefined;
  return subject?.kind === 'mine' ? subject.item : null;
}

type FreshState = [string, PrActionState];

function mergedToast(fresh: FreshState[]): ActionToast | null {
  const merged = fresh.find(([, state]) => state.kind === 'merged')?.[1];
  if (merged?.kind !== 'merged') return null;
  return { message: `Merged ${numberSpan(merged.numbers)}`, action: null };
}

function closedToast(
  fresh: FreshState[],
  subjects: SubjectIndex,
): ActionToast | null {
  const closed = fresh
    .filter(([, state]) => state.kind === 'closed')
    .flatMap(([key]) => {
      const item = mineItem(subjects, key);
      return item ? [item] : [];
    })
    .sort((left, right) => left.pr.number - right.pr.number);
  if (closed.length === 0) return null;
  const partial = fresh.some(([, state]) => state.kind === 'close-failed');
  const numbers = closed.map((item) => item.pr.number);
  return {
    message: `Closed ${partial ? numberList(numbers) : numberSpan(numbers)}`,
    action: reopenAction(closed.map(targetOf)),
  };
}

function settledToast(
  fresh: FreshState[],
  subjects: SubjectIndex,
): ActionToast | null {
  return mergedToast(fresh) ?? closedToast(fresh, subjects);
}

function useSettledHistory(
  actions: Record<string, PrActionState>,
  subjects: SubjectIndex,
  onSettled: (toast: ActionToast) => void,
) {
  const [seen, setSeen] = useState(actions);
  const [history, setHistory] = useState<Record<string, PrActionState['kind']>>(
    {},
  );
  if (seen === actions) return history;
  setSeen(actions);
  const fresh = Object.entries(actions).filter(
    ([key, state]) => seen[key]?.kind !== state.kind,
  );
  if (fresh.length === 0) return history;
  setHistory((current) => ({
    ...current,
    ...Object.fromEntries(fresh.map(([key, state]) => [key, state.kind])),
  }));
  const toast = settledToast(fresh, subjects);
  if (toast) onSettled(toast);
  return history;
}

function queueName(item: MyPr): string {
  const tool = item.queue?.tool;
  if (!tool || tool === 'github') return 'merge';
  return toolName(tool);
}

export interface MyPrActions {
  shortcuts: ShortcutMap;
  panelActions(subject: PanelSubject | null): PanelActions | undefined;
  goneLabel(key: string): string;
  overlays: ReactNode;
}

export function useMyPrActions(
  enabled: boolean,
  snapshot: InboxSnapshot,
  subjects: SubjectIndex,
  selectedKey: string | null,
  openGithub: (url: string) => void,
): MyPrActions {
  const settings = useSettings();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [keepFailedKey, setKeepFailedKey] = useState<string | null>(null);
  const toast = useTimedToast<ActionToast>(TOAST_MS);
  const history = useSettledHistory(snapshot.actions, subjects, toast.show);
  const locked = snapshot.fromCache;

  function mergeWith(repo: string): MergeTool {
    return settings?.mergeWith[repo] ?? 'github';
  }

  function open(kind: DialogKind, item: MyPr | null) {
    if (!enabled || !item || locked) return;
    setDialog({ kind, key: `${item.pr.repo}#${item.pr.number}` });
  }

  function closeDialog() {
    setDialog(null);
  }

  function merge(item: MyPr, numbers: number[], method: MergeMethod | null) {
    closeDialog();
    void korev().pr.merge({ target: targetOf(item), numbers, method });
  }

  function close(item: MyPr) {
    closeDialog();
    void korev().pr.close(closePlan(item, subjects).targets);
  }

  async function toggleKeep(item: MyPr | null) {
    if (!enabled || !item || !isQuiet(item)) return;
    const items = quietStackItems(item, subjects);
    const refs = items.map((kept) => prRef(kept.pr));
    const keeping = item.bucket !== 'kept';
    try {
      await saveKept(refs, keeping);
    } catch {
      setKeepFailedKey(prRef(item.pr));
      announce(SAVE_FAILED);
      return;
    }
    setKeepFailedKey(null);
    if (!keeping) return;
    const numbers = items.map((kept) => kept.pr.number);
    toast.show({
      message: `Kept ${numberList(numbers)} for ${KEEP_DAYS} days`,
      action: { label: 'Undo', run: () => void saveKept(refs, false) },
    });
  }

  function keepAction(item: MyPr): KeepAction | null {
    if (!isQuiet(item)) return null;
    return {
      kept: item.bucket === 'kept',
      failed: keepFailedKey === prRef(item.pr),
      onToggle: () => void toggleKeep(item),
    };
  }

  function cancelQueue(item: MyPr) {
    closeDialog();
    void korev().pr.cancelQueue(targetOf(item));
  }

  function panelActions(
    subject: PanelSubject | null,
  ): PanelActions | undefined {
    if (!enabled || subject?.kind !== 'mine') return undefined;
    const item = subject.item;
    const path = mergePathFor(
      snapshot.repoMerge[item.pr.repo],
      mergeWith(item.pr.repo),
    );
    return {
      state: snapshot.actions[subject.key] ?? null,
      queue: item.queue,
      queueName: queueName(item),
      mergeLabel: mergeButtonLabel(path),
      ready: item.bucket === 'ready',
      locked,
      onMerge: () => open('merge', item),
      onClose: () => open('close', item),
      onCancelQueue: () => open('cancel-queue', item),
      onOpenGithub: () => openGithub(item.pr.url),
      keep: keepAction(item),
    };
  }

  function dialogElement(): ReactNode {
    const item = mineItem(subjects, dialog?.key ?? null);
    if (!dialog || !item) return null;
    if (dialog.kind === 'close') {
      return (
        <CloseConfirm
          item={item}
          plan={closePlan(item, subjects)}
          onConfirm={() => close(item)}
          onCancel={closeDialog}
        />
      );
    }
    const plan = mergePlan(item, snapshot, mergeWith(item.pr.repo), subjects);
    if (dialog.kind === 'cancel-queue') {
      return (
        <CancelQueueConfirm
          item={item}
          path={plan.path}
          onConfirm={() => cancelQueue(item)}
          onCancel={closeDialog}
        />
      );
    }
    return (
      <MergeConfirm
        item={item}
        plan={plan}
        onConfirm={(method) => merge(item, plan.numbers, method)}
        onOpenGithub={() => {
          closeDialog();
          openGithub(item.pr.url);
        }}
        onCancel={closeDialog}
      />
    );
  }

  const shown = toast.toast;
  const overlays = (
    <>
      {dialogElement()}
      {shown ? (
        <div className="fixed right-5 bottom-5 z-50">
          <Toast
            tone="success"
            title={shown.message}
            onClose={toast.dismiss}
            action={
              shown.action ? (
                <Button
                  size="sm"
                  onClick={() => {
                    toast.dismiss();
                    shown.action?.run();
                  }}
                >
                  {shown.action.label}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
    </>
  );

  return {
    shortcuts: {
      [MERGE_KEY]: () => open('merge', mineItem(subjects, selectedKey)),
      [CLOSE_KEY]: () => open('close', mineItem(subjects, selectedKey)),
      [KEEP_KEY]: () => void toggleKeep(mineItem(subjects, selectedKey)),
    },
    panelActions,
    goneLabel: (key) =>
      history[key] === 'closed' ? CLOSED_GONE_LABEL : MERGED_GONE_LABEL,
    overlays,
  };
}
