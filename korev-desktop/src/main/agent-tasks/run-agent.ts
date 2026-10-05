import type { AgentActivityLine } from '../../shared/agent-tasks';
import type { AgentAccess } from '../../shared/agents';
import type { AgentRunRequest } from '../agents/agents-service';
import type { AgentRunResult } from '../../shared/agents';
import { parseOutput } from './contract';
import { TaskError } from './engine';

export type RunAgent = (request: AgentRunRequest) => Promise<AgentRunResult>;

export const MALFORMED_OUTPUT =
  "The agent's answer didn't match what Korev asked for.";

export interface StructuredRun {
  prompt: string;
  cwd: string;
  access: AgentAccess;
  schema: object;
  network?: boolean;
  timeoutMs: number;
  signal: AbortSignal;
  onActivity?: (line: AgentActivityLine) => void;
}

export async function runStructured(
  runAgent: RunAgent,
  request: StructuredRun,
): Promise<Record<string, unknown>> {
  const result = await runAgent(request);
  if (!result.ok) throw new TaskError(result.message);
  const fields = parseOutput(result.output);
  if (!fields) throw new TaskError(MALFORMED_OUTPUT);
  return fields;
}
