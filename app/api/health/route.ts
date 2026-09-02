import { getRuntimeBindings } from "@/lib/runtime-bindings";

export const runtime = "edge";

const hasValidSessionSecret = (secret: string | undefined) => {
  if (!secret || !/^[A-Za-z0-9_-]+$/.test(secret)) return false;
  try {
    const normalized = secret.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded).length >= 32;
  } catch {
    return false;
  }
};

export async function GET() {
  const bindings = getRuntimeBindings();
  const components = {
    database: Boolean(bindings.DB),
    audio_storage: Boolean(bindings.BUCKET),
    writing_engine: Boolean(bindings.OPENAI_API_KEY),
    session_security: hasValidSessionSecret(bindings.USER_AUTH_SECRET),
  };
  const ok = Object.values(components).every(Boolean);
  return Response.json(
    { ok, status: ok ? "ready" : "degraded", service: "ant-alshaer", components },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
