import { ensureRuntimeSchema, getD1 } from "@/db";
import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

const SETTINGS_KEY = "twilio_verify_v1";
const encoder = new TextEncoder();
const ACCOUNT_SID_PATTERN = /^AC[a-z0-9]{32}$/i;
const SERVICE_SID_PATTERN = /^VA[a-z0-9]{32}$/i;
const AUTH_TOKEN_PATTERN = /^[a-z0-9]{16,128}$/i;

export type TwilioVerifyCredentials = {
  username: string;
  password: string;
  serviceSid: string;
  source: "environment" | "secure_storage";
};

export type TwilioVerifyConfigurationStatus = {
  configured: boolean;
  source: "environment" | "secure_storage" | null;
};

export type TwilioAccountConfiguration = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
};

type StoredConfiguration = TwilioAccountConfiguration & {
  version: 1;
};

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

function normalizeConfiguration(input: TwilioAccountConfiguration): TwilioAccountConfiguration | null {
  const accountSid = input.accountSid.trim();
  const authToken = input.authToken.trim();
  const serviceSid = input.serviceSid.trim();
  if (
    !ACCOUNT_SID_PATTERN.test(accountSid) ||
    !AUTH_TOKEN_PATTERN.test(authToken) ||
    !SERVICE_SID_PATTERN.test(serviceSid)
  ) {
    return null;
  }
  return { accountSid, authToken, serviceSid };
}

function secretBytes() {
  const secret = getRuntimeStringBinding("USER_AUTH_SECRET");
  if (!secret) throw new Error("TWILIO_SETTINGS_SECRET_UNAVAILABLE");
  try {
    const bytes = base64UrlToBytes(secret);
    if (bytes.length < 32) throw new Error("short secret");
    return bytes;
  } catch {
    throw new Error("TWILIO_SETTINGS_SECRET_UNAVAILABLE");
  }
}

async function encryptionKey() {
  const masterKey = await crypto.subtle.importKey(
    "raw",
    secretBytes() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      masterKey,
      encoder.encode("ant-alshaer/twilio-verify-settings-encryption/v1"),
    ),
  );
  return crypto.subtle.importKey("raw", derived as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptConfiguration(configuration: TwilioAccountConfiguration) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      await encryptionKey(),
      encoder.encode(JSON.stringify({ version: 1, ...configuration } satisfies StoredConfiguration)),
    ),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

async function decryptConfiguration(value: string): Promise<TwilioAccountConfiguration | null> {
  const [version, ivText, encryptedText] = value.split(".");
  if (version !== "v1" || !ivText || !encryptedText) return null;
  try {
    const decoded = new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlToBytes(ivText) as BufferSource },
        await encryptionKey(),
        base64UrlToBytes(encryptedText) as BufferSource,
      ),
    );
    const parsed = JSON.parse(decoded) as Partial<StoredConfiguration>;
    if (parsed.version !== 1 || !parsed.accountSid || !parsed.authToken || !parsed.serviceSid) {
      return null;
    }
    return normalizeConfiguration({
      accountSid: parsed.accountSid,
      authToken: parsed.authToken,
      serviceSid: parsed.serviceSid,
    });
  } catch {
    return null;
  }
}

function environmentConfiguration(): TwilioVerifyCredentials | null {
  const apiKey = getRuntimeStringBinding("TWILIO_API_KEY");
  const apiSecret = getRuntimeStringBinding("TWILIO_API_SECRET");
  const accountSid = getRuntimeStringBinding("TWILIO_ACCOUNT_SID");
  const authToken = getRuntimeStringBinding("TWILIO_AUTH_TOKEN");
  const serviceSid = getRuntimeStringBinding("TWILIO_VERIFY_SERVICE_SID");
  const username = apiKey && apiSecret ? apiKey : accountSid;
  const password = apiKey && apiSecret ? apiSecret : authToken;
  if (!username || !password || !serviceSid) return null;
  return { username, password, serviceSid, source: "environment" };
}

async function storedConfiguration() {
  await ensureRuntimeSchema();
  const row = await getD1()
    .prepare("SELECT encrypted_value FROM integration_settings WHERE key = ?")
    .bind(SETTINGS_KEY)
    .first<{ encrypted_value: string }>();
  if (!row?.encrypted_value) return null;
  return decryptConfiguration(row.encrypted_value);
}

export async function getTwilioVerifyCredentials(): Promise<TwilioVerifyCredentials | null> {
  const fromEnvironment = environmentConfiguration();
  if (fromEnvironment) return fromEnvironment;
  const stored = await storedConfiguration();
  if (!stored) return null;
  return {
    username: stored.accountSid,
    password: stored.authToken,
    serviceSid: stored.serviceSid,
    source: "secure_storage",
  };
}

export async function getTwilioVerifyConfigurationStatus(): Promise<TwilioVerifyConfigurationStatus> {
  const configuration = await getTwilioVerifyCredentials();
  return {
    configured: Boolean(configuration),
    source: configuration?.source || null,
  };
}

export async function saveTwilioAccountConfiguration(input: TwilioAccountConfiguration) {
  const configuration = normalizeConfiguration(input);
  if (!configuration) throw new Error("INVALID_TWILIO_CONFIGURATION");
  await ensureRuntimeSchema();
  const encryptedValue = await encryptConfiguration(configuration);
  await getD1()
    .prepare(
      "INSERT INTO integration_settings (key, encrypted_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = excluded.updated_at",
    )
    .bind(SETTINGS_KEY, encryptedValue, new Date().toISOString())
    .run();
}
