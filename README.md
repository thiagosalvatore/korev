# korev

Korev is a Mac app that runs coding agents (Claude Code and Codex) in parallel. Each task gets its own workspace: a git worktree on a new branch, with its own chats, terminal, diff and pull request.

To ask about code without starting a task, use **Ask**. The agent reads a shared checkout of each repository's default branch and cannot change anything. One Ask chat can cover several repositories.

A task that spans repositories (say a frontend and a backend) gets one linked workspace per repository, all on the same branch name. Pick several repositories on the New workspace page, or plan the change in an Ask chat and press **Start workspaces**. Each agent changes only its own repository and can read the linked ones.

It follows [Conductor](https://www.conductor.build)'s model and UI closely, including `conductor.json` scripts and the `CONDUCTOR_*` environment variables, so a repository set up for Conductor works here unchanged.

## Run it

```sh
cd korev-desktop
npm ci
npm start
```

Korev uses the `claude` and `codex` CLIs from your PATH and their own sign-in, and `gh` for pull requests.

## Checks

```sh
npm run typecheck && npm run lint && npm test
npm run test:e2e   # packages the app and drives it with a fake agent
```
