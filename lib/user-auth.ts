import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { ensureRuntimeSchema, getDb } from "@/db";
import { authLoginAttempts, users, type UserRecord } from "@/db/schema";
import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

export const USER_SESSION_COOKIE = "ant_alshaer_user_session";
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const GUEST_EMAIL_SUFFIX = "@guest.ant-alshaer.local";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const encoder = new TextEncoder();

type UserSessionPayload = {
  uid: string;
  ver: number;
  exp: number;
};

export class UserAuthError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "USER_AUTH_ERROR",
  ) {
    super(message);
  }
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const guestAccessEnabled = () => getRuntimeStringBinding("GUEST_ACCESS_ENABLED") === "true";

export const isGuestUser = (user: Pick<UserRecord, "email" | "passwordHash">) =>
  !user.passwordHash && user.email.endsWith(GUEST_EMAIL_SUFFIX);

export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(actual: Uint8Array, expected: Uint8Array) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

async function scopedKey(scope: "password" | "session") {
  const configuredSecret = getRuntimeStringBinding("USER_AUTH_SECRET");
  if (!configuredSecret) throw new UserAuthError(503, "تسجيل المستخدمين قيد الإعداد الآن.", "AUTH_NOT_CONFIGURED");

  let masterBytes: Uint8Array;
  try {
    masterBytes = base64UrlToBytes(configuredSecret);
  } catch {
    throw new UserAuthError(503, "تسجيل المستخدمين قيد الإعداد الآن.", "AUTH_NOT_CONFIGURED");
  }
  if (masterBytes.length < 32) {
    throw new UserAuthError(503, "تسجيل المستخدمين قيد الإعداد الآن.", "AUTH_NOT_CONFIGURED");
  }

  const masterKey = await crypto.subtle.importKey(
    "raw",
    masterBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      masterKey,
      encoder.encode(`ant-alshaer/${scope}-key/v1`),
    ),
  );
  return crypto.subtle.importKey(
    "raw",
    derived as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hashUserPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await scopedKey("password"),
      encoder.encode(`user-password-v1:${bytesToBase64Url(salt)}:${password}`),
    ),
  );
  return `hmac-sha256-v1$${bytesToBase64Url(salt)}$${bytesToBase64Url(digest)}`;
}

