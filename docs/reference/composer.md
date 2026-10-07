---
title: Composer
parent: Reference
nav_order: 3
---

# Composer

The composer is the message box at the bottom of a chat. Enter sends. ⇧Enter adds a new line. Korev keeps an unsent draft for each chat.

## Mentions

| Type | Inserts |
| --- | --- |
| `@` | A file in the workspace. Git-ignored files are not listed. |
| `#` | An open pull request, as `#123`. |
| `/` | A slash command or skill. |

## Slash commands and skills

Type `/` to see:

- The built-in commands `/compact`, `/review` and `/init`.
- Commands in `.claude/commands/*.md`, in the repository and in your home folder.
- Claude Code skills: folders with a `SKILL.md` in `.claude/skills`, in the repository and in your home folder.

Korev puts the command in your message as text, and the agent runs it.

## Snippets

Save text you send often in **Settings → Snippets**. Insert one with ⌘; or **+ → Insert snippet**.

## Attachments

Press ⌘U, use **+ → Add attachment**, paste, or drag files into the composer. Korev saves them in the workspace's `.context/attachments/` and tells the agent to read them. Attachments work in workspace chats only.

## Chips under the composer

| Chip | Shortcut | What it does |
| --- | --- | --- |
| Model | ⌃⌘1 to ⌃⌘5 for the loadout | Picks the agent and model |
| Effort | ⌘⇧/ | Cycles the effort level |
| Fast mode | ⌘⇧E | Turns fast mode on or off |
| Plan mode | ⇧Tab | Turns plan mode on or off |

See [Agents and modes](../concepts/agents-and-modes.md).
