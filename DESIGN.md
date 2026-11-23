# Korev design

How the Korev desktop app looks and behaves. The tokens live in
`korev-desktop/src/design-system/styles/tokens.css`; this file says how to use them.

## Tokens

- **Use semantic tokens only.** Surfaces `bg-app` → `bg-surface` → `bg-raised`, with
  `bg-hover` and `bg-active` for interaction. Text `fg-1` (primary) → `fg-2` → `fg-3` →
  `fg-4`. Borders `border-1` (hairlines) and `border-2` (controls). Never use a hex value
  or a raw palette step in app code. The one exception is the merged-PR purple.
- **One accent.** Cobalt by default (`accent`, `accent-text`, `accent-subtle`) marks the selected
  thing, the primary action, plan mode and unread dots.
- **Status colours carry meaning.** `danger` = failed or blocked, `warning` = running or
  needs attention, `success` = done or ready to merge.
- **Themes.** Dark is the default token set; `[data-theme='light']` overrides it. The
  app follows the macOS appearance unless Settings → Appearance → Mode overrides it.
  Each mode has presets in `tokens.css` (`[data-theme='dark'][data-palette='graphite']`):
  they override surfaces, borders, text and, if they have their own, the accent. A custom
  accent from Settings sets the `--accent*` tokens inline on `<html>`, derived from one
  colour. Every preset must pass `contrast.test.ts`. The accent swatches in
  `src/app/appearance.ts` are the other exception to "no hex in app code".
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
full-width table with a `px-6` gutter, lined up with the header title. A toolbar sits between the
header and the table, with space above it and no rule under it, and does not scroll. On the
left: the view tabs (`pill` Tabs: All, Needs review, Needs attention, Ready to merge, Mine, each
with the matching count) and **Filters**, a menu with one check item per status label (the button
turns `secondary` and shows a count while any are on). On the right: the repository select (only
with 2 or more repositories) and the search box (focused on open, ⌘F, Esc clears).

- The column headers (Title, Status, Updated) are overlines and stay on top while the table
  scrolls. Rows are separated by `border-1` hairlines (none under the last row) and turn
  `bg-hover` under the pointer.
- Title cell: the title (`text-sm` medium `fg-1`, a draft icon first for drafts), then
  `repository#number · @author · opened <time>` in `text-xs fg-4`.
- A pull request whose base branch is the head branch of another one in the list sits under it,
  indented one step per level. The first one of the stack shows an `accent` **Stack of N** badge.
- Status cell: the review icon (green check approved, amber alert changes requested, `fg-4` eye
  review required), one status badge with a dot (the most severe of Conflicts, Checks failing,
  Changes requested, Checks running, Draft, otherwise **Ready**), and an outline badge with the
  number of unresolved review threads.
- Actions are `sm` icon buttons: Review (Open review), Explain, Check out (Open workspace), Open on
  GitHub. The row is already `bg-hover`, so a hovered button turns `bg-raised` with a `border-2`
  outline to stand out from it.
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
- **Tabs.** The native iOS tab bar (Liquid Glass) has Workspaces, Ask and Pull requests, with
  SF Symbol icons (Material icons on Android). Workspaces and Ask carry an amber badge with the
  number of workspaces or Ask chats that wait for you. A separate round **+** button on the right
  opens New workspace as a sheet and keeps the current tab. Each tab has its own stack with a
  large title. Chats open over the tabs, so the tab bar hides while a chat is open. The
  Workspaces header has **Settings** on the right and, in the demo, a **Demo** label on the left.
- **Task sheets.** New workspace and Ask a question open as native sheets with a grabber. They
  start at 62 % of the screen and grow to full height with the keyboard. **Cancel** is on the
  left. Both use the same layout: a full-width repository row, a large task field (dashed
  `accent` border in plan mode), a row of chips (model, and **Plan** for a workspace) with the
  mic on the right, then a full-width **Start** (or **Create** with no task) or **Ask** button.
  The task field does not take focus when the sheet opens.
