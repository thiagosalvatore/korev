# TODOS

Features Korev does not have yet, roughly in the order they would help.

- **Tool approvals.** Agents run with full permissions (`bypassPermissions` for Claude,
  `workspace-write` sandbox for Codex). There is no way to ask before each tool call.
- **Composer extras.** Fast mode, model loadouts, steering a running turn, `#` PR
  mentions, voice input, snippets.
- **Diff viewer extras.** Split view, viewed state, GitHub review comments, editing in
  the diff, turn diffs.
- **Quick open (⌘P) and search in files (⌘⇧F).**
- **Spotlight testing, the in-app browser and Big Terminal Mode.**
- **Sign and notarize the macOS build.** Unsigned builds are blocked by Gatekeeper on
  other machines. Needs an Apple Developer ID certificate, `osxSign` + `osxNotarize` in
  `korev-desktop/forge.config.mts`, and the credentials as CI secrets.
