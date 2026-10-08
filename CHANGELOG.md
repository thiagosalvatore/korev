# Changelog

Korev shows the section of each version in its "What's new" window, so write for the people who use Korev.

## [Unreleased]

- Pull request comments have their own Comments tab, next to Checks. Replies show in their thread, and you can switch between comments from people and comments from bots. "Open as tab" shows the comments next to your chats, with more room to read.
- Comments on the pull request itself and review summaries now show too. Before, Korev showed only comments on lines of code, and none at all on pull requests with more than 30 of them.

## [0.5.0] - 2026-10-08

Small fixes to the workspace header, the sidebar menus and archiving.

- The workspace header has a "Keep after merge" toggle next to the target branch. It stays in sync with the toggle in the workspace's "…" menu in the sidebar.
- A "…" menu low in the sidebar is no longer hidden under History and the footer. When there is no room below it, the menu opens upward.
- When you archive a workspace, Korev shows "Archiving" and a spinner until the archive is done. Before, the Changes tab filled with deleted files while the workspace was removed.

## [0.4.0] - 2026-10-08

Korev tells you about new versions and installs them for you.

- When a new version of Korev is out, Korev tells you with a window that shows what changed. Before, the only sign was a small icon at the bottom of the sidebar.
- Korev installs updates with the macOS updater that Electron includes. Before it installs a new version, it checks that Apple signed it for Korev.
- When you click the microphone or press ⌘⇧S and the voice model is not on your Mac yet, Korev asks before it downloads the model (about 550 MB). It shows the progress, then a "Start voice input" button.
- In "Create from", the PR and issue tabs search GitHub. You can find any open PR or issue by its number or its text, not only the 50 newest.
- With archive on merge turned on, you can keep a workspace after its PR merges. Click "Keep after merge" on the New workspace page, or use the workspace's "…" menu in the sidebar.

## [0.3.0] - 2026-10-08

Korev now opens like any other Mac app.

- Korev is signed and notarized by Apple. A download opens like any other app, with no Open Anyway step.
- A repository with no active workspace starts collapsed in the sidebar, so it takes one row. A repository with workspaces still starts open.
- Lists in "What's new" and in agent replies show bullets and numbers.

## [0.2.0] - 2026-10-08

Speak to your agents instead of typing.

- Click the microphone next to Send, or press ⌘⇧S, in a workspace chat, a new workspace or Ask. Korev turns your speech into text on your Mac with a local Whisper model. It understands Portuguese, English, and both in one sentence. The first time, Korev downloads the model (about 550 MB).
- The phone app has the same microphone. Your Mac turns the recording into text.
- If Korev picks the wrong language on a short clip, set it in Settings → Voice input.
- A download from the releases page no longer opens as "Korev is damaged". macOS still asks before the first open: go to System Settings → Privacy & Security and click Open Anyway.

## [0.1.0] - 2026-10-07

The first release of Korev.

- Run Claude Code and Codex in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.
- Ask about a repository without changing it, then start a workspace from the conversation.
- Review the diff, leave line comments for the agent, and go from **Create PR** to **Merge** and **Archive** from the workspace header.
- Configure setup and run scripts, preview URLs and environment variables per repository in `.korev/settings.toml`.
- Use Korev from your phone over Tailscale.
