# Changelog

Korev shows the section of each version in its "What's new" window, and korev.ai/changelog shows every version, so write for the people who use Korev. Under each version, write a one-sentence summary, then a `### New` list and a `### Fixed` list. Leave out a list that has no entries. Start each entry under New with a short bold title, such as `**Grid view.**`. An entry goes under Fixed when it describes something that did not work before.

## [Unreleased]

## [0.22.0] - 2026-10-26

Turn on hands-free mode with ⌘⇧H to talk to Korev and hear when an agent needs you.

### New

- **Hands-free mode.** Talk to Korev and hear when an agent needs you. Korev says out loud when an agent asks a question, has a plan ready, wants to run a tool, or finishes. To turn it on, press ⌘⇧H, click the microphone at the top of the sidebar, or pick **Hands-free mode** in the command palette (⌘K). The first time, Korev downloads its voice model of 550 MB. Start each sentence with "Korev", for example "Korev, create a new workspace on the acme-web repo to plan a login page", "Korev, option two" or "Korev, approve the plan". Or say "Korev", wait for the chime, then say the command. Korev ignores everything that does not start with "Korev". It needs the `claude` CLI, even when your agent is Codex.

## [0.21.0] - 2026-10-25

Automations open workspaces on pull requests that are already open, and file links say why a file can't be shown.

### New

- **Automations open pull requests.** When an automation finds work on a pull request that is already open, the workspace it opens checks out that PR's branch and tracks the PR. Before, it always made a new branch, so the workspace had no link to the PR.

### Fixed

- An automation opens every workspace its run asks for. Before, a run opened at most five and skipped the rest.
- The runs on the Automations page wrap their workspace buttons inside the card. Before, a run with many workspaces ran past the card's edge.
- A file link in a chat that Korev can't show, such as a video, now says why: the file is missing, or it is too big or not text. For a file that is too big or not text, it offers **Open outside Korev**. Before, every case said only "This file can't be shown here," and small binary files showed as garbled text.
- A new workspace in a repo with no commits now opens. Korev makes an empty first commit on the base branch. Before, it failed with "invalid reference: main".

## [0.20.0] - 2026-10-23

Run automations at set times of day and on chosen weekdays, and start from an example.

### New

- **Automation schedules.** Run an automation at set times, such as 09:00 and 17:30, or repeat it every few minutes or hours. Pick the days it runs on, such as weekdays only, and limit a repeating automation to a time window, such as 09:00 to 18:00. Each automation shows when its next run starts. Before, an automation could only repeat every few minutes, every day.
- **Automation examples.** With no automations yet, the Automations page says what an automation does and offers three examples to start from, such as a morning review of your pull requests.

### Fixed

- A workspace whose setup script fails shows the spinner while its agent works, next to the "Setup script failed" text. Before, it showed only the red triangle, so it looked like nothing was running.
- A new workspace no longer starts a shell in the side panel by itself. The shell starts when you click **Terminal**.

## [0.19.0] - 2026-10-22

Run prompts on a timer with Automations, and answer agent questions and plans from the message box.

### New

- **Automations.** Click **Automations** in the sidebar to run a prompt every few minutes while Korev is open, for example "check my support tickets". At the end of each run the agent lists the workspaces to open, and Korev opens them in the repositories you picked. Each workspace has a key, such as a ticket id, and Korev never opens two workspaces with the same key. The Automations page shows what each run did, and each run's chat.
- **Questions above the message box.** When an agent asks a question, it shows in a panel right above the message box, on the desktop and the phone. Pick options, type your own answer in the message box, or both, then press send. Before, the question was a card in the chat with its own text field.
- **Plan feedback from the message box.** While a plan waits for review, what you send from the message box goes to the agent as feedback on the plan, so you can use @files, #PRs, /commands and attachments in it. The plan card no longer has its own text box.

### Fixed

- Agent questions show their markdown, such as bold text, lists and code, on the desktop and the phone. Before, they showed the raw characters and lost their line breaks.

## [0.18.0] - 2026-10-22

Share a chat as one HTML file, reuse worktrees from a pool, and find chats by what was said in them.

### New

- **Share a chat.** Press **Share chat** at the right of the tab bar, or in an Ask chat's header, to save the chat as one HTML file. Anyone can open it in a browser. It has your messages, the agent's answers, plans and each tool call, but not tool output or thinking.
- **Worktree pool.** Set **Worktree pool** in a repository's settings, or `worktree_pool_size` in `.korev/settings.toml`, and new workspaces reuse free worktrees instead of creating one each time. A reused worktree keeps its gitignored files, such as `node_modules`, so setup is fast. Archiving a workspace frees its worktree for the next one.
- **Search chat history.** The command palette (⌘K) now finds chats by what you and the agent wrote in them, not only by workspace name. Type a PR number such as `#292` to find the chats that mention or link that PR, and the workspace that tracks it.
- **Recent repositories.** The repository pickers on desktop and on the phone list up to three repositories you used recently first, marked **Recent**, then every other repository by name. Ask from the sidebar now starts with no repository picked, so you choose one. Ask from a repository's row still picks that repository.

