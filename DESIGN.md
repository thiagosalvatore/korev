# Korev design

How the Korev desktop app looks and behaves. The tokens live in
`korev-desktop/src/design-system/styles/tokens.css`; this file says how to use them.
The design-system gallery shows every component in both themes (run the app in dev
and open `#gallery`).

## Tokens

- **Use semantic tokens only.** Surfaces `bg-app` → `bg-surface` → `bg-raised`, with
  `bg-hover` and `bg-active` for interaction. Text `fg-1` (primary) → `fg-2` → `fg-3`
  (secondary, metadata, column headers). Borders `border-1` (hairlines) and `border-2`
  (controls). Never use a hex value or a raw palette step (`gray-600`, `cobalt-500`) in
  app code.
- **One accent.** Cobalt (`accent`, `accent-text`, `accent-subtle`) marks the selected
  thing, the primary action and the stack label. It never means "good" or "bad".
- **Status colours carry meaning.** `danger` = needs you now, `warning` = attention
  soon, `success` = done or ready, neutral (`bg-active` + `fg-2`) = informational.
- **Layout.** `--sidebar-w` 248px, `--topbar-h` 48px, `--panel-w` 380px. Rows are at
  least 52px tall.
- **Motion.** `--dur-fast` for hover and press, `--dur-base` for fades. Rows never
  animate when the list reorders. Spinners stop under `prefers-reduced-motion`.
- **Themes.** Dark is the default token set; `[data-theme='light']` overrides it. The
  app follows the macOS appearance unless Settings → Appearance overrides it.

## Badge roles

| Badge | Use | Tone |
| --- | --- | --- |
| Reason chip | Why a PR is in its section ("2 checks failing") | danger / warning / neutral / success, from the reason's severity |
| P-badge | Suggested priority of a review request (P1–P3) | P1 danger, P2 warning, P3 neutral |
| `SizeBadge` | Size of a PR (S/M/L), lockfiles excluded | always neutral |
| Draft | Only mark shown on a review request row | outline |
| Approved | Priority column of an "Already approved" row when a person approved | success |
| Bot approved | Priority column of an "Already approved" row when only bots approved | neutral |
| Action chip | My PR row while Korev acts on it: "Merging…" / "Closing…" (with `loader`), "Still merging on GitHub", "Merge failed", "Close failed" | neutral, or danger for a failure |
| Task chip | Row while Korev's agent works on the PR: "Explaining…", "Fixing conflicts…", "Fixing CI…", "Addressing comments…", "Reviewing…", or "Queued" while it waits for one of the two run slots (with `loader`); "<Task> failed" | neutral, or danger for a failure |
| Queue chip | "In Trunk queue" / "In merge queue" (In progress); "Removed from Trunk queue" (Needs you) | neutral / warning |
| Section count | Section header count in Open | Needs you danger, Korev working and In progress mono `fg-2` |
| Stack | Header of a stack group | accent |
| Sidebar count | Review requests = requests waiting; Open = Needs you count; Ready to merge = ready count; Stale = stale count, kept PRs left out | Review requests and Open danger when a P1 exists or something needs you; Ready to merge success when above zero; otherwise neutral |

`RiskBadge` is reserved for review findings. Do not use it for size or priority.

## Wording

- "Ready to merge" appears only in the Ready to merge view. Review requests show only "Draft".
- Say "Size", never "complexity". The priority column is "Suggested priority".
- Priority is explained in plain reasons ("Requested from you directly · waiting 3d ·
  blocks 2 layers · small"), never as a number.
- When the request time is unknown: "PR opened 3d ago · request time unknown".
- A stale PR's chip reads "No activity for 23d". It wins the chip even over a failing
  check; the other reasons stay in the tooltip and the "+N".
- "Already approved" rows say why they moved: "You approved", "Approved by @sakce",
  "Approved", or "Approved by bot @stamphog" when every approval came from a bot.

## Row anatomy

- **Line 1:** CI icon, then the title in `type-ui` medium. The title takes the remaining
  width, never less than 240px, and ellipsizes with a tooltip.
- **Line 2:** `fg-3`, 12px. It starts with the repo owner's avatar (14px,
  `rounded-xs`, decorative) and the repo name in mono, then the rest. My PRs:
  `acme/web · #num · updated 12m`. Review requests:
  `acme/web · @author · #num · Requested from you · 2d` (or `· via @acme/frontend`).
  Already approved: `acme/web · @author · #num · via @acme/frontend · Approved by @sakce`.
  Stack layers leave the repo off, because the stack header names it. Stale rows
  drop "updated …" (`acme/web · #7`), and kept rows end with "· Kept · 26d left".
