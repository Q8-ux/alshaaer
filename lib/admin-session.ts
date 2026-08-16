import { cookies } from "next/headers";
import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

export const ADMIN_SESSION_COOKIE = "ant_alshaer_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

type AdminSessionPayload = {
  email: string;
  exp: number;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

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

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
      key,
      256,
    ),
  );
}

function constantTimeEqual(actual: Uint8Array, expected: Uint8Array) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

async function sessionKey() {
  const secret = getRuntimeStringBinding("ADMIN_SESSION_SECRET");
  if (!secret) throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  try {
    const keyBytes = base64UrlToBytes(secret);
    if (keyBytes.length < 32) throw new Error("INVALID_SESSION_SECRET");
    return await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  } catch {
    throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  }
}

export async function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = normalizeEmail(getRuntimeStringBinding("ADMIN_EMAIL") || "");
  const storedHash = getRuntimeStringBinding("ADMIN_PASSWORD_HASH") || "";
  if (!expectedEmail || !storedHash) throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  if (normalizeEmail(email) !== expectedEmail) return false;

  const fields = storedHash.split("$");
  const algorithm = fields[0];

  if (algorithm === "hmac-sha256-v1") {
    if (fields.length !== 2 || !fields[1]) {
      throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
    }
    let expected: Uint8Array;
    try {
      expected = base64UrlToBytes(fields[1]);
    } catch {
      throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
    }
    if (expected.length !== 32) throw new Error("ADMIN_AUTH_NOT_CONFIGURED");

    const actual = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await sessionKey(),
        encoder.encode(`admin-password-v1:${password}`),
      ),
    );
    return constantTimeEqual(actual, expected);
  }

  const [, iterationText, saltText, expectedText] = fields;
  const iterations = Number(iterationText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    fields.length !== 4 ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !expectedText
  ) {
    throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64UrlToBytes(saltText);
    expected = base64UrlToBytes(expectedText);
  } catch {
    throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  }
  if (salt.length < 16 || expected.length !== 32) {
    throw new Error("ADMIN_AUTH_NOT_CONFIGURED");
  }

  const actual = await derivePasswordHash(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

export async function createAdminSessionToken(email: string) {
  const payload: AdminSessionPayload = {
    email: normalizeEmail(email),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await sessionKey(), encoder.encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload | null> {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await sessionKey(),
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as AdminSessionPayload;
    const expectedEmail = normalizeEmail(getRuntimeStringBinding("ADMIN_EMAIL") || "");
    if (
      !payload.email ||
      normalizeEmail(payload.email) !== expectedEmail ||
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

export async function getAdminSessionIdentity() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyAdminSessionToken(token);
  if (!session) return null;
  return {
    email: session.email,
    displayName: "مدير أنت الشاعر",
    fullName: "مدير أنت الشاعر",
  };
}

export function adminSessionCookie(
  token: string,
  maxAge = SESSION_TTL_SECONDS,
  secureCookie = false,
) {
  const secure = secureCookie ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
