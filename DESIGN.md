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
| Action chip | My PR row while Korev acts on it: "Merging…" (with `loader`), "Still merging on GitHub", "Merge failed" | neutral, or danger for a failure |
| Queue chip | "In Trunk queue" / "In merge queue" (In progress); "Removed from Trunk queue" (Needs you) | neutral / warning |
| Section count | My PRs section header count | Needs you danger, Ready to merge success, In progress mono `fg-2` |
| Stack | Header of a stack group | accent |
| Sidebar count | My PRs = Needs you count; Review requests = requests waiting | danger when something needs you or a P1 exists, otherwise neutral |

`RiskBadge` is reserved for review findings. Do not use it for size or priority.

## Wording

- "Ready to merge" appears only in My PRs. Review requests show only "Draft".
- Say "Size", never "complexity". The priority column is "Suggested priority".
- Priority is explained in plain reasons ("Requested from you directly · waiting 3d ·
  blocks 2 layers · small"), never as a number.
- When the request time is unknown: "PR opened 3d ago · request time unknown".
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
  Stack layers leave the repo off, because the stack header names it.
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

- My PRs shows each section once, for every repo together: **Needs you → Ready to
  merge → In progress**. A section with no PRs is hidden. When Needs you is empty but
  other sections have PRs, the line "Nothing needs you." (`check-check`, `fg-2`) takes
  its place at the top.
- A stack's section and the display order are separate orders. A stack goes in the most
  urgent section among the viewer's open layers (Needs you > In progress > Ready), so a
  stack with one layer running and one ready stays in In progress.
- **Section header:** 36px, `type-overline` `fg-3` label plus the section count.
  Sticky on `bg-app` with a `border-1` bottom hairline, never a card. It sits below the
  updates pill.
- Needs you never collapses: no chevron, and it is a plain heading, not a listbox
  option. Ready to merge and In progress are listbox options with a chevron; ←/→ or
  Enter collapse and expand them, and the state is saved. A collapsed section keeps its
  count.
- Review requests is one list in suggested-priority order, then a collapsed "Already
  approved" toggle with a mono count. A team request moves there when you, a member of
  the requesting team, or GitHub's overall review decision approved it. Direct requests
  always stay. Approved rows are left out of the counts. The column header stays pinned
  while the list scrolls.
- The topbar sums up My PRs by section, leaving out empty ones: "3 need you · 2 ready
  to merge · 5 in progress", or "No open PRs". Review requests reads "2 waiting on you".

## Repo order

- Inside every section, rows sort by the order set in Settings → Repositories → Inbox
  order, then by severity, then by most recently updated. Repos Korev no longer watches
  go last, alphabetically. Rows from one repo sit next to each other.
- Review requests sort by suggested-priority tier first, then by repo order, so a P1
  stays on top whatever its repo.

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

## Keyboard model

- Each list is one `listbox` with roving focus. `j`/`k` or ↓/↑ move between rows,
  across section headers, and into stack layers. They skip the Needs you header and the
  "Nothing needs you." line.
- Enter opens the PR, ⌘Enter opens it on GitHub, Esc closes the side panel and returns
  focus to the row. In My PRs, ⇧M and ⇧X open the merge and close confirms for the
  selected PR, even with the panel closed.
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
