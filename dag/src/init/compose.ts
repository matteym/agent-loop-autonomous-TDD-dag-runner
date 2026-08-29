import type { InitAnswers } from "./answers.js";
import { composeBuildContext } from "./answers.js";

export function renderCompose(answers: InitAnswers): string {
  const lines: string[] = ["services:"];
  const depends: string[] = [];
  if (answers.postgres) {
    depends.push("postgres");
    lines.push(
      "  postgres:",
      "    image: postgres:16-alpine",
      '    ports:',
      '      - "5432:5432"',
      "    environment:",
      "      POSTGRES_USER: ${POSTGRES_USER}",
      "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}",
      "      POSTGRES_DB: ${POSTGRES_DB}",
      "    volumes:",
      "      - pgdata:/var/lib/postgresql/data",
      "    healthcheck:",
      '      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]',
      "      interval: 5s",
      "      timeout: 5s",
      "      retries: 10"
    );
  }
  if (answers.redis) {
    depends.push("redis");
    lines.push(
      "  redis:",
      "    image: redis:7-alpine",
      "    ports:",
      '      - "6379:6379"',
      "    healthcheck:",
      '      test: ["CMD", "redis-cli", "ping"]',
      "      interval: 5s",
      "      timeout: 5s",
      "      retries: 10"
    );
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
  if (answers.postgres) {
    lines.push("volumes:", "  pgdata:");
  }
  return lines.join("\n") + "\n";
}
