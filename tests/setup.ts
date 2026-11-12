/**
 * Test setup.
 *
 * Supplies the environment variables the application validates at startup so
 * unit tests can import modules that call `env()`. Integration tests override
 * DATABASE_URL from the real environment before this file runs.
 */
import { config } from "dotenv";

config({ path: ".env.test", override: false });
config({ path: ".env.local", override: false });

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://kea:kea@127.0.0.1:5432/kea_test";
process.env.DATABASE_SSL = process.env.DATABASE_SSL ?? "disable";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
process.env.SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "kea_session";

// Integrations stay off unless a test switches one on deliberately.
process.env.MESSAGING_ENABLED = process.env.MESSAGING_ENABLED ?? "false";
process.env.AI_ASSIST_ENABLED = process.env.AI_ASSIST_ENABLED ?? "false";
process.env.PREDICTION_ENABLED = process.env.PREDICTION_ENABLED ?? "false";
