---
title: Configure your repository
parent: Guides
nav_order: 1
---

# Configure your repository

Tell Korev how to set up a new workspace, how to run your app in it, and how to clean up when you archive it.

## Share it or keep it local

You can set this up in two places:

- **In the repository.** Put a `.korev/settings.toml` in the repository and commit it. Everyone who uses Korev on the repository gets the same setup. A `.korev/settings.local.toml` next to it overrides it for you only; add it to `.gitignore`.
- **In the app.** Open **Settings → Repositories → your repo → Scripts**. These scripts are only on your Mac.

The repository file wins. When it exists, the settings page shows a notice that its scripts replace the ones in the app. See the [repository config reference](../reference/repository-config.md) for every key and the order Korev reads files in.

## Setup script

The setup script runs in every new or restored workspace, before the agent starts. Use it to install dependencies.

```toml
[scripts]
setup = "pnpm install"
```

It runs as `$SHELL -lc "<command>"` in the worktree. Its output is in the **Setup** tab of the terminal panel. If it fails, the workspace shows "Setup script failed (exit N)". Press **Rerun setup** to try again.

## Run scripts

A run script starts your app. Press **Run** in the **Run** tab, or ⌘R.

```toml
[scripts.run.web]
command = "pnpm dev --port $KOREV_PORT"
options = { cwd = "apps/web" }
default = true

[scripts.run.storybook]
command = "pnpm storybook -p $((KOREV_PORT + 1))"
```

- Use `$KOREV_PORT` so two workspaces never use the same port. Each workspace has ten ports from `$KOREV_PORT`.
- With more than one run script, the **Run** button has a menu. The one with `default = true` runs when you press ⌘R. Without a default, the first one runs.
- In the app, **Settings → Repositories → your repo → Scripts** has a **Run scripts** list. Give each script a name, for example `backend`, `frontend` or `mobile`. The first one runs when you press ⌘R.
- `auto_run_after_setup = true` under `[scripts]` starts the default run script when setup succeeds.
- `run_mode = "nonconcurrent"` under `[scripts]` stops the run scripts in your other workspaces of this repository when you start one.

## Preview URLs

Preview URLs show in the **Open** menu of the Run tab. Each one opens in your browser or in a Korev browser tab.

```toml
[[preview_urls]]
name = "Web"
url = "http://localhost:$KOREV_PORT"
```

Korev also detects `localhost` URLs that your run script prints.

## Archive script

The archive script runs when you archive a workspace, before Korev removes the worktree. Use it to stop containers or drop a test database. It has five minutes.

```toml
[scripts]
archive = "./scripts/archive.sh"
```

## Copy local files into new workspaces

A new worktree has only the files that git tracks. Korev copies gitignored files from the main checkout into each new workspace. By default it copies `.env*` files.

To copy other files, list glob patterns, one per line, in `file_include_globs`:

```toml
file_include_globs = ".env*\nconfig/*.local.json"
```

Or put the patterns in a `.worktreeinclude` file in the repository root. That file replaces `file_include_globs`. Korev copies only files that git ignores.

## Environment variables

Add variables for scripts, terminals and agents:

```toml
[environment_variables]
API_URL = "http://localhost:3000"
```

Korev adds its own `KOREV_*` variables too. See [Environment variables](../reference/environment-variables.md).

## Prompts

Add instructions to the prompts that Korev sends to the agent:

```toml
[prompts]
general = "Use pnpm, never npm."
create_pr = "Follow .github/pull_request_template.md."
code_review = "Use the review skill to review these changes."
```

`general` goes into every workspace chat in the repository. The others go into the matching button: `code_review` for **Review**, `create_pr` for **Create PR**, `fix_errors` for **Fix errors**, `resolve_merge_conflicts` for **Resolve conflicts**, and `rename_branch` for workspace naming.

In the app, the **Code review** prompt has a **Use a skill…** picker that fills in a skill for you.
