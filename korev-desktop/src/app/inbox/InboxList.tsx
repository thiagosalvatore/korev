import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { InboxSnapshot } from '../../shared/inbox';
import type { InboxView } from '../../shared/settings';
import { korev } from '../bridge';
import { useKeyShortcuts } from '../keyboard';
import { WIDE_QUERY } from '../layout';
import { useMediaQuery } from '../useMediaQuery';
import { BannerSlot } from './BannerSlot';
import { filterSnapshot } from './filter';
import { GoneRow } from './GoneRow';
import { subjectRef, type ListModel } from './list-model';
import {
  ListboxProvider,
  findOption,
  focusOption,
  focusRovingStop,
  handleListboxKey,
  updateRovingStop,
  type ListboxApi,
} from './listbox';
import { AgentTasksProvider } from '../ai/agent-task-state';
import { OPEN_PAGE_KEY, useKorevAiContext } from '../ai/useKorevAi';
import { ActionsProvider } from './action-state';
import { RepoAvatarsProvider } from './OwnerAvatar';
import { PrPanel } from './PrPanel';
import { APPLY_UPDATES_KEY, UpdatesPill } from './UpdatesPill';
import { useHeldSnapshot, useIdleApply } from './useHeldSnapshot';
import { useMyPrActions } from './useMyPrActions';
import { useFocusRequest, type FocusRequest } from './focus-request';
import { useSelection } from './useSelection';

type ElementRef = RefObject<HTMLDivElement | null>;

function optionTop(listbox: ElementRef, key: string | null): number | null {
  const option = findOption(listbox.current, key);
  return option ? option.getBoundingClientRect().top : null;
}

function useScrollAnchor(
  scroller: ElementRef,
  listbox: ElementRef,
  key: string | null,
): () => void {
  const capturedTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    const before = capturedTop.current;
    capturedTop.current = null;
    const after = optionTop(listbox, key);
    if (before === null || after === null || !scroller.current) return;
    scroller.current.scrollTop += after - before;
  });
  return useCallback(() => {
    capturedTop.current = optionTop(listbox, key);
  }, [listbox, key]);
}

function useAnchorOnFirstLiveSync(
  displayed: InboxSnapshot,
  captureAnchor: () => void,
) {
  const [previous, setPrevious] = useState(displayed);
  if (previous === displayed) return;
  if (previous.fromCache && !displayed.fromCache) captureAnchor();
  setPrevious(displayed);
}

function useFocusWithin() {
  const [focused, setFocused] = useState(false);
  const onFocus = () => setFocused(true);
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setFocused(false);
  };
  return { focused, onFocus, onBlur };
}

function useFocusRowAfterRun(
  showingRun: boolean,
  listbox: ElementRef,
  selectedKey: string | null,
) {
  const wasShowing = useRef(showingRun);
  useLayoutEffect(() => {
    if (wasShowing.current && !showingRun) {
      focusOption(listbox.current, selectedKey);
    }
    wasShowing.current = showingRun;
  }, [showingRun, listbox, selectedKey]);
}

function openExternal(url: string) {
  void korev().shell.openGithub(url);
}

const FILTER_KEY_SEPARATOR = ',';
const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

function hiddenByFilter(
  model: ListModel,
  unfiltered: InboxSnapshot,
  filtered: InboxSnapshot,
): ReadonlySet<string> {
  if (unfiltered === filtered) return NOTHING_HIDDEN;
  const shown = model.subjects(filtered);
  return new Set(
    [...model.subjects(unfiltered).keys()].filter((key) => !shown.has(key)),
  );
}

export interface InboxListProps {
  snapshot: InboxSnapshot;
  model: ListModel;
  view: InboxView;
  label: string;
  repoFilter: string[];
  onOpenSettings: () => void;
  header?: ReactNode;
  empty: ReactNode;
  filteredOut: ReactNode;
  children: (displayed: InboxSnapshot) => ReactNode;
}

