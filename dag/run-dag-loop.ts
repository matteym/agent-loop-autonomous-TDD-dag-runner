import { parseArgv } from "./src/cli.js";
import { runInit } from "./src/init/run.js";
import { log } from "./src/init/log.js";
import { runTask } from "./src/task.js";

async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(parsed.error + "\n");
    process.exit(1);
  }
  const cli = parsed.value;
  if (cli.command === "init") {
    const result = await runInit({ force: cli.force, nonInteractive: cli.yes });
    if (result.status === "ok" || result.status === "aborted") {
      process.exit(0);
    }
    log(result.reason);
    process.exit(1);
  }
  const code = await runTask({
    intent: cli.intent,
    dagfile: cli.dagfile,
    allowPullRequest: cli.allowPullRequest,
    provider: cli.provider,
  });
  process.exit(code);
}

void main();
