# korev

Korev is a Mac app that runs coding agents (Claude Code and Codex) in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.

To ask about code without starting a task, use **Ask**. The agent reads a shared checkout of each repository's default branch and cannot change anything. One Ask chat can cover several repositories. When you are ready to build what you discussed, press **Start workspace**: the new workspace's chat starts with the whole Ask conversation, and its agent continues from there.

A task that spans repositories (say a frontend and a backend) gets one linked workspace per repository, all on the same branch name. Pick several repositories on the New workspace page, or plan the change in an Ask chat and press **Start workspaces**. Each agent changes only its own repository and can read the linked ones.

## Requirements

- macOS.
- Node 24 and npm, the versions CI uses.
- The `claude` and `codex` CLIs on your PATH, signed in. Korev uses their own sign-in. You need only the agents you plan to use.
- `gh`, signed in. Korev uses it for pull requests, issues and checks.

## Run it

```sh
cd korev-desktop
npm ci
npm start
```

`npm start` runs Korev in development mode with Electron Forge and Vite. Changes to the renderer (`src/app`) reload in the window. Changes to the main process (`src/main`) need a restart: type `rs` in the terminal that runs `npm start`.

Korev keeps its state in `~/Library/Application Support/Korev`: `korev-state.json`, chat transcripts in `transcripts/`, and the shared Ask checkouts in `repos/`. The development build and the packaged app use the same directory.

## Package it

From the repository root:

```sh
make package       # builds korev-desktop/out/Korev-darwin-<arch>/Korev.app
make run           # quits the packaged Korev if it is running, then opens the build
make package-run   # both
```

To make a zip you can give to someone else, run `npm run make` in `korev-desktop`. The zip goes to `korev-desktop/out/make/zip/darwin/<arch>/`.

The build is not signed or notarized (see `TODOS.md`), so Gatekeeper blocks it on other Macs. To open it there, right-click the app and choose Open, or run `xattr -dr com.apple.quarantine Korev.app`.

To change the app icon, edit `korev-desktop/assets/icon.svg` and run `npm run icons`. It needs `rsvg-convert` and ImageMagick (`brew install librsvg imagemagick`).

## Project layout

| Path | What it holds |
| --- | --- |
| `korev-desktop/src/main` | Electron main process: git, worktrees, agents, pull requests, the state store |
| `korev-desktop/src/app` | React renderer: sidebar, workspace view, chat, settings |
| `korev-desktop/src/shared` | The API between the main process and the renderer, and the types both use |
| `korev-desktop/src/design-system` | Tokens, styles and shared UI components |
| `korev-desktop/e2e` | Playwright tests that drive the packaged app |
| `korev-desktop/test-support/bin/claude` | The fake `claude` CLI that the e2e tests run |
| `DESIGN.md` | How the app looks and behaves |
| `TODOS.md` | Features Korev does not have yet |

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

Run these in `korev-desktop`:

```sh
npm run typecheck   # tsc
npm run lint        # oxlint and oxfmt; npm run lint:fix applies the fixes
npm test            # Vitest unit tests
npm run test:e2e    # packages the app and drives it with a fake agent
```

CI runs the same checks, but only when you start it by hand:

```sh
gh workflow run ci.yml --ref <branch>
```

## Contributing

1. Make a branch from `main`. Do not commit to `main`.
2. Keep each pull request to one change. Put dependent work in a second pull request on top of the first.
3. Put unit tests next to the code they test (`foo.ts` and `foo.test.ts`). Add an e2e test when a flow goes across several screens.
4. Follow `DESIGN.md` for UI changes: semantic tokens only, one accent colour.
5. Run the checks above, then start CI on your branch.
6. Write the commit and pull request title as one sentence that says what the user sees change, for example "Keep the Mac awake while an agent is running". Pull requests are squash-merged.

For things to work on, see `TODOS.md`.
