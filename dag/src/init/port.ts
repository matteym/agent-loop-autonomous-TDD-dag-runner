export const srcDir = "src";

export type InitPort = {
  appPort: number;
};

export function defaultPort(): InitPort {
  return { appPort: 3000 };
}

export function parsePort(raw: string, fallback: number): number | null {
  const v = raw.trim();
  const n = v ? Number(v) : fallback;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return null;
  }
  return n;
}

export function validatePort(value: unknown): InitPort | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const appPort = parsePort(String(rec.appPort ?? 3000), 3000);
  if (appPort === null) {
    return null;
  }
  return { appPort };
}
