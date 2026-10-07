---
title: Environment variables
parent: Reference
nav_order: 2
---

# Environment variables

Setup, run and archive scripts, terminals and agents in a workspace get these variables. They come after the repository's `[environment_variables]`, so a repository cannot override them.

| Variable | Value |
| --- | --- |
| `KOREV_WORKSPACE_NAME` | The workspace name |
| `KOREV_WORKSPACE_PATH` | The worktree path |
| `KOREV_WORKSPACE_ID` | The workspace id |
| `KOREV_ROOT_PATH` | The repository's main checkout |
| `KOREV_DEFAULT_BRANCH` | The workspace's target branch |
| `KOREV_PORT` | The first of the ten ports reserved for the workspace |
| `KOREV_IS_LOCAL` | `1` |

Agent processes also get `KOREV_SESSION_ID`.

Ask chats do not run in a workspace, so they get none of these.

## Ports

`KOREV_PORT` starts at 55000 and goes up in steps of ten, one block per active workspace. A workspace owns `$KOREV_PORT` to `$KOREV_PORT+9`. A restored workspace gets a new block.

In scripts, the shell expands `$KOREV_PORT` and `$((KOREV_PORT + 1))`. In `preview_urls`, Korev expands them itself.

## Variables Korev removes

Korev removes `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN` from everything it starts, so `gh` uses its own sign-in.
