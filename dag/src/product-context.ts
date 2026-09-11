import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const productContextRelPaths = [
  ".cursor/product-context.md",
  "PRODUCT.md",
] as const;

export function loadProductContext(...roots: string[]): string {
  for (const root of roots) {
    if (!root) {
      continue;
    }
    for (const rel of productContextRelPaths) {
      const filePath = join(root, rel);
      if (!existsSync(filePath)) {
        continue;
      }
      const text = readFileSync(filePath, "utf8").trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

export function productContextBlock(...roots: string[]): string[] {
  const text = loadProductContext(...roots);
  if (!text) {
    return [];
  }
  return [
    "Product context (architecture and shipped history; not extra ticket scope):",
    text,
  ];
}