- The repo name truncates on its own (at most 40% of the line, full name in a tooltip).
  `#num` and the wait age never truncate.
- **Right side, fixed columns.** My PRs: the most severe reason chip, plus "+N" when
  there are more. Review requests: P-badge · file count · Size · Draft badge · CI.
- Below 900px these drop: the owner prefix (`posthog-js-lite` stays), "updated …" in
  My PRs, "Requested from you" / "via @team" and "@author" in Review requests, and the
  file count column.

## Stacks

- Layers render bottom-first (position 1, closest to the base branch, at the top), with
  "1 of 4" labels and a connector line. One header format in both views:
  `[avatar] acme/web · Stack → main · <summary>`.
- A teammate's open layer stays full contrast and reads "Waiting on @alex". Only merged
  or closed layers use `fg-3` text. Never dim with opacity.
- My PRs places a stack in the most urgent section among the viewer's own open layers,
  and the header says why ("Needs you: #304 Lint failing").
- Review requests group requests from one stack under the same header, with the
  summary "You're asked on 2 of 4". Layers not requested from the viewer collapse into
  one expandable line.

## Status sections

- My PRs are split across three sidebar views, each for every repo together:
  - **Open** shows the sections **Needs you → Korev working → In progress**. A section
    with no PRs is hidden. When Needs you is empty but other sections have PRs, the line
    "Nothing needs you." (`check-check`, `fg-2`) takes its place at the top.
  - **Ready to merge** lists the ready PRs with no section header.
  - **Stale** lists the stale PRs with no section header, then the Kept toggle.
- The three views share one repo filter. ⌘2, ⌘3 and ⌘4 open them. A notification
  opens the view that holds its PR.
- A stack's section and the display order are separate orders. A stack goes in the most
  urgent section among the viewer's open layers (Needs you > In progress > Ready >
  Stale), so a stack with one layer running and one ready stays in In progress, and a
  stack is stale only when every one of the viewer's open layers is stale.
- **Section header:** 36px, `type-overline` `fg-3` label plus the section count.
  Sticky on `bg-app` with a `border-1` bottom hairline, never a card. It sits below the
  updates pill.
- Needs you never collapses: no chevron, and it is a plain heading, not a listbox
  option. Korev working and In progress are listbox options with a chevron; ←/→ or
  Enter collapse and expand them, and the state is saved. A collapsed section keeps its
  count.

## Stale and Keep

- A PR is stale when nobody has acted on it for 14 days and it is not ready to merge
  or queued. Activity is the PR being opened, a commit being pushed, or a person
  commenting. Bot comments don't count.
- "Keep for 30 days" (panel footer, or ⇧K) moves a stale PR into a collapsed "Kept"
  toggle at the bottom of the Stale view, with a toast "Kept #302 for 30 days" and Undo. A keep
  ends after 30 days or when someone acts on the PR again. Keeping a stale stack keeps
  all of the viewer's layers. Kept PRs are left out of the Stale count and the topbar.
  The panel shows "Stop keeping" for a kept PR, and ⇧K toggles.
- If the keep can't be saved, the panel footer says "Couldn't save · Retry", it is
  announced, and no toast shows.
- Review requests is one list in suggested-priority order, then a collapsed "Already
  approved" toggle with a mono count. A team request moves there when you, a member of
  the requesting team, or GitHub's overall review decision approved it. Direct requests
  always stay. Approved rows are left out of the counts. The column header stays pinned
  while the list scrolls.
