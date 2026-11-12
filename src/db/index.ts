import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Database access.
 *
 * The connection is created on first use rather than at import time. That
 * matters for two reasons: a production build imports every route module to
 * collect page data, and it must not need a database to do so; and a process
 * that never touches the database never opens a connection.
 *
 * `sql` and `db` are proxies over the lazily created client, so call sites
 * keep using them as plain values.
 */

type Sql = ReturnType<typeof postgres>;
type Orm = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __keaSql: Sql | undefined;
}

let pooled: Sql | null = null;
let orm: Orm | null = null;

function ensureClient(): Sql {
  if (pooled) return pooled;

  // Reuse one pool across hot reloads in development so the dev server does
  // not exhaust database connections.
  if (globalThis.__keaSql) {
    pooled = globalThis.__keaSql;
    return pooled;
  }

  const config = env();
  const sslMode = config.DATABASE_SSL;

  pooled = postgres(config.DATABASE_URL, {
    max: config.NODE_ENV === "production" ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: sslMode === "disable" ? false : sslMode === "require" ? "require" : "prefer",
    onnotice: () => {},
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__keaSql = pooled;
  }
  return pooled;
}

function ensureOrm(): Orm {
  if (!orm) orm = drizzle(ensureClient(), { schema, logger: false });
  return orm;
}

function lazyProxy<T extends object>(resolve: () => T, callable: boolean): T {
  const target = (callable ? () => undefined : {}) as T;
  return new Proxy(target, {
    apply(_target, _thisArg, args: unknown[]) {
      const instance = resolve() as unknown as (...parameters: unknown[]) => unknown;
      return instance(...args);
    },
    get(_target, property) {
      const instance = resolve();
      const value = Reflect.get(instance as object, property) as unknown;
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, property) {
      return Reflect.has(resolve() as object, property);
    },
  });
}

/** The raw postgres client. Used for migrations, health checks and shutdown. */
export const sql: Sql = lazyProxy(ensureClient, true);

/** The Drizzle query interface used throughout the application. */
export const db: Orm = lazyProxy(ensureOrm, false);

export type Database = Orm;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Accepts either the pooled client or an open transaction. */
export type Executor = Database | Transaction;

export { schema };
