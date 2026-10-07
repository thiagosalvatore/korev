import { tmpdir } from 'node:os';
import type { Workspace } from '../shared/model';
import type { Context } from './context';
import { branchExists, hasUpstream, renameBranch, slugify } from './git';
import { withPrompt } from './repo-config';
import { workspaceConfig } from './workspaces';

const RENAME_TIMEOUT_MS = 60_000;
const RENAME_MODEL = 'claude-haiku-4-5';
const BRANCH_NAME_MAX_CHARS = 40;
const RENAME_TASK_CHARS = 4_000;
const RENAME_SYSTEM_PROMPT =
  'You name git branches. Given a task, reply with a 2 to 4 word lowercase kebab-case branch name and nothing else.';
const RENAME_BASE_ARGS = [
  '-p',
  '--model',
  RENAME_MODEL,
  '--no-session-persistence',
  '--output-format',
  'text',
  '--tools',
  '',
  '--setting-sources',
  '',
  '--disable-slash-commands',
  '--strict-mcp-config',
  '--system-prompt',
];

function isPlaceholderBranch(workspace: Workspace) {
  return workspace.branch.split('/').at(-1) === workspace.name;
}

async function suggestBranchName(
  ctx: Context,
  workspace: Workspace,
  text: string,
) {
  const config = await workspaceConfig(ctx, workspace);
  const args = [
    ...RENAME_BASE_ARGS,
    withPrompt(RENAME_SYSTEM_PROMPT, config.prompts.rename_branch),
  ];
  const result = await ctx.deps.run('claude', args, {
    cwd: tmpdir(),
    env: ctx.deps.env,
    stdin: `Task:\n${text.slice(0, RENAME_TASK_CHARS)}`,
    timeoutMs: RENAME_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) return null;
  return (
    slugify(result.stdout.trim().split('\n').at(-1) ?? '')
      .slice(0, BRANCH_NAME_MAX_CHARS)
      .replace(/-+$/, '') || null
  );
}

export async function autoRenameBranch(
  ctx: Context,
  workspace: Workspace,
  text: string,
) {
  if (
    !ctx.store.state.settings.autoRenameBranches ||
    !isPlaceholderBranch(workspace)
  )
    return;
  try {
    const suggestion = await suggestBranchName(ctx, workspace, text);
    if (!suggestion || !isPlaceholderBranch(workspace)) return;
    if (await hasUpstream(ctx.git, workspace.path)) return;
    const prefix = workspace.branch.split('/').slice(0, -1).join('/');
    const next = prefix ? `${prefix}/${suggestion}` : suggestion;
    const repo = ctx.repo(workspace.repoId);
    if (await branchExists(ctx.git, repo.path, next)) return;
    await renameBranch(ctx.git, workspace.path, workspace.branch, next);
    workspace.branch = next;
    ctx.store.save();
    ctx.emitState();
  } catch {
    return;
  }
}