- The topbar sums up the current view by section, leaving out empty ones: "3 need you ·
  5 in progress" in Open, "2 ready to merge", "4 stale". An empty view reads "Nothing
  needs you", "Nothing ready to merge" or "Nothing stale". Review requests reads "2 waiting on you".

## Repo order

- Inside every section, rows sort by the order set in Settings → Repositories → Inbox
  order, then by severity, then by most recently updated. Repos Korev no longer watches
  go last, alphabetically. Rows from one repo sit next to each other.
- Review requests sort by suggested-priority tier first, then by repo order, so a P1
  stays on top whatever its repo.

## Repo filter

- Both views have a repo filter in the topbar, right after the summary: a ghost
  `sm` button with `funnel` that reads "All repos ▾" or "2 of 5 repos ▾" (`accent-text`
  while a filter is on; icon plus "2/5" below 900px). It is hidden in Settings. Each
  view keeps its own filter.
- It opens a `CheckboxMenu`: repos grouped by owner (avatar + login, with an owner
  checkbox that shows a dash when only some repos are chosen), then "Show all repos".
  The menu uses the native `popover` attribute, so it sits in the top layer and closes
  on an outside click. ↑/↓ move between checkboxes, Space toggles, Esc closes the menu
  and returns focus to the button without closing the side panel. Changes are
  announced ("Showing 2 of 5 repos").
- The list, the topbar summary and the empty states follow the filter; the topbar adds
  "· filtered". The sidebar counts always cover every watched repo.
- A filter change applies at once, never behind the updates pill. If it hides the
  selected PR, the selection clears and the panel closes, with no "gone" row.
- When the filter hides everything: `funnel` empty state, "No PRs in the selected
  repos." (or "No review requests in the selected repos."), "6 open PRs are in other
  repos.", and a primary "Show all repos" button.
- Choosing every repo, or none, means all repos. A repo removed from Settings drops out
  of the filter.

## States and the banner slot

- **Loading:** skeleton rows in the shape of the final list: two section header bars
  with a few rows each. No spinner in the list.
- **Empty:** one plain sentence ("No reviews waiting on you."). A section with no PRs
  hides its header. When only already-approved requests remain, the sentence sits above
  the "Already approved" toggle.
- **Error:** the message and a Retry button replace the list. Never a toast.
- **Partial or stale:** the list stays, and one banner slot above it explains why
  (offline, rate limited, a repo Korev can no longer read). More than one problem
  collapses into "3 problems ▾".
- Toasts are only for short confirmations ("Repos saved").
- Sync status lives only in the topbar ("Synced 2m ago", "Offline · data from 14:02",
  "Reconnect GitHub"). Data from an earlier day names the day ("data from Fri 14:02").
- **Cached launch:** Korev opens with the inbox it saved at the last sync. The topbar
  reads "Syncing… · data from 14:02" until the first sync lands. Cached rows are never
  dimmed or turned into skeletons, and the first live sync replaces them without the
  updates pill.
- **Locked sign-in:** when the keychain refuses the saved sign-in, Setup shows "Korev
  couldn't unlock your saved GitHub sign-in" with Try again and Sign in again, never the
  Connect screen.

## Merge and close

