import type { CliCall, CliReply } from './agent-server';

export const GUIDE = `korev: talk to Korev from inside an agent turn.

Commands:
  korev help    Show this guide.
`;

type Command = (call: CliCall) => Promise<CliReply>;

function done(output: string): CliReply {
  return { ok: true, output };
}

function failed(output: string): CliReply {
  return { ok: false, output };
}

export function createOrchestration() {
  const commands: Record<string, Command> = {
    help: async () => done(GUIDE),
  };

  async function runCli(call: CliCall): Promise<CliReply> {
    const [name = 'help'] = call.argv;
    const command = commands[name];
    if (!command)
      return failed(`Unknown command "${name}". Run \`korev help\`.`);
    return command(call);
  }

  return { runCli };
}
