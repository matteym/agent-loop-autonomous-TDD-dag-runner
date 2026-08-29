const blockedSegments = new Set([
  "dag",
  "node_modules",
  "dist",
  "coverage",
  "logs",
  "afaire",
]);

const allowedNewTests: { cmd: string; args: string[] }[] = [
  { cmd: "yarn", args: ["test"] },
  { cmd: "uv", args: ["run", "python", "-m", "pytest", "-q"] },
  { cmd: "go", args: ["test", "./..."] },
  { cmd: "cargo", args: ["test"] },
];

export function normalizeRelCwd(raw: string): string | null {
  const n = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!n || n === ".") {
    return null;
  }
  if (n.startsWith("/") || n.includes(":") || n.includes("\\")) {
    return null;
  }
  const parts = n.split("/");
  if (parts.length > 3) {
    return null;
  }
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.startsWith(".")) {
      return null;
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(part)) {
      return null;
    }
    if (blockedSegments.has(part.toLowerCase())) {
      return null;
    }
  }
  return n;
}

export function isSafeNewCwd(raw: string): boolean {
  return normalizeRelCwd(raw) !== null;
}

export function isAllowedNewTestSpec(cmd: string, args: string[]): boolean {
  return allowedNewTests.some((allowed) => {
    if (allowed.cmd !== cmd) {
      return false;
    }
    if (allowed.args.length !== args.length) {
      return false;
    }
    return allowed.args.every((arg, i) => arg === args[i]);
  });
}
