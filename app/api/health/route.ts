import { getRuntimeBindings } from "@/lib/runtime-bindings";

export const runtime = "edge";

export async function GET() {
  const bindings = getRuntimeBindings();
  const components = {
    database: Boolean(bindings.DB),
    audio_storage: Boolean(bindings.BUCKET),
    writing_engine: Boolean(bindings.OPENAI_API_KEY),
    session_security: Boolean(bindings.USER_AUTH_SECRET),
  };
  const ok = Object.values(components).every(Boolean);

  return Response.json(
    {
      ok,
      status: ok ? "ready" : "degraded",
      service: "ant-alshaer",
      components,
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
