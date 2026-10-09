# Changelog

Korev shows the section of each version in its "What's new" window, and korev.ai/changelog shows every version, so write for the people who use Korev. Under each version, write a one-sentence summary, then a `### New` list and a `### Fixed` list. Leave out a list that has no entries. Start each entry under New with a short bold title, such as `**Grid view.**`. An entry goes under Fixed when it describes something that did not work before.

## [Unreleased]

## [0.10.0] - 2026-10-09

Pull request numbers in agent replies open the pull request, and Codex can commit in a workspace.

### New

- **Clickable pull requests.** When an agent reply mentions a pull request as "#239", "owner/repo#5" or a link, click it to open the pull request. This works on your Mac and in the phone app. "#239" links only when the repository is on GitHub.

### Fixed

- Codex can commit in a workspace. Before, `git add` failed with an error about `index.lock`.
- You can create a workspace from a pull request when a local branch with the same name already exists. Before, this failed with "Not possible to fast-forward" if the pull request had changed since you last worked on it.
- Search, New workspace, Ask and Grid in the sidebar stay highlighted while they are open.

## [0.9.1] - 2026-10-09

Notifications say what happened and in which workspace.

### New

- **Clearer notifications.** The title of a notification now says what happened: "Agent finished", "Agent failed" or "Agent needs your input". The text under it names the workspace. When an agent fails, the text also shows the error. Before, the title and the text often said nearly the same thing.

## [0.9.0] - 2026-10-09

Your phone gets a notification when an agent finishes or needs your input.

### New

- **Notifications on your phone.** A phone that is paired with the Korev app gets a notification when an agent finishes or needs your input while the Korev window is not in focus. Tap the notification to open its workspace. The message holds the workspace name and the chat title, and it passes through Expo and Apple or Google. **Revoke all** in **Settings → Remote access** stops the notifications too.
- **Works with the new phone app.** The newest Korev phone app needs this version on your Mac. With an older version, the phone app shows that it cannot reach your Mac.
- **Choose repositories with the keyboard.** When you press ⌘N and no repository is chosen, the repository list opens with the search box ready. Type to filter, use ↑ and ↓ to move, and press Space to check or uncheck a repository. Enter closes the list and moves you to the message box. If no repository is checked yet, Enter chooses the highlighted one.
- **New and Fixed in What's new.** The "What's new" window splits each version into new features and fixes, and links to every version on korev.ai/changelog.

### Fixed

- When you click a Mac notification, Korev opens its workspace. Before, the click sometimes only brought Korev to the front.
- The spinner next to a workspace stays on while its agent works. Before, it went off when the repository's setup script finished, even if the agent was still working.

## [0.8.0] - 2026-10-09

The grid view shows chats and terminals from several workspaces side by side.

### New

- **Grid view.** The new grid view shows chats and terminals from different workspaces side by side, in a 2×1, 1×2 or 2×2 layout. Click **Grid** in the sidebar or press ⌘G. Drag a workspace from the sidebar onto a pane, or click **Choose workspace** in an empty pane. The menu in the pane header switches the pane to another chat or terminal, or opens a new one. **Open in full view** on a pane opens that tab in its workspace, and ⌘G brings you back to the grid. The sidebar highlights the workspace of the pane you work in.
- **Ask in the grid.** A grid pane can show an Ask chat. Drag one from the sidebar onto a pane, or click **Ask** in an empty pane and start a new ask or pick a recent one.
- **Ask without a repository.** Clear all repositories in the Ask picker, and the agent answers in an empty folder.
- **Pairing finishes by itself.** The **Pair a device** dialog closes when your phone connects, and Korev shows the name of the new device.

### Fixed

- When you create a workspace from a pull request whose branch is already checked out in another worktree, Korev uses that worktree. Before, this failed with git's "already used by worktree" error.

## [0.7.0] - 2026-10-08

Remote access works from any Tailscale network, and each agent has its own settings tab.

### New

- **Remote access from any Tailscale network.** Remote access works whatever network your Mac's Tailscale app is on. Korev joins your phone's Tailscale network as its own device, so you can keep the Mac on your employer's network. The first time, click **Sign in** next to **Tailscale** in **Settings → Remote access**. Phones you paired before must scan the code again.
- **A settings tab for each agent.** **Settings → Agents** has a tab for each agent. It shows if the agent is connected, not signed in or not installed. Click **Refresh** after you sign in, so you do not have to restart Korev. Model menus show only the agents you can use.

### Fixed

- When you open a branch that is already checked out in another worktree, Korev uses that worktree for the workspace. Before, this failed with git's "already used by worktree" error. Files that are already in the worktree, such as .env, stay as they are.