- **Settings.** A page sheet with **Done**. Grouped sections: Mac (Paired with, **Unpair this
  phone**) or, in the demo, Demo (**Pair your Mac**), then Notifications (opens the iOS
  settings), then the app version.
- **Home.** The Workspaces tab sorts workspaces by what they need next, in inset grouped
  sections: **Needs you** (`warningText` header: a question, a failure, or a pull request
  problem from `prNeedsYou`), **Working**, **Ready to merge** (`successText` header: the next
  pull request step is a merge), then **Everything else**. An empty section is hidden. A search
  field under the large title filters by name, branch and repository. A row has the status icon,
  the workspace name (`headline`, semibold under Needs you or when unread), one status line
  ("Needs your answer", "Working", "Checks failing · #90", "Ready to merge · #87", "Merged ·
  #79", "Waits for the plan in acme-web", or the branch), and on the right the repository,
  `+N −M` and the unread dot. The name and status wrap to two lines at large text sizes.
  Swipe left to archive. The header's **By repository** button opens the repository tree,
  where a long press on a repository starts reordering.
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
- **Waiting chats.** A workspace opens on the chat that waits for an answer. When another chat
  in the workspace waits, the header menu button shows a badge, and the Chats submenu marks
  that chat "Needs you".
- **Chat header.** The title is the workspace name (or the Ask chat's title). Under it, one
  12 pt status line: `LoadingRing` + "Working · 1m 12s", or a dot + "Needs your answer"
  (`warningText`), "Ready to merge" (`successText`), "Checks failing" / "Has conflicts"
  (`dangerText`) or "Merged" (`merged`). With no status and more than one chat, it shows the
  chat's title. The ellipsis button opens a native menu: Chats (each chat, then New chat),
  Explain changes, Show explanation / Show chat, the next PR step, Checks, Open on GitHub, a
  Pull requests picker when there are several, and Archive.
- **Chat accessory.** Under the header, one row of 28 pt capsules on `bgRaised` that scrolls
  sideways: the branch with its diff stat (`fix-login → main · +128 −14`), which opens Changes,
  and the PR ("No PR yet", "#87 · checks passed", "#90 · e2e failing" in `dangerText`), which
  opens the checks sheet, a form sheet whose rows open the check on GitHub. An Ask chat shows
  one capsule with its repositories. A workspace error shows as a `dangerText` line under the row.
- **Changes.** A pushed screen lists the changed files: the status letter in mono (`A`
  `diffAdd`, `M` `warningText`, `D` `diffDel`, `R` `accentText`), the file name over its folder,
  and `+N −M`. A tap opens the file's diff: old and new line numbers in `fg4`, mono `caption`
  code that wraps, `diffAddBg` / `diffDelBg` rows and `diffHunkBg` hunk headers. The header menu
  also has **Changes**.
- **Transcript.** User messages sit on the right in an 18 pt bubble with a 4 pt bottom-right
  corner and no timestamp. Their text is native: a long press selects a word, with handles and
  the iOS menu (Copy, Look Up, Translate, Share). A long press on an agent message opens Copy,
  Select text and Share. Inline code is `MONO_FONT` on `bgRaised`, never italic.
- **Activity card.** The tools, thinking and todos between two messages fold into one card on
  `bgSurface` (12 pt radius, `border1` hairline). Done: a green `CircleCheck` and what the agent
  did ("Explored 3 files, edited 1 file, ran 2 commands"); a red `CircleX` when a tool failed.
  Running: `LoadingRing` and the current step ("Editing state.ts"), with the todos under it as a
  progress bar and check, dot and dashed-circle rows. A tap opens one row per step. A finished
  turn shows in the header ("Completed in 9s"), not in the transcript; a failed turn keeps its
  error line.
- **Composer.** A chip row sits above the message box: the model (opens Chat options), **Plan**
  (`accentSubtle` and bold `accentText` when on; the box border turns dashed `accent`), the
  effort (a tap moves to the next level), **Fast** only while it is on, and on the right a 20 pt
  context ring (`fg3`, `warning` from 80 %, `danger` from 95 %). A tap on the ring shows the
  context window and the plan limits. Under it: a round **+** (attach), the message box with a
  **/** button while it is empty (workspace chats only), then send, stop or the mic. **/**
  types a slash and lists the repository's commands above the composer; a tap inserts one.
- **Chat options.** A form sheet with a grabber and three inset groups: Model (one row per
  model with its agent, check on the current one), Effort, and Modes (Plan mode, Fast mode
  switches). There is no nested picker.
- **Floating PR action.** Only for Merge, Fix errors and Resolve conflicts: one large button,
  centred 12 pt above the composer, with a soft shadow. It hides while the keyboard is up.
  Create PR lives in the menu, so a new workspace shows no PR button.
- **Jump to latest.** After one screen of scrolling back, a 36 pt round button with a down
  chevron (`bgRaised`, `border2` hairline) shows 12 pt above the composer and 12 pt from the
  right edge. It fades in and out over 150 ms.
- **Empty chat.** One centred `fg3` line just above the composer names the agent and model:
  "Message Claude Code · Opus 5.5".
- **Keyboard.** The composer rides on top of the keyboard, and the last message lifts with it.
  A tap on the chat or a downward swipe closes the keyboard. The rest of the screen keeps its
  layout; nothing shrinks.
- **Touch targets.** Every control takes taps over at least 44 × 44 pt. A smaller control gets
  `hitSlop` from `touchSlop(size)` in `ui.tsx` instead of growing.
- **Text size.** Text follows the iOS text size. Controls and headers (buttons, tabs, chips,
  pickers, the composer, the chat header and capsules) stop growing at 1.4× (`CHROME_FONT_SCALE`), so they never
  push the chat off the screen. Chat text and list rows scale fully. Repository avatars keep their
  size and their initials do not scale, like an icon.
- **Type ramp.** Text sizes come from `TYPE` in `theme.ts`, which follows the iOS text styles:
  `largeTitle` 34, `title3` 20, `headline` 17 semibold, `body` 17, `callout` 16, `subhead` 15,
  `footnote` 13 and `caption` 12. New phone code uses these names, never a raw font size.
- **On amber.** Text on a `warning` fill, like the tab badge, uses `fgOnWarning`.
- **Ask tab.** The list has an overline per group: Across repos, then each repository, then No
  repository. An idle Ask chat shows `MessageSquare` (`fg4`), a waiting one
  `MessageCircleQuestion` (`warningText`) with a highlighted title. The tab badge counts waiting
  Ask chats, like the Workspaces badge counts waiting workspaces.
- **Explainer.** A chat with an explainer opens on Explanation. The header menu switches
  between Show chat and Show explanation. The sections follow the desktop in one column. Walkthrough steps are cards
  that open one at a time. Glossary terms have a dotted underline; tapping one shows its meaning.
  Diff rows use `diffAddBg`, `diffDelBg` and `diffHunkBg`, and risks use `riskHigh`, `riskMedium`
  and `riskLow` with their `Subtle` backgrounds. The header menu has **Explain changes**, and
  each pull request in the Pull requests tab has **Explain** in its actions.
- **Linked group.** The workspace list follows the desktop's Linked group: a foldable **Across
  repos** overline above the repositories, then one entry per group with a link-icon label, the
  shared name and one avatar per repository, and indented rows that lead with the repository
  name. A repository group leaves those workspaces out. The workspace title is "<repository> · <name>", and a waiting workspace's
  empty chat says its agent starts when you approve the plan. The lanes card has a repository
  picker per lane.
- **Bridge.** The phone calls only the methods in `REMOTE_METHODS`. It can send a queued
  message now, remove a queued message, revert to a user message and restore an archived
  workspace. It can start and stop the Setup and Run scripts and read their output, from
  `scriptOutput` when it connects and from the `terminal-output` and `terminal-exit` events
  after that. It never sees or writes to an interactive shell. A Mac with an older Korev
  answers a newer method with an error, so the phone shows that method's control only after
  the Mac answers it.
