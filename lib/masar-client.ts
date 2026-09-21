import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

export type ResearchRequest = {
  query: string;
  urls: string[];
  discover: boolean;
  provider: "auto" | "web" | "browser" | "youtube" | "x" | "reddit";
  language: "ar" | "en";
  use_llm: boolean;
};

export class ResearchServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

function settings() {
  const baseUrl = getRuntimeStringBinding("MASAR_API_URL")?.replace(/\/+$/, "");
  const token = getRuntimeStringBinding("MASAR_ANT_ALSHAER_TOKEN");
  if (!baseUrl || !token || token.length < 32) {
    throw new ResearchServiceError(503, "خدمة بحث المصادر لم تُضبط بعد.");
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ResearchServiceError(503, "عنوان خدمة بحث المصادر غير صالح.");
  }
  const local = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    throw new ResearchServiceError(503, "عنوان خدمة بحث المصادر غير آمن.");
  }
  return { baseUrl, token };
}

async function request(path: string, init: RequestInit = {}) {
  const { baseUrl, token } = settings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (response.status === 429) {
      throw new ResearchServiceError(
        429,
        "بلغت طلبات البحث حدها المؤقت. أعد المحاولة بعد قليل.",
        response.headers.get("Retry-After") || "60",
      );
    }
    if (!response.ok) {
      throw new ResearchServiceError(502, "تعذّر إكمال البحث من الخدمة الخلفية.");
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new ResearchServiceError(502, "أعادت خدمة البحث نتيجة غير صالحة.");
    }
    return result as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ResearchServiceError) throw error;
    throw new ResearchServiceError(503, "خدمة بحث المصادر غير متاحة الآن.");
  } finally {
    clearTimeout(timer);
  }
}

export const getResearchCapabilities = () => request("/v1/capabilities");

export const analyzeResearchSources = (payload: ResearchRequest) =>
  request("/v1/analyze", { method: "POST", body: JSON.stringify(payload) });
