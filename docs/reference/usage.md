---
title: Usage ring
parent: Reference
nav_order: 7
---

# Usage ring

The ring next to **Send** shows how full the chat's context window was after the last turn. It turns amber at 80% and red at 95%.

Click it to open **Usage**:

- **Context window**: the percentage, the tokens used out of the total, and the tokens left.
- **Plan limits**: one bar per limit of your agent plan, such as the 5-hour limit and the weekly limit, each with the time it resets.

For Codex, Korev reads the limits from the session files in `~/.codex` (or `$CODEX_HOME`).

Each finished turn also shows how long it took, what it cost, and how many files it changed.
