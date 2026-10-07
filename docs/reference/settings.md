---
title: Settings
parent: Reference
nav_order: 6
---

# Settings

Open Settings with ⌘, or from the bottom of the sidebar. Esc closes it.

## General

| Setting | Default | What it does |
| --- | --- | --- |
| Theme | System | System, Light or Dark. ⌘⌥T toggles between light and dark. |
| Notifications | On | Notifies you when an agent finishes or needs your input, while the Korev window is not in focus. Click a notification to go to the workspace. |
| Sound | On | Plays a sound with each notification. |
| Keep Mac awake | On | Keeps the Mac from sleeping while an agent runs. |
| Import from Conductor | | See [Import from Conductor](../guides/import-from-conductor.md). |

## Default models

| Setting | What it does |
| --- | --- |
| Default agent | The agent for new chats: Claude Code or Codex. |
| Model and effort | The default model and effort for each agent. |
| Review model | The agent, model and effort for **Review** chats. Default: Same as chats. |
| Loadout | Up to five models pinned to the top of the model picker. |
| Start chats in plan mode | New chats start in [plan mode](../concepts/agents-and-modes.md#plan-mode). |

## Agents

Shows whether each CLI is **Ready** or **Not installed**.

| Setting | Default | What it does |
| --- | --- | --- |
| Ask before tool calls | Off | Claude Code asks before each edit and command. See [Permissions](../concepts/permissions.md). |

## Git

| Setting | Default | What it does |
| --- | --- | --- |
| Branch prefix | Your GitHub login | The part before `/` in new branch names. |
| Name workspaces from the task | On | Claude Haiku names new workspaces from the task. |
| Archive on merge | Off | Archives a workspace when its pull request merges. |
| Delete branch on archive | Off | Deletes the branch when you archive a workspace. |

A repository's `[git]` table overrides these. See [Repository config](repository-config.md#git).

## Storage

**Workspaces location** is the folder that holds every worktree. Default: `~/korev/workspaces`.

## Snippets

Saved text you insert into the composer with ⌘;.

## Repositories

One page per repository:

- **Path**, with a copy button.
- **Use spotlight testing.** See [Spotlight testing](../guides/spotlight.md).
- **Default branch.** The target branch for new workspaces.
- **Scripts**: setup, run and archive. Also **Stop other workspaces' run scripts when one starts**.
- **Prompts**: General, Code review and Create pull request.
- **Remove repository** archives and deletes all of the repository's workspaces and chats. It does not delete the repository folder.

When the repository has a config file, its scripts and prompts replace the ones on this page. See [Repository config](repository-config.md).
