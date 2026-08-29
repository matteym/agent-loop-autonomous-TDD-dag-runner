export const storeIds = ["postgres", "redis", "mongodb", "neo4j", "mysql"] as const;

export type StoreId = (typeof storeIds)[number];

export function renderCompose(): string {
  return [
    "# yarn task adds services. Copy composeBlock/envBlock in this file (" +
      storeIds.join(", ") +
      ").",
    "services: {}",
    "",
  ].join("\n");
}

export function composeBlock(id: StoreId): { lines: string[]; volumes: string[] } {
  if (id === "postgres") {
    return {
      volumes: ["pgdata"],
      lines: [
        "  postgres:",
        "    image: postgres:16-alpine",
        "    ports:",
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
        "      retries: 10",
      ],
    };
  }
  if (id === "redis") {
    return {
      volumes: [],
      lines: [
        "  redis:",
        "    image: redis:7-alpine",
        "    ports:",
        '      - "6379:6379"',
        "    healthcheck:",
        '      test: ["CMD", "redis-cli", "ping"]',
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 10",
      ],
    };
  }
  if (id === "mongodb") {
    return {
      volumes: ["mongodata"],
      lines: [
        "  mongodb:",
        "    image: mongo:7",
        "    ports:",
        '      - "27017:27017"',
        "    environment:",
        "      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}",
        "      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}",
        "    volumes:",
        "      - mongodata:/data/db",
        "    healthcheck:",
        '      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand(\'ping\')"]',
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 10",
      ],
    };
  }
  if (id === "neo4j") {
    return {
      volumes: ["neo4jdata"],
      lines: [
        "  neo4j:",
        "    image: neo4j:5-community",
        "    ports:",
        '      - "7474:7474"',
        '      - "7687:7687"',
        "    environment:",
        "      NEO4J_AUTH: ${NEO4J_AUTH}",
        "    volumes:",
        "      - neo4jdata:/data",
        "    healthcheck:",
        '      test: ["CMD-SHELL", "wget -qO /dev/null http://127.0.0.1:7474 || exit 1"]',
        "      interval: 10s",
        "      timeout: 5s",
        "      retries: 12",
      ],
    };
  }
  return {
    volumes: ["mysqldata"],
    lines: [
      "  mysql:",
      "    image: mysql:8",
      "    ports:",
      '      - "3306:3306"',
      "    environment:",
      "      MYSQL_DATABASE: ${MYSQL_DATABASE}",
      "      MYSQL_USER: ${MYSQL_USER}",
      "      MYSQL_PASSWORD: ${MYSQL_PASSWORD}",
      "      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}",
      "    volumes:",
      "      - mysqldata:/var/lib/mysql",
      "    healthcheck:",
      '      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]',
      "      interval: 5s",
      "      timeout: 5s",
      "      retries: 12",
    ],
  };
}

export function envBlock(
  id: StoreId,
  password: string
): { keys: string[]; dotenv: string[]; example: string[] } {
  if (id === "postgres") {
    return {
      keys: ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "DATABASE_URL", "DATABASE_URL_HOST"],
      dotenv: [
        "POSTGRES_USER=app",
        "POSTGRES_PASSWORD=" + password,
        "POSTGRES_DB=app",
        "DATABASE_URL=postgres://app:" + password + "@postgres:5432/app",
        "DATABASE_URL_HOST=postgres://app:" + password + "@127.0.0.1:5432/app",
      ],
      example: [
        "POSTGRES_USER=app",
        "POSTGRES_PASSWORD=changeme",
        "POSTGRES_DB=app",
        "DATABASE_URL=postgres://app:changeme@postgres:5432/app",
        "DATABASE_URL_HOST=postgres://app:changeme@127.0.0.1:5432/app",
      ],
    };
  }
  if (id === "redis") {
    return {
      keys: ["REDIS_URL", "REDIS_URL_HOST"],
      dotenv: ["REDIS_URL=redis://redis:6379", "REDIS_URL_HOST=redis://127.0.0.1:6379"],
      example: ["REDIS_URL=redis://redis:6379", "REDIS_URL_HOST=redis://127.0.0.1:6379"],
    };
  }
  if (id === "mongodb") {
    return {
      keys: ["MONGO_USER", "MONGO_PASSWORD", "MONGO_URL", "MONGO_URL_HOST"],
      dotenv: [
        "MONGO_USER=app",
        "MONGO_PASSWORD=" + password,
        "MONGO_URL=mongodb://app:" + password + "@mongodb:27017",
        "MONGO_URL_HOST=mongodb://app:" + password + "@127.0.0.1:27017",
      ],
      example: [
        "MONGO_USER=app",
        "MONGO_PASSWORD=changeme",
        "MONGO_URL=mongodb://app:changeme@mongodb:27017",
        "MONGO_URL_HOST=mongodb://app:changeme@127.0.0.1:27017",
      ],
    };
  }
  if (id === "neo4j") {
    return {
      keys: ["NEO4J_AUTH", "NEO4J_URI", "NEO4J_URI_HOST"],
      dotenv: [
        "NEO4J_AUTH=neo4j/" + password,
        "NEO4J_URI=bolt://neo4j:7687",
        "NEO4J_URI_HOST=bolt://127.0.0.1:7687",
      ],
      example: [
        "NEO4J_AUTH=neo4j/changeme",
        "NEO4J_URI=bolt://neo4j:7687",
        "NEO4J_URI_HOST=bolt://127.0.0.1:7687",
      ],
    };
  }
  return {
    keys: [
      "MYSQL_DATABASE",
      "MYSQL_USER",
      "MYSQL_PASSWORD",
      "MYSQL_ROOT_PASSWORD",
      "MYSQL_URL",
      "MYSQL_URL_HOST",
    ],
    dotenv: [
      "MYSQL_DATABASE=app",
      "MYSQL_USER=app",
      "MYSQL_PASSWORD=" + password,
      "MYSQL_ROOT_PASSWORD=" + password,
      "MYSQL_URL=mysql://app:" + password + "@mysql:3306/app",
      "MYSQL_URL_HOST=mysql://app:" + password + "@127.0.0.1:3306/app",
    ],
    example: [
      "MYSQL_DATABASE=app",
      "MYSQL_USER=app",
      "MYSQL_PASSWORD=changeme",
      "MYSQL_ROOT_PASSWORD=changeme",
      "MYSQL_URL=mysql://app:changeme@mysql:3306/app",
      "MYSQL_URL_HOST=mysql://app:changeme@127.0.0.1:3306/app",
    ],
  };
}
