import { z } from "zod";
import { findPendingUser, maskEmail, normalizeEmail } from "@/lib/user-auth";
import { sendEmailVerification, VerificationProviderError } from "@/lib/twilio-verify";

export const runtime = "edge";

const ResendSchema = z.object({ email: z.string().email().max(254) });

export async function POST(request: Request) {
  try {
    const { email } = ResendSchema.parse(await request.json());
    const user = await findPendingUser(email);
    if (!user || user.status !== "pending") {
      return Response.json(
        { error: "لا يوجد طلب تفعيل معلّق لهذا البريد." },
        { status: 404 },
      );
    }
    const verification = await sendEmailVerification(request, user.email);
    return Response.json({
      ok: true,
      email: normalizeEmail(user.email),
      maskedEmail: maskEmail(user.email),
      ...verification,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "أدخل بريدًا إلكترونيًا صالحًا." }, { status: 400 });
    }
    if (error instanceof VerificationProviderError) {
      return Response.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error("USER_RESEND_ERROR", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "تعذّر إعادة إرسال رمز التفعيل الآن." }, { status: 500 });
  }
}
