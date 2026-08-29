export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stderr.isTTY);
}

function paint(code: string, text: string): string {
  if (!colorEnabled()) {
    return text;
  }
  return "\u001b[" + code + "m" + text + "\u001b[0m";
}

export function log(message: string) {
  process.stderr.write("[init] " + message + "\n");
}

export function phase(name: string, detail: string) {
  const code = name === "FAIL" ? "31" : name === "ASK" ? "36" : "32";
  log(paint(code, name) + " " + detail);
}
