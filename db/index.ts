import { drizzle } from "drizzle-orm/d1";
import { getRuntimeBindings } from "@/lib/runtime-bindings";
import * as schema from "./schema";

export function getD1() {
  const bindings = getRuntimeBindings();
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return bindings.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

let schemaReady: Promise<void> | null = null;

export async function ensureRuntimeSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = (async () => {
      await d1.batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT DEFAULT 'user' NOT NULL,
          status TEXT DEFAULT 'pending' NOT NULL,
          phone_e164 TEXT,
          password_hash TEXT,
          email_verified_at TEXT,
          phone_verified_at TEXT,
          session_version INTEGER DEFAULT 1 NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          source_mode TEXT DEFAULT 'text' NOT NULL,
          story_text TEXT DEFAULT '' NOT NULL,
          audio_key TEXT,
          audio_filename TEXT,
          audio_content_type TEXT,
          audio_size INTEGER,
          audio_duration_seconds INTEGER,
          transcription_text TEXT,
          analysis_json TEXT,
          request_text TEXT,
          answers_json TEXT,
          poem_json TEXT,
          poem_title TEXT,
          meter TEXT,
          verse_count INTEGER,
          state TEXT DEFAULT 'analyzed' NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS submissions_user_id_idx ON submissions (user_id)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS submissions_state_idx ON submissions (state)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at)"),
      ]);

      const columns = await d1.prepare("PRAGMA table_info(users)").all<{ name: string }>();
      const existingColumns = new Set(columns.results.map((column) => column.name));
      const additions = [
        ["phone_e164", "ALTER TABLE users ADD COLUMN phone_e164 TEXT"],
        ["password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT"],
        ["email_verified_at", "ALTER TABLE users ADD COLUMN email_verified_at TEXT"],
        ["phone_verified_at", "ALTER TABLE users ADD COLUMN phone_verified_at TEXT"],
        ["session_version", "ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 1 NOT NULL"],
      ] as const;

      for (const [name, statement] of additions) {
        if (!existingColumns.has(name)) {
          try {
            await d1.prepare(statement).run();
          } catch (error) {
            if (!/duplicate column name/i.test(error instanceof Error ? error.message : "")) {
              throw error;
            }
          }
        }
      }

      await d1.batch([
        d1.prepare("CREATE INDEX IF NOT EXISTS users_status_idx ON users (status)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at)"),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique ON users (phone_e164)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS auth_login_attempts (
          key TEXT PRIMARY KEY NOT NULL,
          attempts INTEGER DEFAULT 0 NOT NULL,
          window_started_at TEXT NOT NULL,
          blocked_until TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS auth_login_attempts_updated_at_idx ON auth_login_attempts (updated_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS integration_settings (
          key TEXT PRIMARY KEY NOT NULL,
          encrypted_value TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS integration_settings_updated_at_idx ON integration_settings (updated_at)"),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function getBucket() {
  const bucket = getRuntimeBindings().BUCKET;
  if (!bucket) {
    throw new Error(
      "Cloudflare R2 binding `BUCKET` is unavailable. Set the `r2` field in .openai/hosting.json to `BUCKET`.",
    );
  }
  return bucket;
}
