# TODOS

Features Korev does not have yet, roughly in the order they would help.

- **Tool approvals for Codex.** `codex exec` cannot ask before a tool call. Korev runs Codex in its
  `workspace-write` sandbox (`read-only` in plan mode) instead.
- **Read-only linked workspaces for Codex.** Codex gets every linked worktree as a `writable_roots`
  entry (`agents.ts`), so a Codex lead that plans a task across repositories can edit the other
  repositories before their lanes start. Split `addDirs` into readable and writable directories, and
  keep the git directories writable so Codex can still commit.
