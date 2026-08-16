import OpenAI from "openai";
import { appErrorResponse, requireAppUser } from "@/lib/app-auth";
import {
  ArchiveError,
  markSubmissionFailed,
  saveAudioSubmission,
  saveTranscription,
} from "@/lib/archive-store";
import type { UserRecord } from "@/db/schema";
import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

export const runtime = "edge";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function getClient() {
  const apiKey = getRuntimeStringBinding("OPENAI_API_KEY");
  if (!apiKey) throw new Error("MISSING_API_KEY");
  return new OpenAI({ apiKey });
}

export async function POST(request: Request) {
  let activeUser: UserRecord | null = null;
  let activeSubmissionId: string | undefined;
  try {
    activeUser = await requireAppUser();
    const formData = await request.formData();
    const audio = formData.get("audio");
    const durationValue = Number(formData.get("duration_seconds") || 0);

    if (!(audio instanceof File)) {
      return Response.json({ error: "لم يصل تسجيل صوتي صالح." }, { status: 400 });
    }
    if (audio.size === 0) {
      return Response.json({ error: "التسجيل فارغ. سجّل قصتك ثم أوقف التسجيل." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "التسجيل أطول من الحد المتاح. اختصره إلى أقل من 25 ميغابايت." },
        { status: 413 },
      );
    }

    const saved = await saveAudioSubmission(activeUser, {
      file: audio,
      durationSeconds: Number.isFinite(durationValue) ? Math.max(0, Math.round(durationValue)) : 0,
    });
    activeSubmissionId = saved.submissionId;

    const transcription = await getClient().audio.transcriptions.create({
      file: audio,
      model: "gpt-transcribe",
      language: "ar",
      prompt:
        "هذا تسجيل باللهجة الكويتية أو الخليجية لحدث شخصي سيُحوّل لاحقًا إلى شعر نبطي. حافظ على أسماء الأشخاص والأماكن إن وردت، واكتب الكلام بالعربية بوضوح من غير تحويل اللهجة إلى فصحى متكلفة.",
    });

    const text = transcription.text?.trim();
    if (!text) {
      return Response.json({ error: "لم يظهر كلام واضح في التسجيل. جرّب في مكان أهدأ." }, { status: 422 });
    }

    await saveTranscription(activeUser.id, activeSubmissionId, text);
    return Response.json({ text, submission_id: activeSubmissionId });
  } catch (error) {
    if (activeUser && activeSubmissionId) {
      await markSubmissionFailed(activeUser.id, activeSubmissionId).catch(() => undefined);
    }
    if (
      error instanceof ArchiveError ||
      (error instanceof Error &&
        (error.message.includes("D1 binding") ||
          error.message.includes("R2 binding") ||
          error.message.includes("no such table")))
    ) {
      return appErrorResponse(error);
    }
    if (error instanceof Error && error.message === "MISSING_API_KEY") {
      return Response.json(
        { error: "خدمة التفريغ الصوتي غير متصلة حاليًا." },
        { status: 503 },
      );
    }
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        return Response.json(
          { error: "خدمة الصوت مشغولة الآن أو أن رصيدها يحتاج تفعيلًا. جرّب بعد قليل." },
          { status: 429 },
        );
      }
      if (error.status === 401) {
        return Response.json(
          { error: "تعذّر الاتصال بخدمة الصوت. إعداد المفتاح يحتاج مراجعة." },
          { status: 503 },
        );
      }
    }
    return Response.json(
      { error: "تعذّر فهم التسجيل. جرّب مرة أخرى بصوت أوضح." },
      { status: 500 },
    );
  }
}
