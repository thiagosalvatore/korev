---
title: Permissions
parent: Concepts
nav_order: 5
---

# Permissions

{: .warning }
A workspace is a git worktree, not a sandbox. Without approvals, agents run with full permissions inside the workspace folder.

## Ask before tool calls

**Settings → Agents → Ask before tool calls** is off by default.

When it is on, Claude Code asks you before each edit and command. The chat shows **Allow &lt;tool&gt;?** with **Allow** and **Deny**. The workspace row shows that it is waiting, and Korev sends a notification.

Codex cannot ask before a tool call. It always runs in its `workspace-write` sandbox, and in its `read-only` sandbox in plan mode.

## What always asks

Whatever the setting:

- **Plans.** When Claude Code finishes a plan, you approve it or keep planning. See [Plan mode](agents-and-modes.md#plan-mode).
- **Questions.** When the agent asks a question, the chat shows **The agent has a question** with its options and an **Other…** field.
- **Ask chats.** The agent asks before it runs a command. See [Ask](ask.md).
