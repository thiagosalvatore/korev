---
title: Import from Conductor
parent: Guides
nav_order: 5
---

# Import from Conductor

If you used [Conductor](https://www.conductor.build), Korev can take over your repositories and settings.

## Repository config

Korev reads Conductor's `.conductor/settings.toml` and `.conductor/settings.local.toml` as they are. They use the same format as `.korev/settings.toml`. A `.korev/settings.toml` in the same repository wins. See the [repository config reference](../reference/repository-config.md).

## Import your app settings

Open **Settings → General → Import from Conductor** and press **Import**. Korev reads:

- Conductor's repositories and their scripts. Korev uses the `sqlite3` command for this.
- `~/.conductor/settings.toml`: archive on merge, delete branch on archive, branch prefix, plan mode default and the Codex effort level.

A message tells you how many repositories it added and how many settings it changed.
