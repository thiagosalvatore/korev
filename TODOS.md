# TODOS

Features Korev does not have yet, roughly in the order they would help.

- **Tool approvals for Codex.** `codex exec` cannot ask before a tool call. Korev runs Codex in its
  `workspace-write` sandbox (`read-only` in plan mode) instead.
- **Sign and notarize the macOS build.** Unsigned builds are blocked by Gatekeeper on
  other machines. Needs an Apple Developer ID certificate, `osxSign` + `osxNotarize` in
  `korev-desktop/forge.config.mts`, and the credentials as CI secrets. Voice input then also
  needs the `com.apple.security.device.audio-input` entitlement for the hardened runtime.