export function InboxList({
  snapshot,
  model,
  view,
  label,
  repoFilter,
  onOpenSettings,
  header,
  empty,
  filteredOut,
  children,
}: InboxListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const [pointerInside, setPointerInside] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const focusWithin = useFocusWithin();
  const holding = pointerInside || focusWithin.focused || panelOpen;
  const filtered = useMemo(
    () => filterSnapshot(snapshot, repoFilter),
    [snapshot, repoFilter],
  );
  const hidden = useMemo(
    () => hiddenByFilter(model, snapshot, filtered),
    [model, snapshot, filtered],
  );
  const held = useHeldSnapshot(
    filtered,
    model,
    holding,
    repoFilter.join(FILTER_KEY_SEPARATOR),
  );
  const subjects = useMemo(
    () => model.subjects(held.displayed),
    [model, held.displayed],
  );
  const selection = useSelection(subjects, hidden);
  if (panelOpen && !selection.subject) setPanelOpen(false);
  const captureAnchor = useScrollAnchor(
    scroller,
    listbox,
    selection.selectedKey,
  );
  const docked = useMediaQuery(WIDE_QUERY);
  useAnchorOnFirstLiveSync(held.displayed, captureAnchor);

  function applyHeld() {
    captureAnchor();
    held.apply();
  }

  const noteInteraction = useIdleApply(held.pendingCount > 0, applyHeld);
  const { selectedKey } = selection;

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    focusOption(listbox.current, selectedKey);
  }, [selectedKey]);

  useLayoutEffect(() => updateRovingStop(listbox.current, selectedKey));

  const actions = useMyPrActions(
    view === 'mine',
    held.displayed,
    subjects,
    selection.subject?.key ?? null,
    openExternal,
  );

  const ai = useKorevAiContext();

  const focusRequest = useFocusRequest();
  const [handledFocus, setHandledFocus] = useState<FocusRequest | null>(null);
  if (focusRequest !== handledFocus && focusRequest) {
    setHandledFocus(focusRequest);
    if (subjects.has(focusRequest.ref)) {
      selection.select(focusRequest.ref);
      setPanelOpen(true);
    }
  }

  const selectedRef = subjectRef(selection.subject);
  const showingPage = ai.runRef !== null && ai.runRef === selectedRef;
  useFocusRowAfterRun(showingPage, listbox, selectedKey);

  function openPage() {
    if (!selectedRef) return;
    setPanelOpen(true);
    ai.showRun(selectedRef);
  }

  useKeyShortcuts({
    [APPLY_UPDATES_KEY]: applyHeld,
    [OPEN_PAGE_KEY]: openPage,
    j: () => focusRovingStop(listbox.current),
    k: () => focusRovingStop(listbox.current),
    ...actions.shortcuts,
    ...ai.shortcutsFor(selection.subject),
  });

  const api: ListboxApi = {
    selectedKey,
    select: selection.select,
    activate: (key) => {
      selection.select(key);
      setPanelOpen(true);
    },
    openExternal,
  };

  const showList = !model.isEmpty(held.displayed) || selection.goneRow;

  return (
    <ListboxProvider value={api}>
      <ActionsProvider value={held.displayed.actions}>
        <AgentTasksProvider value={held.displayed.agentTasks}>
          <RepoAvatarsProvider value={held.displayed.repoAvatars}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="relative flex min-h-0 flex-1">
                {showingPage ? ai.runPage(selection.subject) : null}
                <div
                  ref={scroller}
                  hidden={showingPage}
                  className="min-w-0 flex-1 overflow-auto pb-6"
                  onMouseEnter={() => setPointerInside(true)}
                  onMouseLeave={() => setPointerInside(false)}
                  onMouseMove={noteInteraction}
                  onWheel={noteInteraction}
                  onKeyDown={noteInteraction}
                >
                  {held.pendingCount > 0 ? (
                    <UpdatesPill count={held.pendingCount} onShow={applyHeld} />
                  ) : null}
                  <BannerSlot
                    snapshot={held.displayed}
                    view={view}
                    onOpenSettings={onOpenSettings}
                  />
                  {showList ? (
                    <>
                      {header}
                      <div
                        ref={listbox}
                        role="listbox"
                        aria-label={label}
                        onKeyDown={(event) => handleListboxKey(event, api)}
                        onFocus={focusWithin.onFocus}
                        onBlur={focusWithin.onBlur}
                      >
                        {selection.goneRow ? (
                          <GoneRow
                            subject={selection.goneRow}
                            label={actions.goneLabel(selection.goneRow.key)}
                          />
                        ) : null}
                        {children(held.displayed)}
                      </div>
                    </>
                  ) : model.isEmpty(snapshot) ? (
                    empty
                  ) : (
                    filteredOut
                  )}
                </div>
                {panelOpen && selection.subject ? (
                  <PrPanel
                    subject={selection.subject}
                    goneLabel={
                      selection.subjectGone
                        ? actions.goneLabel(selection.subject.key)
                        : null
                    }
                    actions={actions.panelActions(selection.subject)}
                    ai={ai.panelAi(selection.subject)}
                    mode={docked || showingPage ? 'docked' : 'overlay'}
                    onClose={showingPage ? ai.closeRun : closePanel}
                    onOpenPage={
                      showingPage || !selectedRef ? undefined : openPage
                    }
                    onOpenGithub={openExternal}
                  />
                ) : null}
              </div>
            </div>
          </RepoAvatarsProvider>
          {actions.overlays}
        </AgentTasksProvider>
      </ActionsProvider>
    </ListboxProvider>
  );
}
