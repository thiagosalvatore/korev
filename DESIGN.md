# Korev design

How the Korev desktop app looks and behaves. The tokens live in
`korev-desktop/src/design-system/styles/tokens.css`; this file says how to use them.

## Tokens

- **Use semantic tokens only.** Surfaces `bg-app` → `bg-surface` → `bg-raised`, with
  `bg-hover` and `bg-active` for interaction. Text `fg-1` (primary) → `fg-2` → `fg-3` →
  `fg-4`. Borders `border-1` (hairlines) and `border-2` (controls). Never use a hex value
  or a raw palette step in app code. The one exception is the merged-PR purple.
- **One accent.** Cobalt (`accent`, `accent-text`, `accent-subtle`) marks the selected
  thing, the primary action, plan mode and unread dots.
- **Status colours carry meaning.** `danger` = failed or blocked, `warning` = running or
  needs attention, `success` = done or ready to merge.
- **Themes.** Dark is the default token set; `[data-theme='light']` overrides it. The
  app follows the macOS appearance unless Settings → General → Theme overrides it.
- **Loading.** Use `LoadingRing` for inline work: a button that is busy, a running agent
  or a running check. The `loader-circle` icon name also renders it. Use `SkeletonRows`
  (or `Skeleton` bars in the shape of the row) for lists. Use `Spinner` only for a full
  pane whose content has an unknown shape. A running agent shows the ring next to
  `ShimmerText` ("Working…"). Spinners and skeletons appear only after 150 ms, so fast
  loads never flash. A refresh keeps the old content on screen and marks the refresh
  button busy. With reduced motion on, the shimmer and the arc stop and the ring turns
  slowly.

## Layout

Three columns:

- **Left sidebar** (`--sidebar-w`): Search (⌘K), New workspace (⌘N), Grid (⌘G), Board (⌘⇧B),
  Pull requests, Runs (only once an agent has started an orchestration run), Automations and New
  Ask. Then Waiting for you, Across repos, one group per repository, No repository, History
  (archived workspaces), and Add repository and Settings.
  - The **Customize sidebar** icon in the top bar hides any of these pages and turns on
    **compact navigation**: one row of `sm` icon buttons in the same order. The current page has
    `bg-active` in both layouts. New Ask is current only on a blank Ask page, not while an Ask chat
    is open.
  - **Waiting for you** sits between the pages and Across repos while a workspace is in the
    Board's Needs you or Done column, or an Ask chat waits for your input. The header is an
    overline with a count badge. Each row is one line: status icon, name (semibold), repository
    (`fg-3`, "Ask · repository" for an Ask chat) and the unread dot. Needs you workspaces come
    first, then Ask chats, then Done workspaces. Each keeps its own row further down too.
  - **Across repos** holds every workspace linked across repositories (see Linked group) and every
    Ask chat about two or more repositories. The header is an overline with a count badge. It is
    hidden while it is empty. Cross-repo groups come first in ⌘1–9 order, so the numbers follow
    the rows on screen.
  - **A repository group** has its workspaces, then its Ask chats under a foldable **Asks** row
    (`messages-square`, count, `max-h-56` scroll), then "Also in N linked, M Ask above" in
    `text-xs fg-4` when the repository is part of Across repos. A repository with any of these
    starts open.
  - **No repository** follows the repositories while an Ask chat has no repository. Its avatar is
    a dashed box.
  - **Ask chat rows**: `message-square` (`fg-4`) when idle, the loading ring while the agent
    works, `message-circle-question` (`warning`) only while it waits for you. Line 2 shows the
    repositories, with their avatars, only in Across repos.
  - **Repository avatars** show the repository icon, or the first letters of up to two parts of
    the name (`acme-web` → AW), so repositories with the same first letter stay apart.
  - A collapsed repository, folder, workspace folder or Asks row shows a `size-1.5` dot after its
    chevron when something under it waits for you: `warning` for Needs you or a waiting Ask chat,
    `accent` for Done only.
