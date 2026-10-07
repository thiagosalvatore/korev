---
title: Spotlight testing
parent: Guides
nav_order: 4
---

# Spotlight testing

Some apps only run from the repository's own checkout. Spotlight lets you test a workspace's changes there.

## Turn it on

1. Turn on **Settings → Repositories → your repo → Use spotlight testing**, or set `spotlight_testing = true` in `.korev/settings.toml`.
2. In the workspace, open the **Run** tab and press **Spotlight**.

## What it does

About every second and a half, Korev copies the workspace's tracked changes into the root checkout. It does this by checking out a snapshot commit there. Run your app from the root checkout as usual.

Turning Spotlight off checks the root checkout out at its original branch again. Korev also turns it off when you archive the workspace or quit.

## Limits

- The root checkout must be clean, with no merge or rebase in progress.
- Spotlight syncs tracked files only.
