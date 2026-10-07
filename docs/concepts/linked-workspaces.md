---
title: Linked workspaces
parent: Concepts
nav_order: 3
---

# Linked workspaces

A task that spans repositories, say a frontend and a backend, gets one linked workspace per repository. All of them use the same workspace name and branch name.

## Create linked workspaces

- On the New workspace page (⌘N), pick more than one repository in the repository picker.
- Or plan the change in a multi-repository [Ask](ask.md) chat and press **Start workspaces**.

**Create from…** (branch, pull request or issue) works with one repository only.

## What each agent can do

- Each agent changes only its own repository.
- It can read the linked workspaces. Korev gives Claude Code access with `--add-dir`.
- It is told to leave notes for the other agents in their `.context/` folders.

In the sidebar, linked workspaces sit next to each other and show a link icon. Hover it to see which workspaces are linked.