export async function verifyUserPassword(password: string, storedHash: string) {
  const [algorithm, saltText, expectedText] = storedHash.split("$");
  if (algorithm !== "hmac-sha256-v1" || !saltText || !expectedText) return false;
  try {
    const expected = base64UrlToBytes(expectedText);
    if (base64UrlToBytes(saltText).length !== 16 || expected.length !== 32) return false;
    const actual = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await scopedKey("password"),
        encoder.encode(`user-password-v1:${saltText}:${password}`),
      ),
    );
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createUserSessionToken(user: UserRecord) {
  const payload: UserSessionPayload = {
    uid: user.id,
    ver: user.sessionVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await scopedKey("session"), encoder.encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

async function verifyUserSessionToken(token: string): Promise<UserSessionPayload | null> {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await scopedKey("session"),
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as UserSessionPayload;
    if (
      !payload.uid ||
      !Number.isInteger(payload.ver) ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getUserSession(): Promise<UserRecord | null> {
  const token = (await cookies()).get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyUserSessionToken(token);
  if (!payload) return null;
  await ensureRuntimeSchema();
  const [user] = await getDb().select().from(users).where(eq(users.id, payload.uid)).limit(1);
  if (!user || user.status !== "active" || user.sessionVersion !== payload.ver) return null;
  return user;
}

export function userSessionCookie(
  token: string,
  maxAge = SESSION_TTL_SECONDS,
  secureCookie = false,
) {
  const secure = secureCookie ? "; Secure" : "";
  return `${USER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function userSessionCookieOptions(secureCookie = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookie,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createGuestUser() {
  await ensureRuntimeSchema();
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const [guest] = await getDb()
    .insert(users)
    .values({
      id,
      email: `guest-${id}${GUEST_EMAIL_SUFFIX}`,
      displayName: "زائر مؤقت",
      role: "user",
      status: "active",
      sessionVersion: 1,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    })
    .returning();
  return guest;
}

export async function registerPendingUser(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  await ensureRuntimeSchema();
  const db = getDb();
  const email = normalizeEmail(input.email);
  const adminEmail = normalizeEmail(getRuntimeStringBinding("ADMIN_EMAIL") || "");
  const [existing] = await Promise.all([
    db.select().from(users).where(eq(users.email, email)).limit(1),
  ]);
  const current = existing[0];

  if (email === adminEmail || current?.role === "admin") {
    throw new UserAuthError(409, "هذا البريد مخصص لإدارة التطبيق.", "ADMIN_EMAIL_RESERVED");
  }
  if (current?.status === "suspended") {
    throw new UserAuthError(403, "هذا الحساب موقوف حاليًا. تواصل مع مدير التطبيق.", "ACCOUNT_SUSPENDED");
  }
  if (current?.status === "active" && current.passwordHash) {
    throw new UserAuthError(409, "يوجد حساب بهذا البريد. استخدم تسجيل الدخول.", "ACCOUNT_EXISTS");
  }
  const passwordHash = await hashUserPassword(input.password);
  const timestamp = new Date().toISOString();
  if (current) {
    const [updated] = await db
      .update(users)
      .set({
        displayName: input.displayName.trim(),
        phoneE164: null,
        passwordHash,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        status: "pending",
        sessionVersion: current.sessionVersion + 1,
        lastSeenAt: timestamp,
      })
      .where(eq(users.id, current.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash,
      role: "user",
      status: "pending",
      sessionVersion: 1,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    })
    .returning();
  return created;
}

export async function findPendingUser(emailValue: string) {
  await ensureRuntimeSchema();
  const email = normalizeEmail(emailValue);
  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

export async function activateVerifiedUser(userId: string) {
  const timestamp = new Date().toISOString();
  const [user] = await getDb()
    .update(users)
    .set({
      status: "active",
      emailVerifiedAt: timestamp,
      lastSeenAt: timestamp,
    })
    .where(eq(users.id, userId))
    .returning();
  if (!user) throw new UserAuthError(404, "الحساب غير موجود.", "ACCOUNT_NOT_FOUND");
  return user;
}

async function checkLoginRateLimit(key: string) {
  const [attempt] = await getDb()
    .select()
    .from(authLoginAttempts)
    .where(eq(authLoginAttempts.key, key))
    .limit(1);
  if (attempt?.blockedUntil && Date.parse(attempt.blockedUntil) > Date.now()) {
    throw new UserAuthError(
      429,
      "توقفت محاولات الدخول مؤقتًا. حاول بعد 15 دقيقة.",
      "LOGIN_RATE_LIMITED",
    );
  }
}

async function recordFailedLogin(key: string) {
  const db = getDb();
  const [attempt] = await db
    .select()
    .from(authLoginAttempts)
    .where(eq(authLoginAttempts.key, key))
    .limit(1);
  const timestamp = new Date();
  const expired = !attempt || timestamp.getTime() - Date.parse(attempt.windowStartedAt) > LOGIN_WINDOW_MS;
  const attempts = expired ? 1 : attempt.attempts + 1;
  const values = {
    attempts,
    windowStartedAt: expired ? timestamp.toISOString() : attempt.windowStartedAt,
    blockedUntil:
      attempts >= LOGIN_MAX_FAILURES
        ? new Date(timestamp.getTime() + LOGIN_BLOCK_MS).toISOString()
        : null,
    updatedAt: timestamp.toISOString(),
  };
  if (attempt) {
    await db.update(authLoginAttempts).set(values).where(eq(authLoginAttempts.key, key));
  } else {
    await db.insert(authLoginAttempts).values({ key, ...values });
  }
}

export async function authenticateUser(emailValue: string, password: string) {
  await ensureRuntimeSchema();
  const email = normalizeEmail(emailValue);
  const rateKey = `email:${email}`;
  await checkLoginRateLimit(rateKey);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordIsValid = Boolean(
    user?.passwordHash && (await verifyUserPassword(password, user.passwordHash)),
  );
  if (!user || !passwordIsValid) {
    await recordFailedLogin(rateKey);
    return null;
  }
  if (user.status === "pending") {
    throw new UserAuthError(403, "الحساب غير مفعّل. أكمل رمز البريد الإلكتروني.", "ACCOUNT_PENDING");
  }
  if (user.status === "suspended") {
    throw new UserAuthError(403, "هذا الحساب موقوف حاليًا. تواصل مع مدير التطبيق.", "ACCOUNT_SUSPENDED");
  }

  await db.delete(authLoginAttempts).where(eq(authLoginAttempts.key, rateKey));
  const [updated] = await db
    .update(users)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}
