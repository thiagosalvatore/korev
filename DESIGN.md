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

## Layout

Three columns:

- **Left sidebar** (`--sidebar-w`): Search (⌘K), New workspace (⌘N), Ask, then the Ask
  chats, then one group per repository with its workspaces, then History (archived
  workspaces), then Add repository and Settings.
- **Centre**: the workspace header (workspace name, branch, target branch, Open in, PR number,
  the next git action), a tab strip (chats, Changes, open files) and the active tab.
- **Right panel** (`--panel-w`): the git panel (All files / Changes / Checks) on top and
  the terminal panel (Setup / Run / Terminal) below.

The **Grid** page (⌘G) replaces the centre and the right panel with 2 or 4 panes. Each pane
shows one chat or terminal tab of a workspace, or one Ask chat. The pane header has the
branch, the workspace name, the tab picker, **Open in full view** and **Remove from grid**. An
Ask pane header has the chat title and its repositories instead of the branch and the tab
picker. The focused pane has an accent border, and the sidebar marks its workspace or Ask chat
as the current row.

## Workspace row

- Line 1: the branch name, bold when the workspace has unread agent output.
- Line 2: a link icon for linked workspaces, the workspace name, then the error if setup
  or worktree creation failed.
- Left icon: spinner while an agent or the setup script runs; otherwise the PR state
  (green open, red failing checks, amber conflicts or running checks, purple merged);
  otherwise a branch icon.
- Right: `+N −M` against the target branch, and the unread dot.

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
- The composer border turns dashed accent in plan mode (⇧Tab).
- The ring next to Send shows how full the chat's context window is after the last turn.
  Clicking it opens a popover with the token counts and the agent's plan limits (5-hour
  and weekly).

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
