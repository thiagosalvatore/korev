---
title: Installation
parent: Getting started
nav_order: 1
---

# Installation

## Requirements

- macOS.
- The `claude` and `codex` CLIs on your PATH, signed in. Korev uses their own sign-in. You need only the agents you plan to use.
- `gh`, signed in. Korev uses it for pull requests, issues and checks.
- Node 24 and npm, to build Korev from source.

Korev names workspaces and Ask chats with Claude Haiku through the `claude` CLI. If you use only Codex, names come from the first words of the task instead.

## Build the app

There is no download yet. Build Korev from the repository:

```sh
git clone https://github.com/thiagosalvatore/korev.git
cd korev
make package-run
```

`make package` builds `korev-desktop/out/Korev-darwin-<arch>/Korev.app`. `make run` quits the packaged Korev if it is running and opens the new build. `make package-run` does both. Move `Korev.app` to `/Applications` if you want to keep it.

To make a zip you can give to someone else, run `npm run make` in `korev-desktop`. The zip goes to `korev-desktop/out/make/zip/darwin/<arch>/`.

## Open an unsigned build on another Mac

The build is not signed or notarized, so Gatekeeper blocks it on other Macs. To open it, right-click the app and choose **Open**, or run:

```sh
xattr -dr com.apple.quarantine Korev.app
```

## Updates

Korev checks GitHub for a new release when it starts and every 6 hours. To check now, choose **Korev → Check for Updates…**. When a new version is out, a download button shows at the bottom of the sidebar. It opens the release notes. **Install and restart** downloads the new version, replaces `Korev.app` and opens it again. If agents are still working, Korev asks before it quits.

Korev replaces itself only when it can write to the folder that holds `Korev.app`. If it cannot, or if macOS runs it from a temporary location because you opened it straight from the DMG, **Install and restart** opens the release page instead. Move Korev to `/Applications` to update in place.

After an update, Korev shows the notes for the new version once.

## Check the agents

Open **Settings → Agents**. Each agent shows **Ready** or **Not installed**. If an agent shows **Not installed** but works in your terminal, see [Troubleshooting](../reference/troubleshooting.md).

## Where Korev keeps its files

| Path | What it holds |
| --- | --- |
| `~/Library/Application Support/Korev/korev-state.json` | Settings, repositories, workspaces and chats |
| `~/Library/Application Support/Korev/transcripts/` | Chat transcripts |
| `~/Library/Application Support/Korev/repos/` | Repositories added with **Clone from URL** |
| `~/korev/workspaces/<repo>/<workspace>` | Workspace worktrees. Change the location in **Settings → Storage** |
| `~/korev/workspaces/<repo>/.ask` | The shared checkout that Ask chats read |

Next: [create your first workspace](first-workspace.md).
