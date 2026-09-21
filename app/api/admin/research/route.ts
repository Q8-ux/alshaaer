import { z } from "zod";
import { appErrorResponse, requireAdminUser } from "@/lib/app-auth";
import {
  analyzeResearchSources,
  getResearchCapabilities,
  ResearchServiceError,
} from "@/lib/masar-client";

export const runtime = "edge";

const ResearchRequestSchema = z
  .object({
    query: z.string().trim().min(3).max(1500),
    urls: z.array(z.string().url().refine((value) => value.startsWith("https://"))).max(8).default([]),
    discover: z.boolean().default(false),
    provider: z.enum(["auto", "web", "browser", "youtube", "x", "reddit"]).default("auto"),
    language: z.enum(["ar", "en"]).default("ar"),
    use_llm: z.boolean().default(false),
  })
  .refine((value) => value.discover || value.urls.length > 0, {
    message: "أضف رابط مصدر واحدًا على الأقل أو فعّل اكتشاف المصادر.",
  });

function researchErrorResponse(error: unknown) {
  if (error instanceof ResearchServiceError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: error.retryAfter ? { "Retry-After": error.retryAfter } : undefined,
      },
    );
  }
  return appErrorResponse(error);
}

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await getResearchCapabilities());
  } catch (error) {
    return researchErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const payload = ResearchRequestSchema.parse(await request.json());
    return Response.json(await analyzeResearchSources(payload));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message || "راجع سؤال البحث وروابط المصادر." },
        { status: 400 },
      );
    }
    return researchErrorResponse(error);
  }
}
