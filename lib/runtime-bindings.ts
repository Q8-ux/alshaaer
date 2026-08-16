export type RuntimeBindings = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  USER_AUTH_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_API_KEY?: string;
  TWILIO_API_SECRET?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  AUTH_TEST_MODE?: string;
  GUEST_ACCESS_ENABLED?: string;
  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_DRAFT_MODEL?: string;
  OPENAI_POETRY_MODEL?: string;
};

const BINDINGS_KEY = "__ant_alshaer_runtime_bindings__";

type RuntimeGlobal = typeof globalThis & {
  [BINDINGS_KEY]?: RuntimeBindings;
};

export function setRuntimeBindings(bindings: RuntimeBindings) {
  (globalThis as RuntimeGlobal)[BINDINGS_KEY] = bindings;
}

export function getRuntimeBindings(): RuntimeBindings {
  const bindings = (globalThis as RuntimeGlobal)[BINDINGS_KEY];
  if (!bindings) {
    throw new Error("Runtime bindings are unavailable outside a Worker request.");
  }
  return bindings;
}

export function getRuntimeStringBinding(
  key: Exclude<keyof RuntimeBindings, "DB" | "BUCKET">,
) {
  const value = getRuntimeBindings()[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