- Only My PRs can merge or close. The side panel footer has one primary button:
  Merge (labelled for the repo's path) when the PR is ready to merge, Cancel when it
  is in a queue, otherwise Open on GitHub. Close sits next to it in the danger
  variant. Rows never carry buttons.
- Every action asks first. Confirms name PRs by number, never "above" or "below":
  "Merges #301, #302 and #303", "Includes @alex's #301", "#303 and #304 are built on
  this and will lose their base." A layer that isn't ready disables Merge and says why
  ("#301 isn't ready: lint failing"). A stack Korev only partly sees offers Open on
  GitHub instead.
- The merge button follows the path: "Merge", "Add to merge queue", "Send to Trunk" /
  "Send to Mergify" / "Send to Aviator". Comment paths show the comment first: "Posts
  `/trunk merge` on #303. Your team sees this comment."
- Merge confirms focus Merge; Close confirms focus Cancel. ⌘↵ confirms, Esc cancels.
  The merge method radio shows only when the repo allows more than one.
- Merge and Close stay disabled until the first live sync after launch ("Waiting for
  GitHub sync").
- While merging, every layer in the range shows "Merging…" and rows don't move. A merge
  that fails shows "Merge failed" on the row and GitHub's reason in the panel, and is
  announced. Success shows the toast "Merged #301–#303". A close leaves the row as
  "Closed · gone on next refresh" with a "Closed #302" toast that offers Reopen.
- Close on any layer of a stack in Stale closes every open layer of the viewer's:
  "Closes #301, #302 and #303." A teammate's layer above them stays open and is named:
  "Leaves @alex's #304 open; it will lose its base." Each layer shows "Closing…" and
  then "Closed" or "Close failed". The toast names only the PRs that closed ("Closed
  #301–#303", or "Closed #301 and #303" after a failure), and Reopen reopens only
  those. Outside Stale, Close stays per layer.

## Korev AI

- AI actions live in a "Korev AI" panel section, right under "Why it needs you" in My
  PRs and under the priority or approval section in Review requests. The panel footer
  never changes for AI. Buttons are plain verbs with no icons; no sparkles, purple,
  gradients or glow. The heading is `type-overline` like every other section.
- In My PRs, each reason Korev can fix gets one row: the reason text in `fg-2` and a
  secondary `sm` button ("Merge conflicts · Fix conflicts"). Fixes that don't apply
  are hidden, not disabled. On a fork whose author didn't allow maintainer edits the
  buttons are disabled and one line says why.
- The side panel only sums up a Korev task. The work itself happens on the **Korev run
  page**, which replaces the list and the panel in the main area. It opens when the user
  starts a fix or Review, from "Open" / "Answer questions" / "Open review
  draft" in the panel, and from a question notification. "Back" (Esc) returns to the
  list with the row focused. Explain keeps its reader.
- The run page header shows the PR, the task line (with Stop and Open terminal) and a
  failure with Retry. Below it, the "Activity" feed lists what the agent does as it
  happens: steps ("Read src/a.ts", "Ran npm test") in mono `fg-2`, the agent's own text
  in `fg-1`. It follows the newest line unless the user scrolled up. While the task
  runs the feed fills the page; once it needs the user or is done, the result takes the
  main column and the feed moves to a 380px side column (stacked below 900px).
- When Korev has questions, the panel shows "Korev needs your answer" with "2 questions
  from Fix conflicts" (danger) and a primary "Answer questions", and the row's first
  reason is danger, so the PR sits in Needs you. Merge or Open on GitHub become
  secondary until then. The run page asks one question at a time: "Question 1 of 2",
  step dots, the context in `fg-2`, the question in `type-h3`, and a "Your answer"
  field. Next (⌘↵) is disabled until the field has text; the last question offers
  "Send answers", disabled until every question has an answer. Back keeps answers, and
  a ghost "I'll do it myself" drops the task.
- Address comments acts only on comments from the user and from people with write
  access (OWNER, MEMBER, COLLABORATOR). A comment from anyone else becomes a question
  in the same batch, quoting it. Korev replies on each thread it handled ("Fixed in
  abc1234: …") and never resolves a thread; the reviewer does.
- Fix CI that finds nothing to change (a flaky or infrastructure failure) pushes
  nothing; its "Last Korev run" line offers "Re-run failed jobs" for the GitHub Actions
  runs that failed.
- A fix that pushed shows the toast "Fixed conflicts on #301 · pushed abc1234" with
  "View commit".
- A macOS notification appears only when the Korev window is not focused, for
  questions ("Korev needs your answer on #301") and failures. Clicking it focuses
  Korev, switches to the PR's view and opens its panel, or the run page when Korev has
  questions. Settings → AI tasks has "Notify
  me when Korev needs me", on by default.
- Keep mergeable is a `Switch` at the top of the section (⇧A in My PRs). A watched PR's
  row line 2 ends with "· Keep mergeable", like "· Kept · 26d left"; there is no badge.
  The first time it is turned on, per PR or for all PRs, a `Dialog` ("Keep #301
  mergeable?") lists what Korev will do and offers "Turn on" or "Cancel". Settings → AI
  tasks has a "Keep mergeable" card with "Keep all my PRs mergeable" (a PR's own switch
  then works as an opt-out) and "Notify me when Korev needs me".
- With Keep mergeable on, Korev takes one step per run: conflicts first, then failing
  checks once they have finished, then review comments. Questions from every step are
  held and asked together once nothing automatic is left and no check is running. After
  two attempts at the same step it stops and asks what to try next. PRs in a merge
  queue are left alone.
- With no agent chosen in Settings, the section shows one line, "Set up Claude Code or
  Codex to use Korev AI", and an "Open Settings" button instead of actions.
- While a task runs, the row carries the task chip and the panel shows the latest step
  and the elapsed time ("Fix CI · Ran npm test · 4m") with "Open" and a ghost Stop
  that needs no confirm. The section's other buttons are disabled with "Korev is already working on
  this PR". A failure shows the danger chip, the plain message and Retry. The last
  finished run stays as "Last Korev run · <summary>".
- Explanations open in a wide reader `Dialog` (`min(960px, 100vw − 32px)`): title
  "Explain #301 · <title>", the head commit as a short mono sha, "Regenerate" and "Open
  in browser". The body is a sandboxed `iframe` without scripts, styled with Korev's
  prose stylesheet built from `tokens.css` at a 72ch measure, light or dark with the
  app. Loading shows skeleton lines with "Explaining #301 · usually 1–3 min" and Stop.
  An explanation made for an older head shows the warning banner "This PR changed since
  this explanation (abc1234 → def5678)" with Regenerate.
- Review (⇧R) runs on review requests and on My PRs. It only reviews; it never pushes
  fixes. A review draft opens from "Open review draft" on
  the run page: the summary in an editable field, then one `Finding` card per
  comment with path:line, the code around the line in a `DiffHunk`, the comment text
  (click to edit), and Accept / Dismiss. The footer counts "4 of 6 comments" and offers
  "Request changes" and "Submit as comment" (primary). Approve is never offered, and on
  the user's own PR Request changes is hidden, because GitHub rejects it. With
  no findings the body starts with "Nothing to flag." Leaving the page keeps the edited draft.
  Review never stops to ask the user. A finding the agent is unsure of, or a question it
  has for the author, arrives as a card phrased as a question to the author.
- A collapsed "Korev activity" section lists the last five runs on the PR: when, which
  task, the result, and links to the commits.
- Wording says "Korev", never "magic" or "AI assistant". Done and failed tasks are
  announced: "Explanation ready for #301", "Explain failed on #301".

## Keyboard model

- Each list is one `listbox` with roving focus. `j`/`k` or ↓/↑ move between rows,
  across section headers, and into stack layers. They skip the Needs you header and the
  "Nothing needs you." line.
- Enter opens the PR, ⌘Enter opens it on GitHub, Esc closes the side panel and returns
  focus to the row. In My PRs, ⇧M and ⇧X open the merge and close confirms for the
  selected PR, and ⇧K keeps or stops keeping a stale one, even with the panel closed.
  In both views ⇧E explains and ⇧R reviews the selected PR; in My PRs ⇧A toggles Keep
  mergeable.
- ⌘1 / ⌘2 switch views, ⌘, opens Settings, ⌘R refreshes, `?` shows the shortcut sheet.
- Single-letter shortcuts are ignored while a text field has focus.
- Tab order: sidebar → list → panel. Every focusable element shows `--focus-ring` on
  `:focus-visible`.

## Contrast and non-colour signals

- Every text pair meets WCAG AA in both themes: 4.5:1, or 3:1 for text 14px semibold
  and larger.
- Colour is never the only signal. CI uses distinct icons (passing `circle-check`,
  failing `circle-x`, running `loader`, none `circle-dashed`), each with an
  `aria-label` such as "CI failing". P-badges read "Suggested priority 1", sidebar
  counts read "3 need you", and section headers read "Needs you, 3 pull requests".
- Collapsing a section or the "Already approved" toggle is announced ("Ready to merge
  collapsed").
