# Changelog

Korev shows the section of each version in its "What's new" window, so write for the people who use Korev.

## [Unreleased]

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
