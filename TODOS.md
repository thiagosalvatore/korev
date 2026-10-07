# TODOS

Conductor features Korev does not have yet, roughly in the order they would help.

- **`.conductor/settings.toml`.** Korev reads the legacy `conductor.json` and its own
  per-repo scripts. Conductor's current format is TOML with several run scripts,
  `preview_urls`, prompts and git options. Needs a TOML parser dependency.
- **Files to copy.** Korev copies top-level gitignored `.env*` files into new workspaces.
  Conductor also honours `.worktreeinclude` and `file_include_globs`.
- **Create from a branch, PR or issue.** The new-workspace page only branches from the
  default branch.
- **Tool approvals.** Agents run with full permissions (`bypassPermissions` for Claude,
  `workspace-write` sandbox for Codex). Conductor can ask before each tool call.
- **Composer extras.** Fast mode, model loadouts, steering a running turn, `#` PR
  mentions, voice input, snippets.
- **Diff viewer extras.** Split view, viewed state, GitHub review comments, editing in
  the diff, turn diffs.
- **Quick open (⌘P) and search in files (⌘⇧F).**
- **Spotlight testing, the in-app browser and Big Terminal Mode.**
- **Sign and notarize the macOS build.** Unsigned builds are blocked by Gatekeeper on
  other machines. Needs an Apple Developer ID certificate, `osxSign` + `osxNotarize` in
  `korev-desktop/forge.config.mts`, and the credentials as CI secrets.
