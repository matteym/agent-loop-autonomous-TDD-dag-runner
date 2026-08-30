export type ProviderName = "cursor" | "claude";

export type CliCommand = "init" | "task";

export type ParsedCli = {
  command: CliCommand;
  force: boolean;
  yes: boolean;
  intent: string;
  dagfile?: string;
  remote?: string;
  push: boolean;
  provider?: ProviderName;
};

export type ParseResult = { ok: true; value: ParsedCli } | { ok: false; error: string };

function readFlagValue(argv: string[], name: string): string | undefined {
  const prefix = name + "=";
  for (const arg of argv) {
    if (arg.startsWith(prefix)) {
      const value = arg.slice(prefix.length).trim();
      return value || undefined;
    }
  }
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("-")) {
    return argv[idx + 1];
  }
  return undefined;
}

function parseOnOff(raw: string): boolean | null {
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return null;
}

export function parseArgv(argv: string[]): ParseResult {
  const args = argv.filter((arg) => arg !== "--");
  if (!args.length) {
    return {
      ok: false,
      error: "usage: yarn run init --remote=https://github.com/OWNER/REPO.git | yarn task \"intent\"",
    };
  }
  const command = args[0];
  if (command !== "init" && command !== "task") {
    return { ok: false, error: "unknown command " + command };
  }
  const rest = args.slice(1);
  const known = new Set([
    "--force",
    "--yes",
    "--allow-pull-request",
    "--no-push",
    "--dagfile",
    "--remote",
    "--repo",
    "--provider",
    "--push",
  ]);
  for (const arg of rest) {
    if (!arg.startsWith("-")) {
      continue;
    }
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (
      name === "--dagfile" ||
      name === "--remote" ||
      name === "--repo" ||
      name === "--provider" ||
      name === "--push"
    ) {
      continue;
    }
    if (!known.has(name)) {
      return { ok: false, error: "unknown flag " + name };
    }
  }
  const providerRaw = readFlagValue(rest, "--provider");
  let provider: ProviderName | undefined;
  if (providerRaw) {
    if (providerRaw !== "cursor" && providerRaw !== "claude") {
      return { ok: false, error: "provider must be cursor or claude" };
    }
    provider = providerRaw;
  }
  const pushRaw = readFlagValue(rest, "--push");
  let push = !rest.includes("--no-push");
  if (pushRaw !== undefined) {
    const parsed = parseOnOff(pushRaw);
    if (parsed === null) {
      return { ok: false, error: "push must be true or false" };
    }
    push = parsed;
  }
  const intent = rest
    .filter((arg, i, all) => {
      if (arg.startsWith("-")) {
        return false;
      }
      if (
        i > 0 &&
        (all[i - 1] === "--dagfile" ||
          all[i - 1] === "--remote" ||
          all[i - 1] === "--repo" ||
          all[i - 1] === "--provider" ||
          all[i - 1] === "--push")
      ) {
        return false;
      }
      return true;
    })
    .join(" ")
    .trim();
  return {
    ok: true,
    value: {
      command,
      force: rest.includes("--force"),
      yes: rest.includes("--yes"),
      intent,
      dagfile: readFlagValue(rest, "--dagfile"),
      remote: readFlagValue(rest, "--remote") || readFlagValue(rest, "--repo"),
      push,
      provider,
    },
  };
}
