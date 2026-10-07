---
title: Create from a branch, PR or issue
parent: Guides
nav_order: 2
---

# Create from a branch, PR or issue

On the New workspace page (⌘N), press **Create from…** or ⌘I. Pick one repository first; this works with one repository only.

The picker has three tabs: **Branches**, **Pull requests** and **GitHub issues**. Press Tab and ⇧Tab to switch tabs, and type to search.

## Branches

Korev checks out the branch you pick in a new workspace. It uses the local branch, or tracks `origin/<branch>` if there is no local one. The workspace is named after the last part of the branch name.

## Pull requests

Korev checks out the pull request with `gh pr checkout`. The workspace is named `pr-<number>`, and its target branch is the pull request's base branch.

## GitHub issues

Korev creates a new branch named `<number>-<issue title>`. The first message to the agent holds the issue's title, link and body, plus anything you type. If you type nothing, the agent gets "Work on this issue."