- **Centre**: the workspace header (workspace name, branch, target branch, Open in, PR number,
  the next git action), a tab strip (chats, Changes, open files) and the active tab.
- **Right panel** (`--panel-w`): the git panel (Files / Changes / PR / Artifacts) on top and
  the terminal panel (Setup / Run / Terminal) below.

The **Grid** page (⌘G) replaces the centre and the right panel with 2 or 4 panes. Each pane
shows one chat or terminal tab of a workspace, or one Ask chat. The pane header has the
branch, the workspace name, the tab picker, **Open in full view** and **Remove from grid**. An
Ask pane header has the chat title and its repositories instead of the branch and the tab
picker. The focused pane has an accent border, and the sidebar marks its workspace or Ask chat
as the current row.

The **Runs** page replaces the centre and the right panel with one card per orchestration run,
newest first. A card has the objective, **Resume run** while the run is paused, the
coordinator's workspace, the open decisions and questions, then one row per task: id, title,
state badge, the tasks it waits for, its worker's workspace, and the worker's report under it.
Decision cards use the permission card style (warning border). They also show at the end of the
coordinator's chat.

The **Pull requests** page replaces the centre and the right panel with the pull request inbox: one
full-width table. A toolbar sits between the header and the table and does not scroll. On the
left: the view tabs (`pill` Tabs: All, Needs review, Needs attention, Ready to merge, Mine, each
with the matching count) and **Filters**, a menu with one check item per status label (the button
turns `secondary` and shows a count while any are on). On the right: the repository select (only
with 2 or more repositories) and the search box (focused on open, ⌘F, Esc clears).

- The column headers (Title, Status, Updated) are overlines and stay on top while the table
  scrolls. Rows are separated by `border-1` hairlines and turn `bg-hover` under the pointer.
- Title cell: the title (`text-sm` medium `fg-1`, a draft icon first for drafts), then
  `repository#number · @author · opened <time>` in `text-xs fg-4`.
- A pull request whose base branch is the head branch of another one in the list sits under it,
  indented one step per level. The first one of the stack shows an `accent` **Stack of N** badge.
- Status cell: the review icon (green check approved, amber alert changes requested, `fg-4` eye
  review required), one status badge with a dot (the most severe of Conflicts, Checks failing,
  Changes requested, Checks running, Draft, otherwise **Ready**), and an outline badge with the
  number of unresolved review threads.
- Actions are `sm` icon buttons: Review (Open review), Explain, Check out (Open workspace), Open on
  GitHub.
- When the filters hide every pull request, the table shows "No pull requests match these
  filters." and **Clear filters**. An empty view shows one line in `fg-3`.

