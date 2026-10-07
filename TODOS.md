# TODOS

Features Korev does not have yet, roughly in the order they would help.

- **Tool approvals for Codex.** `codex exec` cannot ask before a tool call. Korev runs Codex in its
  `workspace-write` sandbox (`read-only` in plan mode) instead.
- **Voice input.** macOS Dictation (press Fn twice) already works in the composer; there is no
  built-in speech-to-text.
- **Diff viewer extras.** Split view, viewed state, GitHub review comments, editing in
  the diff, turn diffs.
- **Quick open (⌘P) and search in files (⌘⇧F).**
- **Spotlight testing, the in-app browser and Big Terminal Mode.**
- **Sign and notarize the macOS build.** Unsigned builds are blocked by Gatekeeper on
  other machines. Needs an Apple Developer ID certificate, `osxSign` + `osxNotarize` in
  `korev-desktop/forge.config.mts`, and the credentials as CI secrets.