### Fixed

- A workspace whose git hook, such as `post-checkout`, fails after the checkout now starts: Korev runs the setup script, sends the first message and shows the hook's output as a warning. Before, the workspace showed as failed.

## [0.17.0] - 2026-10-21

Review a teammate's pull request from Ask, and retry a failed workspace in place.

### New

- **Review a pull request.** Press ⌘⇧R, press **Review a pull request** on the Ask page, or choose **Review a pull request…** in the command palette, and pick a teammate's pull request. Korev opens a read-only Ask about it, with the pull request already in the message. Say what to review, or type `/` to run a review skill.

### Fixed

- **Try again** on a workspace that failed to start creates that workspace again in place and sends the task. Before, it archived the workspace and opened the New workspace page, so you had to create it again by hand.
- A composer that opens with text already in it puts the cursor at the end of that text. Before, what you typed went in front of it.

## [0.16.2] - 2026-10-21

Workspaces start on machines that set a custom CA bundle in the login shell.

### Fixed

- Korev now passes the CA certificate variables from your login shell (`SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `GIT_SSL_CAINFO`) to git, its hooks and agents. Before, a hook that installs packages, such as `pnpm install`, could fail with a certificate error, and the workspace showed as failed.

## [0.16.1] - 2026-10-21

A workspace that fails to start shows a short error and a Try again button.

### Fixed

- When Korev cannot create a workspace, it shows only the end of git's output, in a box that scrolls. Before, a long error from git or a repository hook pushed the task and the Archive button off the screen. **Try again** archives the failed workspace and opens a new one with the same task.

## [0.16.0] - 2026-10-20

Get a pull request or a whole stack explained in plain words before you review it.

### New

- **Explain a pull request.** Press **Explain** in the Changes tab, or choose **Explain a pull request…** in the command palette or on the Ask page, to get a walkthrough of a change in plain words. It has a one-sentence summary, before and after, the steps in the order that makes sense with the real code under each one, what to look at closely, questions for the author and the words it uses. A teammate's pull request opens in a read-only Ask chat, so nothing is checked out. Korev lists every changed file the explanation leaves out, and offers **Update** when the change moves on. Switch to **Chat** to ask the agent about it.
- **Explain model.** **Settings → Default models → Explain model** picks the agent, model and effort for explanations, apart from the review model.
- **Explain a stack.** When a pull request builds on other open pull requests, Korev explains it together with every pull request below it. **The stack** section says what each pull request adds, and each walkthrough step shows the pull request its code comes from.
- **Explanations on your phone.** A chat with an explanation opens on it in the phone app too, with an Explanation and Chat switch. Tap **Explain** on the pull request bar of a workspace, or the book icon on the Ask tab to pick a pull request that waits for your review. Tap an underlined word to see what it means.
- **Share an explanation.** **Export HTML** saves the explanation as one HTML file that opens in any browser, in light or dark, with no scripts. Send it to someone who does not use Korev or attach it to the pull request.

## [0.15.0] - 2026-10-15

Let one agent run a team of other agents, and see every workspace on one board.

### New

- **Agent board.** Click **Board** in the sidebar or press ⌘⇧B to see every workspace from every repository in four columns: Needs you, Working, Done and Idle. Each card shows the branch, the pull request step and the last line the agent wrote. Click a card to open the workspace.
- **Orchestration.** Ask a workspace agent to coordinate a job. It splits the job into tasks, starts a worker agent in a linked workspace for each one, and gets each worker's report back in its chat. Workers can message and ask the coordinator. Turn it off in Settings → Agents.
- **Runs page.** Runs in the sidebar lists each run's tasks, their state, their workers and their reports. Resume a task that stopped when Korev quit.
- **Decisions.** An agent can ask you to choose between options before a task goes on. Pick in the chat, on the Runs page or in the phone app.

## [0.14.0] - 2026-10-15

Put workspaces in folders, give them names, and copy code blocks with one click.

### New

- **Folders in a repository.** Put workspaces of one repository in a folder from the workspace's menu, or drag a workspace onto a folder. Click a folder to collapse it. Lanes that you split off a plan go into a folder named after the workspace that made the plan.
- **Rename a workspace.** Choose **Rename** in the **…** menu of a workspace in the sidebar and type any name. The name shows under the branch in the sidebar, in the workspace header and in the phone app. The branch and the worktree folder stay the same.
- **Copy code blocks.** Hover a code block in a chat, plan or markdown file and click the copy button in its corner to copy the code.
- **Sub-agent tool calls.** When Claude starts a sub-agent, the tool calls of the sub-agent show under its Task row in the chat. They are collapsed to a count, such as "12 tool calls". Click the count to see them. The phone app does not show them.

## [0.13.1] - 2026-10-15

Files in the file viewer show the right colors for their language.

### Fixed

- The file viewer highlights code in every common language, such as SQL, Rust and YAML. Before, it used TypeScript colors for most files, and comments and strings over several lines lost their color.
- Cmd+A in the file viewer selects only the file. Before, it selected the whole window.
- Branch names in inline code, such as `origin/main`, are no longer links. Before, a click tried to open a file with that name.

## [0.13.0] - 2026-10-14

See the files that agents save in a new Artifacts tab, and see markdown as you type it.

### New

- **Plans saved as files.** Korev saves each plan in the workspace's `.context/plans` folder, under a name taken from the plan's title.
- **Artifacts.** The new Artifacts tab in the right panel lists the plans, notes and images that agents save in the workspace's `.context` folder. Click one to open it, or right-click it to reveal it in Finder or open it in its default app. Drag one into the message box, or type `@` and its name, to point the agent at it.
- **One pull request tab.** The right panel's Checks and Comments tabs are now one tab, named after the pull request's number. It shows the checks first and the review comments under them.
- **Markdown in your messages.** Your own messages in the chat show their formatting, like the agent's answers do. The Copy button on an agent's answer is now under its text.
- **Markdown in the message box.** The message box shows bold, code, headings and links in color as you type. The markdown stays visible and you can edit it.

## [0.12.0] - 2026-10-13

Copy an agent's answer from the chat with its formatting.

### New

- **Copy agent answers.** Hover an agent's answer in the chat and click Copy. Editors and terminals paste the markdown. Slack, Docs and Notes paste the headings, lists and code.

### Fixed

- `git log` shows commits that agents sign with the Korev key as verified. Before, git showed the key as unknown. If you turned on "Sign agent commits with a Korev key" before this version, turn it off and on again once.
- When a plan starts with work that every lane needs, the agent does that work first. It splits the work into lanes in a second plan, so each lane gets the results. In a task in several repositories, the other workspaces wait until that second plan.

## [0.11.0] - 2026-10-10

Agents can sign commits while your Mac is locked.

### New

- **Sign commits while your Mac is locked.** Turn on "Sign agent commits with a Korev key" in Settings. Korev makes a key in the Secure Enclave of your Mac and adds it to your GitHub account as a signing key. Agents then sign their commits with this key, also when your Mac is locked. Your own terminal keeps its signing setup. When an agent commit fails to sign and the setting is off, the chat shows a notice that points to the setting.

### Fixed

- Agents can sign commits with Secretive or another SSH agent that your shell profile sets. Before, signing failed when you opened Korev from the Dock.

## [0.10.0] - 2026-10-10

A task in several repositories gets one plan, and each repository gets its own part of it.

### New

- **One plan for several repositories.** When you pick more than one repository for a new workspace, only the agent in the first repository starts. It reads every repository and writes one plan, with one lane for each repository that needs changes. The other workspaces wait. When you approve the plan, each lane goes to the workspace of its repository. On the lanes card, you can choose the repository of each lane.
- **One sidebar entry for linked workspaces.** Workspaces that are linked across repositories show once in the sidebar, under the repository of the first workspace. Each row shows its repository name. A workspace that waits shows "Waits for the plan in" and the name of that repository. The next version of the phone app shows the same entry.
- **Reorder from your phone.** In the next version of the phone app, long-press a repository or folder on the Workspaces tab, then drag the grips to change the order. The phone app needs this version on your Mac to do this.
- **Review your pull requests.** The Review button gives the agent the open pull requests of the workspace. The agent reviews each pull request against its own base branch, so a stack of pull requests gets a correct review.
- **Clickable pull requests.** When an agent reply mentions a pull request as "#239", "owner/repo#5" or a link, click it to open the pull request. This works on your Mac and in the phone app. "#239" links only when the repository is on GitHub.
- **Shorter names.** Branch names that the AI makes have 1 to 3 words, and chat titles have 2 to 4 words.

### Fixed

- Codex can reach GitHub in Plan mode and Ask chats. Before, commands such as `gh pr view` failed with "error connecting to api.github.com".
- Scrollbars are thin and dark in dark mode. Before, when macOS always showed scrollbars, they were wide and light, and the tab strip had a white scrollbar.
- Korev saves its state correctly when you quit. Before, the save could fail if Korev was already saving at that time.
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