The **Automations** page replaces the centre and the right panel with one card per automation.
A card has the name, a **Running** badge while a run is going, the on/off switch, **Run now**,
**Edit** and **Delete**. Under them: the schedule, the repositories, the time of the last run and
the time of the next run.
Then the last five runs, one row each: the start time (click to open the run's chat), what it did,
the workspaces it opened and a note for each request Korev skipped. **New automation** and
**Edit** show the form above the cards. With no automations, the page shows what an automation
does instead: a headline, **New automation**, three steps (runs on your schedule, checks your
tools, opens workspaces) and three examples. An example opens the form with its name, prompt
and schedule filled in.

## Workspace row

- Line 1: the branch name, bold when the workspace has unread agent output.
- Line 2: a link icon for linked workspaces, the workspace name, then the error if setup
  or worktree creation failed.
- Left icon: spinner while an agent or the setup script runs; otherwise the PR state
  (green open, red failing checks, amber conflicts or running checks, purple merged);
  otherwise a branch icon.
- Right: `+N −M` against the target branch, and the unread dot.

## Linked group

Workspaces linked across repositories share one name and one branch, so the sidebar shows them
as one entry in Across repos:

- A header button: a link icon, the shared name (semibold `fg-1`), and on line 2 one chip per
  member (`bg-active`): the `sm` repository avatar and the member's status icon. Clicking it folds
  the entry. Entries start open.
- One row per member, behind a `border-2` rule. Line 1 is the `sm` repository avatar and the
  repository name, not the branch. Line 2 is the branch, or "Waits for the plan in <lead
  repository>" while the member waits for its lane.
- Each row keeps its own status icon, unread dot and ⌘N. Its menu has no Move to folder, and
  dropping it on a folder does nothing: a group across repositories is never in a folder.
- A waiting member's empty chat says its agent starts when the plan is approved, with
  **Open <lead repository>**.
- The workspace header and the Grid pane header put the repository name before the workspace
  name.
- When the lead is archived or fails, the next member becomes the lead.

## Next git action

The header button walks a workspace to merge: **Create PR** → **Resolve conflicts** (PR
conflicts) → **Fix errors** (failing checks) → **Merge** → **Archive** (merged). Create
PR, Fix errors and Resolve conflicts send a prompt to the active chat; Merge calls
`gh pr merge --squash`.

## Chat

- User messages sit on the right in a raised box. Hovering one shows copy and revert.
  Revert removes that message and everything after it, restores the files from the
  checkpoint taken before it, and puts the text back in the composer.
- Agent text is markdown. Tool calls are one line each (icon, tool, target) and expand to
  show input and output. More than three in a row collapse into "N tool calls".
- Hovering a markdown code block shows a copy button in its top-right corner, in its own column so
  the code never runs under it. It turns into a `success-text` check for 1.5 s after copying.
- The composer border turns dashed accent in plan mode (⇧Tab).
- A plan's Lanes card lists each lane with a checkbox and its name. In a workspace linked across
  repositories, each lane also has a repository picker, preset to the repository its name matches.
  A task across several repositories always starts in plan mode.
- The ring next to Send shows how full the chat's context window is after the last turn.
  Clicking it opens a popover with the token counts and the agent's plan limits (5-hour
  and weekly).

## Explainer

An explainer is a chat session whose agent writes a plain-words walkthrough of a change. Korev
shows it in the chat area, so it works in a workspace tab, an Ask chat and a Grid pane.

- **Explanation | Chat.** A pill switch on top of the session. It opens on Explanation. Sending a
  message switches to Chat. In Chat, the agent's JSON block shows as an "Explanation ready ·
  Open" chip.
- **Sections**, top to bottom: header (number, author, file count, `+N −M`, **Open on GitHub**,
  **Export HTML**),
  "In one sentence" card, Before and After cards (After uses `accent-subtle`), How it works
  (numbered boxes joined by arrows; click one for its detail), Walkthrough, Look closely, Questions
  for the author, Other files, Words used here.
- **Walkthrough.** The steps on the left with a progress bar of the steps marked understood. The
  step on the right has its text, a "Why" box on `accent-subtle`, and the diff rows the step cites,
  drawn with the same rows as the Changes diff. ←/→ move between steps.
- **Risk colours.** Look closely uses the `risk-*` tokens: high, medium, low.
- **Stacks.** Under the title, "Stack of N" lists the pull requests from the bottom up. **The stack**
  section comes after Before and After: one card per pull request with its number, title, what it adds
  and a button to its first step. Each walkthrough step shows its pull request number under its title.
- **Glossary terms** have a dotted underline and a tooltip with the meaning.
- **Not explained.** Changed files that no step and no routine entry names show in a `warning`
  box, so the explanation can never hide a file.
- **Export HTML** writes one file with its own styles copied from the token values, light and dark
  through `prefers-color-scheme`. It has no scripts: steps are `<details>`, glossary terms are
  `<abbr>`.
- **Share chat** saves a chat the same way: one file, no scripts, the same copied token values.
  Tool calls are closed `<details>`, and an edit's lines use the diff add and delete colours.
- **Banners** above the explanation: neutral while it updates, `danger` when an update failed,
  `warning` with **Update** when the change moved on.

## Release notes

