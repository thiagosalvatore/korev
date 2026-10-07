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

Three columns, like Conductor:

- **Left sidebar** (`--sidebar-w`): Search (⌘K), New workspace (⌘N), Ask, then the Ask
  chats, then one group per repository with its workspaces, then History (archived
  workspaces), then Add repository and Settings.
- **Centre**: the workspace header (workspace name, branch, target branch, Open in, PR number,
  the next git action), a tab strip (chats, Changes, open files) and the active tab.
- **Right panel** (`--panel-w`): the git panel (All files / Changes / Checks) on top and
  the terminal panel (Setup / Run / Terminal) below.

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
