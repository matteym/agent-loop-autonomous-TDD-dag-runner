import type { InitAnswers } from "./answers.js";
import { composeBuildContext } from "./answers.js";
import { composeBlock } from "./stores.js";

export function renderCompose(answers: InitAnswers): string {
  const lines: string[] = ["services:"];
  const depends: string[] = [];
  const volumes = new Set<string>();
  for (const id of answers.datastores) {
    const block = composeBlock(id);
    lines.push(...block.lines);
    depends.push(id);
    for (const volume of block.volumes) {
      volumes.add(volume);
    }
  }
  lines.push(
    "  app:",
    "    build: " + composeBuildContext(answers),
    "    env_file: .env",
    "    ports:",
    '      - "${APP_PORT}:${APP_PORT}"'
  );
  if (depends.length) {
    lines.push("    depends_on:");
    for (const name of depends) {
      lines.push("      " + name + ":", "        condition: service_healthy");
    }
  }
  if (volumes.size) {
    lines.push("volumes:");
    for (const volume of volumes) {
      lines.push("  " + volume + ":");
    }
  }
  return lines.join("\n") + "\n";
}
