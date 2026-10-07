# korev

Korev is a Mac app that runs coding agents (Claude Code and Codex) in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.

To ask about code without starting a task, use **Ask**. The agent reads a shared checkout of each repository's default branch and cannot change anything. One Ask chat can cover several repositories.

A task that spans repositories (say a frontend and a backend) gets one linked workspace per repository, all on the same branch name. Pick several repositories on the New workspace page, or plan the change in an Ask chat and press **Start workspaces**. Each agent changes only its own repository and can read the linked ones.

## Run it

```sh
cd korev-desktop
npm ci
npm start
```

Korev uses the `claude` and `codex` CLIs from your PATH and their own sign-in, and `gh` for pull requests, issues and checks.

## Repository config

Put a `.korev/settings.toml` in a repository to share its setup with everyone who uses Korev. A `.korev/settings.local.toml` next to it overrides it for you only; add it to `.gitignore`. Without either file Korev reads a simpler `korev.json`. Without that it reads Conductor's `.conductor/settings.toml` and `.conductor/settings.local.toml`, which use the same format, and without those it uses the scripts from Settings → Repositories.

```toml
file_include_globs = ".env*\nconfig/*.local.json"   # gitignored files copied into new workspaces
spotlight_testing = true            # shows the Spotlight button in each workspace's Run tab

[scripts]
setup = "pnpm install"
archive = "./scripts/archive.sh"
run_mode = "nonconcurrent"          # starting a run script stops the others in this repository
auto_run_after_setup = true

[scripts.run.web]
command = "pnpm dev --port $KOREV_PORT"
options = { cwd = "apps/web" }
default = true

[[preview_urls]]
name = "Web"
url = "http://localhost:$KOREV_PORT"

[environment_variables]
API_URL = "http://localhost:3000"

[prompts]
general = "Use pnpm, never npm."
create_pr = "Follow .github/pull_request_template.md."

[git]
archive_on_merge = true
branch_prefix_type = "custom"       # or "none"
branch_prefix = "agent"
```

A `.worktreeinclude` file in the repository root replaces `file_include_globs`. Without both, Korev copies gitignored `.env*` files.

Scripts and agents get `KOREV_WORKSPACE_NAME`, `KOREV_WORKSPACE_PATH`, `KOREV_WORKSPACE_ID`, `KOREV_ROOT_PATH`, `KOREV_DEFAULT_BRANCH` and `KOREV_PORT` (the first of 10 ports reserved for the workspace).

## Spotlight

Some apps only run from the repository's own checkout. Turn on Spotlight in a workspace's Run tab and Korev mirrors that workspace's tracked changes into the root checkout every second or so, by checking out a snapshot commit there. Turning it off checks the root out back at its original branch. It needs a clean root checkout and syncs tracked files only.

## Checks

```sh
npm run typecheck && npm run lint && npm test
npm run test:e2e   # packages the app and drives it with a fake agent
```
