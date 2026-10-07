# korev

Korev is a Mac app that runs coding agents (Claude Code and Codex) in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.

**Docs: https://thiagosalvatore.github.io/korev** — how workspaces, Ask, linked workspaces and the agents work, how to configure a repository, and every setting and shortcut.

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

Korev keeps its state in `~/Library/Application Support/Korev`: `korev-state.json`, chat transcripts in `transcripts/`, and repositories added with **Clone from URL** in `repos/`. The development build and the packaged app use the same directory. Workspaces and the shared Ask checkouts live in `~/korev/workspaces` (Settings → Storage).

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
| `docs` | The docs site, built by GitHub Pages |
| `korev-desktop/e2e` | Playwright tests that drive the packaged app |
| `korev-desktop/test-support/bin/claude` | The fake `claude` CLI that the e2e tests run |
| `DESIGN.md` | How the app looks and behaves |
| `TODOS.md` | Features Korev does not have yet |

## Repository config

Put a `.korev/settings.toml` in a repository to set up its workspaces: setup, run and archive scripts, preview URLs, files to copy, environment variables, prompts and git options. See [Configure your repository](https://thiagosalvatore.github.io/korev/guides/configure-your-repository.html) and the [config reference](https://thiagosalvatore.github.io/korev/reference/repository-config.html).

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
6. Update `docs/` when you change what the user sees. GitHub Pages publishes it from `main`. To preview it, run `make docs` and open http://localhost:4000/korev/. It needs Docker.
7. Write the commit and pull request title as one sentence that says what the user sees change, for example "Keep the Mac awake while an agent is running". Pull requests are squash-merged.

For things to work on, see `TODOS.md`.