"What's new" (after an update) and "Korev X is available" share one 560 px dialog. The title is
the release's one-sentence summary, with "What's new in Korev X" or "Korev X is available"
under it. The body has a **New** group (sparkles icon on `accent-subtle`) and a **Fixed** group
(wrench icon in `fg-3`), each with its count. Fixed items use smaller `fg-2` text. **All
releases** in the footer opens korev.ai/changelog at that version; **Help → Korev Release
Notes** opens the same page.

## Phone app

- **Tokens.** `korev-mobile/src/theme.ts` mirrors the desktop tokens for dark and light. Use
  its names, never a hex value, in phone code.
- **Can't reach the Mac.** A screen with no data yet shows the offline panel in place of its
  spinner: a WifiOff icon, "Can't reach Korev on your Mac", what to check (Korev open on the
  Mac, Tailscale on the phone, the Mac awake and on Tailscale), **Try again** and **Unpair this
  phone**. It is left-aligned like the pair screen. A screen that already shows data keeps it
  and gets a pill over the header title, "Not connected to your Mac", in `warningText` on
  `bgRaised`. Tapping the pill lists what to check. The pill fades out when the Mac answers
  again, with no "Connected" message.
- **Welcome.** An unpaired phone opens on a welcome screen: a tilted preview of the
  workspace list (one agent working, one waiting, one ready to merge) under a slide-in
  notification, then "Your agents, in your pocket." and **Pair with your Mac**. The pairing
  steps and the full-screen scanner come after that tap.
- **Pending buttons.** A button whose request is running shows a spinner in place of its
  label and keeps its size. Its siblings are disabled until the request ends.
- **Waiting chats.** A workspace opens on the chat that waits for an answer. Its tab shows an
  amber `warning` dot next to the running spinner.
- **Jump to latest.** After one screen of scrolling back, a 36 pt round button with a down
  chevron (`bgRaised`, `border2` hairline) shows 12 pt above the composer and 12 pt from the
  right edge. It fades in and out over 150 ms.
- **Empty chat.** One centred `fg3` line names the agent and model: "Message Claude Code ·
  Opus 5.5".
- **Touch targets.** Every control takes taps over at least 44 × 44 pt. A smaller control gets
  `hitSlop` from `touchSlop(size)` in `ui.tsx` instead of growing.
- **Text size.** Text follows the iOS text size. Controls and headers (buttons, tabs, chips,
  pickers, the composer, the PR bar) stop growing at 1.4× (`CHROME_FONT_SCALE`), so they never
  push the chat off the screen. Chat text and list rows scale fully.
- **On amber.** Text on a `warning` fill, like the tab badge, uses `fgOnWarning`.
- **Ask tab.** The list has an overline per group: Across repos, then each repository, then No
  repository. An idle Ask chat shows `MessageSquare` (`fg4`), a waiting one
  `MessageCircleQuestion` (`warningText`) with a highlighted title. The tab badge counts waiting
  Ask chats, like the Workspaces badge counts waiting workspaces.
- **Explainer.** A chat with an explainer opens on Explanation, with an Explanation | Chat switch
  under the header. The sections follow the desktop in one column. Walkthrough steps are cards
  that open one at a time. Glossary terms have a dotted underline; tapping one shows its meaning.
  Diff rows use `diffAddBg`, `diffDelBg` and `diffHunkBg`, and risks use `riskHigh`, `riskMedium`
  and `riskLow` with their `Subtle` backgrounds. The pull request bar has **Explain** next to the
  next step, and the Ask tab header has a book button that opens "Explain a pull request".
- **Linked group.** The workspace list follows the desktop's Linked group: a foldable **Across
  repos** overline above the repositories, then one entry per group with a link-icon label, the
  shared name and one avatar per repository, and indented rows that lead with the repository
  name. A repository group leaves those workspaces out. The workspace title is "<repository> · <name>", and a waiting workspace's
  empty chat says its agent starts when you approve the plan. The lanes card has a repository
  picker per lane.
