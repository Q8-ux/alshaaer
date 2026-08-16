import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
    status: text("status", { enum: ["pending", "active", "suspended"] })
      .notNull()
      .default("pending"),
    phoneE164: text("phone_e164"),
    passwordHash: text("password_hash"),
    emailVerifiedAt: text("email_verified_at"),
    phoneVerifiedAt: text("phone_verified_at"),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_e164_unique").on(table.phoneE164),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

export const authLoginAttempts = sqliteTable(
  "auth_login_attempts",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_login_attempts_updated_at_idx").on(table.updatedAt)],
);

export const integrationSettings = sqliteTable(
  "integration_settings",
  {
    key: text("key").primaryKey(),
    encryptedValue: text("encrypted_value").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("integration_settings_updated_at_idx").on(table.updatedAt)],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sourceMode: text("source_mode", { enum: ["text", "audio"] }).notNull().default("text"),
    storyText: text("story_text").notNull().default(""),
    audioKey: text("audio_key"),
    audioFilename: text("audio_filename"),
    audioContentType: text("audio_content_type"),
    audioSize: integer("audio_size"),
    audioDurationSeconds: integer("audio_duration_seconds"),
    transcriptionText: text("transcription_text"),
    analysisJson: text("analysis_json"),
    requestText: text("request_text"),
    answersJson: text("answers_json"),
    poemJson: text("poem_json"),
    poemTitle: text("poem_title"),
    meter: text("meter"),
    verseCount: integer("verse_count"),
    state: text("state", {
      enum: ["received", "audio_saved", "analyzed", "completed", "failed"],
    })
      .notNull()
      .default("analyzed"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("submissions_user_id_idx").on(table.userId),
    index("submissions_state_idx").on(table.state),
    index("submissions_created_at_idx").on(table.createdAt),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type SubmissionRecord = typeof submissions.$inferSelect;
export type AuthLoginAttemptRecord = typeof authLoginAttempts.$inferSelect;
export type IntegrationSettingRecord = typeof integrationSettings.$inferSelect;