## [0.6.0] - 2026-10-08

Pull request comments get their own tab, and plans are easier to review.

### New

- **Comments tab.** Pull request comments have their own Comments tab, next to Checks. Replies show in their thread, and you can switch between comments from people and comments from bots. "Open as tab" shows the comments next to your chats, with more room to read.
- **Speak your plan feedback.** The plan feedback box has the microphone and ⌘⇧S, like the chat. Enter sends your feedback, and Shift+Enter adds a new line.
- **Read a plan again.** After you approve a plan or send it back, click the "Plan" line to read the plan again.
- **You choose the repository.** ⌘N and the New workspace button no longer choose a repository for you, so a new workspace does not go into the wrong one by mistake. If you have only one repository, Korev still chooses it.
- **One Merge button.** The Checks tab no longer has its own Merge button. Use the button in the workspace header or the command palette.
- **Hourly update checks.** Korev checks for a new version every hour. Before, it checked every 6 hours.

### Fixed

- Comments on the pull request itself and review summaries now show too. Before, Korev showed only comments on lines of code, and none at all on pull requests with more than 30 of them.
- Your message shows in the chat as soon as you press Enter. Before, on a large repository, it stayed in the box for a moment.
- The "…" menu on a workspace in the sidebar no longer closes when the pointer leaves the row.

## [0.5.0] - 2026-10-08

Small fixes to the workspace header, the sidebar menus and archiving.

### New

- **Keep after merge in the header.** The workspace header has a "Keep after merge" toggle next to the target branch. It stays in sync with the toggle in the workspace's "…" menu in the sidebar.

### Fixed

- A "…" menu low in the sidebar is no longer hidden under History and the footer. When there is no room below it, the menu opens upward.
- When you archive a workspace, Korev shows "Archiving" and a spinner until the archive is done. Before, the Changes tab filled with deleted files while the workspace was removed.

## [0.4.0] - 2026-10-08

Korev tells you about new versions and installs them for you.

### New

- **Update notes.** When a new version of Korev is out, Korev tells you with a window that shows what changed. Before, the only sign was a small icon at the bottom of the sidebar.
- **Automatic updates.** Korev installs updates with the macOS updater that Electron includes. Before it installs a new version, it checks that Apple signed it for Korev.
- **Voice model download.** When you click the microphone or press ⌘⇧S and the voice model is not on your Mac yet, Korev asks before it downloads the model (about 550 MB). It shows the progress, then a "Start voice input" button.
- **Search GitHub in Create from.** In "Create from", the PR and issue tabs search GitHub. You can find any open PR or issue by its number or its text, not only the 50 newest.
- **Keep after merge.** With archive on merge turned on, you can keep a workspace after its PR merges. Click "Keep after merge" on the New workspace page, or use the workspace's "…" menu in the sidebar.

## [0.3.0] - 2026-10-08

Korev now opens like any other Mac app.

### New

- **Signed and notarized.** Korev is signed and notarized by Apple. A download opens like any other app, with no Open Anyway step.
- **Shorter sidebar.** A repository with no active workspace starts collapsed in the sidebar, so it takes one row. A repository with workspaces still starts open.

### Fixed

- Lists in "What's new" and in agent replies show bullets and numbers.

## [0.2.0] - 2026-10-08

Speak to your agents instead of typing.

### New

- **Voice input.** Click the microphone next to Send, or press ⌘⇧S, in a workspace chat, a new workspace or Ask. Korev turns your speech into text on your Mac with a local Whisper model. It understands Portuguese, English, and both in one sentence. The first time, Korev downloads the model (about 550 MB).
- **Voice input on your phone.** The phone app has the same microphone. Your Mac turns the recording into text.
- **Choose the language.** If Korev picks the wrong language on a short clip, set it in Settings → Voice input.

### Fixed

- A download from the releases page no longer opens as "Korev is damaged". macOS still asks before the first open: go to System Settings → Privacy & Security and click Open Anyway.

## [0.1.0] - 2026-10-07

The first release of Korev.

### New

- **Parallel agents.** Run Claude Code and Codex in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.
- **Ask.** Ask about a repository without changing it, then start a workspace from the conversation.
- **Review and merge.** Review the diff, leave line comments for the agent, and go from **Create PR** to **Merge** and **Archive** from the workspace header.
- **Repository settings.** Configure setup and run scripts, preview URLs and environment variables per repository in `.korev/settings.toml`.
- **Korev on your phone.** Use Korev from your phone over Tailscale.
