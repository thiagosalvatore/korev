---
title: Checkpoints
parent: Reference
nav_order: 4
---

# Checkpoints

Before each message you send in a workspace, Korev saves a checkpoint of the worktree. A checkpoint holds tracked and untracked files. Korev keeps it as a commit under `refs/korev/checkpoints/`, so it does not change your branch or your staged files.

## Revert to a message

Hover a message you sent and press **Revert to before this message**. Then confirm with **Reset chat**. Korev:

1. Restores the files from the checkpoint taken before that message.
2. Removes that message and everything after it from the chat.
3. Puts the message text back in the composer, so you can change it and send it again.

Stop the agent before you revert.

## Turn changes

After each agent turn, the chat shows "N files changed". Click it to open **Turn changes**: a diff of what that turn changed, from one checkpoint to the next.

## Archive snapshots

Archiving a workspace saves a snapshot too. When you unarchive the workspace, Korev restores it.
